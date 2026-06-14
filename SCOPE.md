# Assignment Scope & Database Schema

This document details the CSV importer anomaly mapping rules and the full Prisma database schema used by SplitSmart.

## CSV Import Anomaly Log Matrix

The CSV importer runs 18 distinct validations for every row parsed. The table below documents each case:

| Row / Case | Anomaly Type | Raw Value (Examples) | Detection Logic | Policy Applied / Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `DUPLICATE_EXPENSE` | Rows 5 & 6: "Dinner at Marina Bites" vs "dinner - marina bites" | Matches same date, same payer, same amount, and similar descriptions (low edit distance or shared tokens). | Set status to `pending_review`. Appears in the Import Wizard review table for Meera-style user approval before deleting or keeping. |
| **2** | `COMMA_IN_AMOUNT` | Row 7: amount `"1,200"` | Check if the amount string contains a comma `,`. | Strips commas and converts to float. Flagged as minor anomaly (requires no manual approval). |
| **3** | `SETTLEMENT_LOGGED_AS_EXPENSE` | Row 14: "Rohan paid Aisha back" (Note: "this is a settlement...") | Description or notes contain words like "paid back", "settlement", "settle", "repay". | Flags as settlement, changes status to `pending_review`, and requires approval to write to the `settlements` table instead of `expenses`. |
| **4** | `INCONSISTENT_DATE_FORMAT` | Row 27: `"Mar 14"` (or DD/MM/YYYY) | Date format does not match `YYYY-MM-DD` standard. | Tries multiple date parsing schemes. If "Mar 14", assume current year (2026). Normalizes date format to YYYY-MM-DD. |
| **5** | `INVALID_PERCENTAGE_SUM` | Row 15: sum 110% (Pizza Friday) | Split type is percentage, but sum of split percentages is not equal to 100. | Flagged as anomaly, requires manual override/correction, and sets status to `pending_review`. |
| **6** | `MISSING_PAID_BY` | Row 13: Paid By empty | Paid By column value is empty or only whitespace. | Flags as anomaly, sets status to `pending_review`, requiring user to choose a payer. |
| **7** | `NEGATIVE_AMOUNT_REFUND` | Row 26: `"-30 USD"` | Parsed float amount is less than 0. | Treated as refund: reverses split math (credits split users and debits payer). Auto-applied. |
| **8** | `UNKNOWN_PERSON_IN_SPLIT` | Row 23: `"Dev's friend Kabir"` | Split details contain a name not matching any user in the database/group. | Creates a placeholder user `"Kabir (Placeholder)"` and adds them to group memberships. Flags for approval. |
| **9** | `AMBIGUOUS_DATE` | Row 34: `"04/05/2026"` | Date string format is slash-separated with both day and month values <= 12. | Defaults to `DD/MM/YYYY` (May 4th) to match March rows. Flags for user confirmation in review table. |
| **10** | `MISSING_CURRENCY` | Row 28: empty currency | Currency column is empty or only whitespace. | Defaults currency to `"INR"`. Flags anomaly (requires no manual approval). |
| **11** | `WHITESPACE_IN_AMOUNT` | Row 29: `" 1450 "` | Amount string contains leading/trailing whitespaces. | Trims whitespaces and parses float. Flags anomaly (requires no manual approval). |
| **12** | `ZERO_AMOUNT` | Row 31: amount `0` | Parsed float amount is exactly 0. | Kept in records for historical logs, but skipped from all balance & settlement calculations. |
| **13** | `CONFLICTING_DUPLICATE` | Rows 24 & 25: "Thalassa dinner" (2400 vs 2450) | Matches same date and similar description, but different amount or payers. | Flags both entries, sets both to `pending_review`, and presents side-by-side in the review UI for the user to select which to keep. |
| **14** | `MEMBER_INCLUDED_AFTER_LEAVING` | Row 36: Meera split on April 2 | Split details contain user whose `left_at` timeline date is prior to the `expense_date`. | Removes left member from the split list and redistributes amount among other active members. Flags anomaly. |
| **15** | `SPLIT_TYPE_MISMATCH` | Row 42: equal split with share counts | Split type is labeled as "equal" but details contain custom shares (e.g. `Aisha:2`). | Detail counts take precedence: treats split as `share` type instead of `equal`. |
| **16** | `SHARE_SPLIT_TYPE` | Rows 22, 35, 42 | Split type is `share` or parsed as share. | Computes user split as: `user_amount = (user_shares / total_shares) * total_amount`. |
| **17** | `PAYER_NAME_CASING` | Rows 9, 11, 27: "priya", "Priya S" | Payer name does not match database user exactly, but matches case-insensitively or contains surname. | Normalizes via case-insensitive matching. Flags "Priya S" as ambiguous and matches to "Priya" (if she is the only match). |
| **18** | `SAM_DEPOSIT_SETTLEMENT` | Row 38: "Sam deposit share" | Description indicates "deposit" paid directly from one member to another. | Treated as settlement, flags as anomaly, and requires approval to move to `settlements` table instead of `expenses`. |

---

## Database Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum SplitType {
  equal
  unequal
  percentage
  share
}

enum ExpenseStatus {
  active
  deleted
  pending_review
}

model User {
  id                Int                @id @default(autoincrement())
  name              String
  email             String             @unique
  password_hash     String
  created_at        DateTime           @default(now())
  memberships       GroupMembership[]
  expenses_paid     Expense[]          @relation("Payer")
  expense_splits    ExpenseSplit[]
  settlements_paid  Settlement[]       @relation("SettlementPayer")
  settlements_rec   Settlement[]       @relation("SettlementRecipient")
  approved_anomalies ImportAnomaly[]   @relation("ApprovedBy")

  @@map("users")
}

model Group {
  id            Int                @id @default(autoincrement())
  name          String
  created_at    DateTime           @default(now())
  memberships   GroupMembership[]
  expenses      Expense[]
  settlements   Settlement[]

  @@map("groups")
}

model GroupMembership {
  id         Int       @id @default(autoincrement())
  user_id    Int
  group_id   Int
  joined_at  DateTime  @default(now())
  left_at    DateTime?
  
  user       User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  group      Group     @relation(fields: [group_id], references: [id], onDelete: Cascade)

  @@unique([user_id, group_id])
  @@map("group_memberships")
}

model Expense {
  id                 Int             @id @default(autoincrement())
  group_id           Int
  description        String
  paid_by_user_id    Int
  amount_original    Float
  currency_original  String
  amount_inr         Float
  exchange_rate_used Float
  split_type         SplitType
  expense_date       DateTime
  created_at         DateTime        @default(now())
  is_settlement      Boolean         @default(false)
  import_batch_id    Int?
  status             ExpenseStatus   @default(active)

  group              Group           @relation(fields: [group_id], references: [id], onDelete: Cascade)
  payer              User            @relation("Payer", fields: [paid_by_user_id], references: [id])
  import_batch       ImportBatch?    @relation(fields: [import_batch_id], references: [id])
  splits             ExpenseSplit[]

  @@map("expenses")
}

model ExpenseSplit {
  id          Int      @id @default(autoincrement())
  expense_id  Int
  user_id     Int
  amount_inr  Float
  percentage  Float?
  shares      Float?

  expense     Expense  @relation(fields: [expense_id], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@map("expense_splits")
}

model Settlement {
  id              Int      @id @default(autoincrement())
  group_id        Int
  paid_by_user_id Int
  paid_to_user_id Int
  amount_inr      Float
  settled_at      DateTime @default(now())

  group           Group    @relation(fields: [group_id], references: [id], onDelete: Cascade)
  payer           User     @relation("SettlementPayer", fields: [paid_by_user_id], references: [id])
  recipient       User     @relation("SettlementRecipient", fields: [paid_to_user_id], references: [id])

  @@map("settlements")
}

model ImportBatch {
  id             Int             @id @default(autoincrement())
  filename       String
  imported_at    DateTime        @default(now())
  anomaly_report Json
  expenses       Expense[]
  anomalies      ImportAnomaly[]

  @@map("import_batches")
}

model ImportAnomaly {
  id                Int          @id @default(autoincrement())
  import_batch_id   Int
  row_number        Int
  raw_row           Json
  anomaly_type      String
  description       String
  action_taken      String
  requires_approval Boolean
  approved_by       Int?
  approved_at       DateTime?

  import_batch      ImportBatch  @relation(fields: [import_batch_id], references: [id], onDelete: Cascade)
  approver          User?        @relation("ApprovedBy", fields: [approved_by], references: [id])

  @@map("import_anomalies")
}
```
