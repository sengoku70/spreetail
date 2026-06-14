# Engineering Decisions Log

This document records the key architectural choices and policies implemented in SplitSmart.

---

## 1. Split Type Calculations

*   **Options Considered**:
    *   *Option A*: Direct database column storage of dynamic JSON structures representing splits.
    *   *Option B*: Dedicated child table (`expense_splits`) containing normalized row splits with separate percentage and shares columns.
*   **Choice**: *Option B (Dedicated normalized child table)*
*   **Reason**: Using a relational table allows database-level query optimization, indexing, cascades, and straightforward balance aggregations. Storing the specific share/percentage weights on each row keeps a perfect mathematical audit trail of how the split was resolved, meeting Rohan's requirements.

---

## 2. Negative Amount (Refund) Policy

*   **Options Considered**:
    *   *Option A*: Throw error / Reject negative expense amounts during CSV importing.
    *   *Option B*: Reverse the split mathematics (payer gets credited negative amount, which increases debt; split members receive credit).
*   **Choice**: *Option B (Reversed splits)*
*   **Reason**: Refunds represent a reverse expense: the payer gets the absolute amount back, and split members receive a credit (amount is subtracted from their dues). Reversing the splits automatically implements this without creating special refund models.

---

## 3. Conflicting Duplicate Policy

*   **Options Considered**:
    *   *Option A*: Individual "Approve Keep" or "Discard" actions for both rows, providing granular flexibility.
    *   *Option B*: Side-by-side radio toggle interface where selecting one automatically discards the other.
*   **Choice**: *Option A (Individual actions with alignment details)*
*   **Reason**: While a toggle selector (Option B) makes picking one row simple, individual action buttons are more flexible. For instance, if flatmates actually spent money twice on the same night and want to keep both, or if both entries are incorrect and they want to discard both, individual buttons allow this control without forcing a binary choice.

---

## 4. Membership Date Filtering (Sam & Meera)

*   **Options Considered**:
    *   *Option A*: Calculate balances over all expenses and apply a retroactive discount to users who joined late.
    *   *Option B*: Filter out any expense splits and payments where `expense_date` is outside the user's `joined_at` and `left_at` bounds.
*   **Choice**: *Option B (Time-bounded window filtering)*
*   **Reason**: Date-filtering on a membership level is robust and future-proof. Since Sam joined mid-April, expenses before his `joined_at` date do not resolve into splits for him. Since Meera left end of March, expenses after her `left_at` do not affect her balance. This ensures correct balances for everyone. If a CSV import contains a split for a member outside their active window, they are automatically excluded from the split divisor, and the remaining portion is redistributed among active members.

---

## 5. Currency Conversion Approach

*   **Options Considered**:
    *   *Option A*: hardcode constant rates (e.g. USD = 83 INR) in code.
    *   *Option B*: Dynamic live API fetch with DB caching (checks if another expense exists on the same day in USD, uses its rate, otherwise queries ExchangeRate-API history endpoint).
*   **Choice**: *Option B (Live API with DB caching)*
*   **Reason**: Meets Priya's requirement for correct USD→INR conversion at the date of each expense, and avoids repetitive external API calls by caching rates in the database (re-using the rate on matching date expenses, keeping the database schema compact).
