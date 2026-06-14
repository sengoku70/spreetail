import { PrismaClient } from '@prisma/client';
import { getExchangeRate } from './currencyService.js';

const prisma = new PrismaClient();

// Custom CSV Parser
export function parseCSV(content) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentValue = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentValue);
      currentValue = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentValue);
      lines.push(row);
      row = [];
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  if (row.length > 0 || currentValue !== '') {
    row.push(currentValue);
    lines.push(row);
  }

  if (lines.length === 0) return [];

  // Parse headers case-insensitively to map indices
  // Support both "date" and "for date" (row 1 modified to "for date" in csv)
  const headers = lines[0].map(h => h.trim().toLowerCase());
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const descIdx = headers.indexOf('description');
  const paidByIdx = headers.indexOf('paid_by') !== -1 ? headers.indexOf('paid_by') : headers.indexOf('paid by');
  const amountIdx = headers.indexOf('amount');
  const currencyIdx = headers.indexOf('currency');
  const splitTypeIdx = headers.indexOf('split_type') !== -1 ? headers.indexOf('split_type') : headers.indexOf('split type');
  const splitWithIdx = headers.indexOf('split_with') !== -1 ? headers.indexOf('split_with') : headers.indexOf('split with');
  const splitDetailsIdx = headers.indexOf('split_details') !== -1 ? headers.indexOf('split_details') : headers.indexOf('split details');
  const notesIdx = headers.indexOf('notes') !== -1 ? headers.indexOf('notes') : headers.indexOf('remarks');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0 || (line.length === 1 && line[0].trim() === '')) continue;
    
    rows.push({
      date: dateIdx !== -1 && line[dateIdx] ? line[dateIdx].trim() : '',
      description: descIdx !== -1 && line[descIdx] ? line[descIdx].trim() : '',
      paid_by: paidByIdx !== -1 && line[paidByIdx] ? line[paidByIdx].trim() : '',
      amount: amountIdx !== -1 && line[amountIdx] ? line[amountIdx] : '',
      currency: currencyIdx !== -1 && line[currencyIdx] ? line[currencyIdx].trim() : '',
      split_type: splitTypeIdx !== -1 && line[splitTypeIdx] ? line[splitTypeIdx].trim() : '',
      split_with: splitWithIdx !== -1 && line[splitWithIdx] ? line[splitWithIdx].trim() : '',
      split_details: splitDetailsIdx !== -1 && line[splitDetailsIdx] ? line[splitDetailsIdx].trim() : '',
      notes: notesIdx !== -1 && line[notesIdx] ? line[notesIdx].trim() : ''
    });
  }

  return rows;
}

// Normalize descriptions for similarity match
function normalizeDescription(desc) {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function areDescriptionsSimilar(desc1, desc2) {
  const n1 = normalizeDescription(desc1);
  const n2 = normalizeDescription(desc2);
  if (n1 === n2) return true;
  const t1 = n1.split(' ');
  const t2 = n2.split(' ');
  const common = t1.filter(t => t.length > 2 && t2.includes(t));
  return common.length >= 2;
}

// Normalize payer names
function matchUserByName(name, allUsers) {
  const cleanName = name.trim().toLowerCase();
  if (!cleanName) {
    return { user: null, isAmbiguous: false, normalizedName: '' };
  }

  // Exact or close match
  const matches = allUsers.filter(u => {
    const uName = u.name.toLowerCase();
    return uName === cleanName || uName.startsWith(cleanName) || cleanName.startsWith(uName);
  });

  if (matches.length === 1) {
    return { user: matches[0], isAmbiguous: false, normalizedName: matches[0].name };
  } else if (matches.length > 1) {
    return { user: matches[0], isAmbiguous: true, normalizedName: matches[0].name };
  }

  // Try parsing something like "Priya S" to match "Priya"
  const firstName = cleanName.split(' ')[0];
  const firstMatches = allUsers.filter(u => u.name.toLowerCase() === firstName);
  if (firstMatches.length === 1) {
    return { user: firstMatches[0], isAmbiguous: true, normalizedName: firstMatches[0].name };
  }

  return { user: null, isAmbiguous: false, normalizedName: name };
}

// Parse semicolon-separated split details
export function parseSplitDetails(detailsStr) {
  if (!detailsStr) return [];
  return detailsStr.split(';').map(part => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const lastSpaceIdx = trimmed.lastIndexOf(' ');
    if (lastSpaceIdx === -1) {
      return { name: trimmed, value: null };
    }
    const name = trimmed.substring(0, lastSpaceIdx).trim();
    let valStr = trimmed.substring(lastSpaceIdx + 1).trim();
    valStr = valStr.replace('%', '');
    const value = parseFloat(valStr);
    return { name, value: isNaN(value) ? null : value };
  }).filter(Boolean);
}

// Parse semicolon-separated list of split_with names
export function parseSplitWith(splitWithStr) {
  if (!splitWithStr) return [];
  return splitWithStr.split(';').map(name => ({
    name: name.trim(),
    value: null
  })).filter(s => s.name);
}

// Robust Date Parser
export function parseDate(dateStr) {
  let cleanStr = dateStr.trim();
  if (!cleanStr) return { date: null, isAmbiguous: false, normalizedStr: '' };

  const slashMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10);
    const part2 = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    if (part1 <= 12 && part2 <= 12) {
      const date = new Date(year, part2 - 1, part1);
      return { date, isAmbiguous: true, normalizedStr: `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}` };
    }

    if (part1 > 12) {
      const date = new Date(year, part2 - 1, part1);
      return { date, isAmbiguous: false, normalizedStr: `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}` };
    }

    const date = new Date(year, part1 - 1, part2);
    return { date, isAmbiguous: false, normalizedStr: `${year}-${String(part1).padStart(2, '0')}-${String(part2).padStart(2, '0')}` };
  }

  const mmmDdMatch = cleanStr.match(/^([A-Za-z]+)\s*(\d{1,2})$/);
  if (mmmDdMatch) {
    const monthStr = mmmDdMatch[1].toLowerCase();
    const day = parseInt(mmmDdMatch[2], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIdx = months.findIndex(m => monthStr.startsWith(m));
    if (monthIdx !== -1) {
      const date = new Date(2026, monthIdx, day);
      return { date, isAmbiguous: false, normalizedStr: `2026-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
    }
  }

  const parsedTime = Date.parse(cleanStr);
  if (!isNaN(parsedTime)) {
    const date = new Date(parsedTime);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return { date, isAmbiguous: false, normalizedStr: `${y}-${m}-${d}` };
  }

  return { date: null, isAmbiguous: false, normalizedStr: '' };
}

export async function runImportPipeline(groupId, filename, csvContent) {
  const rows = parseCSV(csvContent);
  const errors = [];
  
  const fileHash = Buffer.from(csvContent).toString('base64').substring(0, 32);

  const batch = await prisma.importBatch.create({
    data: {
      filename,
      anomaly_report: { hash: fileHash }
    }
  });

  const allUsers = await prisma.user.findMany();
  const groupMemberships = await prisma.groupMembership.findMany({
    where: { group_id: groupId },
    include: { user: true }
  });

  const parsedExpenses = [];
  const parsedSettlements = [];
  const anomaliesToCreate = [];

  const addAnomaly = (rowNum, rawRow, type, desc, action, requiresApproval) => {
    anomaliesToCreate.push({
      import_batch_id: batch.id,
      row_number: rowNum,
      raw_row: rawRow,
      anomaly_type: type,
      description: desc,
      action_taken: action,
      requires_approval: requiresApproval
    });
  };

  for (let i = 0; i < rows.length; i++) {
    const csvRow = rows[i];
    const rowNum = i + 2;
    
    try {
      const anomalies = [];
      let isSettlement = false;
      let status = 'active';

      let rawAmt = csvRow.amount;
      let amountParsed = 0;
      
      if (rawAmt.trim() !== rawAmt) {
        anomalies.push({
          type: 'WHITESPACE_IN_AMOUNT',
          description: `Amount '${rawAmt}' has leading/trailing whitespaces.`,
          action_taken: 'Trimmed whitespace.',
          requires_approval: false
        });
        rawAmt = rawAmt.trim();
      }

      // Strips ONLY commas from the amount string
      let commaStripped = false;
      if (rawAmt.includes(',')) {
        anomalies.push({
          type: 'COMMA_IN_AMOUNT',
          description: `Amount '${rawAmt}' contains commas.`,
          action_taken: 'Removed commas.',
          requires_approval: false
        });
        rawAmt = rawAmt.replace(/,/g, '');
        commaStripped = true;
      }

      // Check if there are other invalid characters besides digits and decimal
      const cleanAmtTest = rawAmt.replace(/\"/g, '').trim();
      const hasOtherCharacters = !/^\-?\d+(\.\d+)?$/.test(cleanAmtTest);

      if (hasOtherCharacters) {
        anomalies.push({
          type: 'INVALID_AMOUNT_FORMAT',
          description: `Amount '${csvRow.amount}' contains invalid characters (non-numeric).`,
          action_taken: 'Flagged for highlight on site.',
          requires_approval: true
        });
        status = 'pending_review';
      }

      amountParsed = parseFloat(rawAmt);
      if (isNaN(amountParsed)) {
        addAnomaly(rowNum, csvRow, 'INVALID_AMOUNT', `Amount '${csvRow.amount}' is not a valid number`, 'Failed to parse row.', true);
        errors.push(`Row ${rowNum}: Invalid amount format.`);
        continue;
      }

      if (amountParsed === 0) {
        anomalies.push({
          type: 'ZERO_AMOUNT',
          description: `Amount is zero. Note indicates: '${csvRow.notes}'`,
          action_taken: 'Skipped from balance calculations but kept record.',
          requires_approval: false
        });
      }

      const isRefund = amountParsed < 0;
      if (isRefund) {
        anomalies.push({
          type: 'NEGATIVE_AMOUNT_REFUND',
          description: `Amount is negative (${amountParsed}).`,
          action_taken: 'Treated as refund. Splits reversed.',
          requires_approval: false
        });
      }

      const { date, isAmbiguous, normalizedStr } = parseDate(csvRow.date);
      let expenseDate = date;
      if (!expenseDate) {
        addAnomaly(rowNum, csvRow, 'MISSING_DATE', `Date '${csvRow.date}' could not be parsed`, 'Skipped row.', true);
        errors.push(`Row ${rowNum}: Invalid date format.`);
        continue;
      }

      if (csvRow.date !== normalizedStr) {
        if (isAmbiguous) {
          anomalies.push({
            type: 'AMBIGUOUS_DATE',
            description: `Date '${csvRow.date}' is ambiguous (could be MM/DD or DD/MM). Note: '${csvRow.notes}'`,
            action_taken: `Defaulted to DD/MM/YYYY. Date parsed as ${normalizedStr}.`,
            requires_approval: true
          });
          status = 'pending_review';
        } else {
          anomalies.push({
            type: 'INCONSISTENT_DATE_FORMAT',
            description: `Date '${csvRow.date}' uses inconsistent date formatting.`,
            action_taken: `Normalized date format to ${normalizedStr}.`,
            requires_approval: false
          });
        }
      }

      const notesLower = csvRow.notes.toLowerCase();
      const descLower = csvRow.description.toLowerCase();

      const isRohanSettlement = descLower.includes('paid') && descLower.includes('back');
      const isDeposit = descLower.includes('deposit') || notesLower.includes('deposit');
      const isSettlementNote = notesLower.includes('settlement') || notesLower.includes('not an expense');
      
      if (isRohanSettlement || isSettlementNote || isDeposit) {
        isSettlement = true;
        const type = isDeposit ? 'SAM_DEPOSIT_SETTLEMENT' : 'SETTLEMENT_LOGGED_AS_EXPENSE';
        anomalies.push({
          type,
          description: `Row detected as settlement/deposit instead of expense: '${csvRow.description}'`,
          action_taken: 'Moved to settlements table.',
          requires_approval: true
        });
        status = 'pending_review';
      }

      let currency = csvRow.currency.trim().toUpperCase();
      if (!currency) {
        currency = 'INR';
        anomalies.push({
          type: 'MISSING_CURRENCY',
          description: 'Currency field is empty.',
          action_taken: 'Defaulted currency to INR.',
          requires_approval: false
        });
      }

      let rateUsed = 1.0;
      if (currency === 'USD') {
        rateUsed = await getExchangeRate(expenseDate);
      }

      const amountINR = amountParsed * rateUsed;

      let payerId = null;
      let payerNameClean = '';

      if (!csvRow.paid_by.trim()) {
        anomalies.push({
          type: 'MISSING_PAID_BY',
          description: 'Paid By field is empty.',
          action_taken: 'Set status to pending review.',
          requires_approval: true
        });
        status = 'pending_review';
      } else {
        const { user: matchedUser, isAmbiguous: isPayerAmbiguous, normalizedName } = matchUserByName(csvRow.paid_by, allUsers);
        if (matchedUser) {
          payerId = matchedUser.id;
          payerNameClean = normalizedName;
          
          if (csvRow.paid_by !== normalizedName) {
            anomalies.push({
              type: 'PAYER_NAME_CASING',
              description: `Payer name '${csvRow.paid_by}' does not match exactly. Verify if they are the same person.`,
              action_taken: `Confirm same name. Normalized to '${normalizedName}'.`,
              requires_approval: true // Enforces user confirmation for name discrepancies (e.g. Priya S -> Priya)
            });
            status = 'pending_review';
          }
        } else {
          const newName = csvRow.paid_by.trim();
          let newUser = await prisma.user.findFirst({
            where: { name: newName }
          });
          if (!newUser) {
            newUser = await prisma.user.create({
              data: {
                name: newName,
                email: `${newName.toLowerCase().replace(/[^a-z0-9]/g, '')}@spreetail.com`,
                password_hash: 'default_hash'
              }
            });
            await prisma.groupMembership.create({
              data: {
                user_id: newUser.id,
                group_id: groupId,
                joined_at: new Date('2026-02-01')
              }
            });
          }
          
          allUsers.push(newUser);
          groupMemberships.push({ user_id: newUser.id, group_id: groupId, user: newUser, joined_at: new Date('2026-02-01') });
          payerId = newUser.id;
          payerNameClean = newUser.name;
        }
      }

      let splitTypeClean = 'equal';
      const rawSplitType = csvRow.split_type.toLowerCase();

      if (rawSplitType.includes('percent')) {
        splitTypeClean = 'percentage';
      } else if (rawSplitType.includes('unequal') || rawSplitType.includes('fixed')) {
        splitTypeClean = 'unequal';
      } else if (rawSplitType.includes('share')) {
        splitTypeClean = 'share';
      } else {
        splitTypeClean = 'equal';
      }

      let parsedSplits = [];
      if (csvRow.split_details) {
        parsedSplits = parseSplitDetails(csvRow.split_details);
      } else if (csvRow.split_with) {
        parsedSplits = parseSplitWith(csvRow.split_with);
      }

      const hasSplitDetailsWithValues = parsedSplits.some(s => s.value !== null);

      if (splitTypeClean === 'equal' && hasSplitDetailsWithValues) {
        splitTypeClean = 'share';
        anomalies.push({
          type: 'SPLIT_TYPE_MISMATCH',
          description: `Split type was specified as 'equal' but split details contain numeric weights.`,
          action_taken: `Treated as 'share' split.`,
          requires_approval: false
        });
      }

      const cleanSplits = [];
      let totalPercentage = 0;
      let totalShares = 0;

      for (const split of parsedSplits) {
        const { user: splitUser, isAmbiguous: isSplitAmbiguous, normalizedName } = matchUserByName(split.name, allUsers);
        let activeUserId;

        if (!splitUser) {
          const newName = split.name.trim();
          let newUser = await prisma.user.findFirst({
            where: { name: newName }
          });
          if (!newUser) {
            newUser = await prisma.user.create({
              data: {
                name: newName,
                email: `${newName.toLowerCase().replace(/[^a-z0-9]/g, '')}@spreetail.com`,
                password_hash: 'default_hash'
              }
            });
            await prisma.groupMembership.create({
              data: {
                user_id: newUser.id,
                group_id: groupId,
                joined_at: new Date('2026-02-01')
              }
            });
          }
          
          allUsers.push(newUser);
          groupMemberships.push({ user_id: newUser.id, group_id: groupId, user: newUser, joined_at: new Date('2026-02-01') });
          activeUserId = newUser.id;
        } else {
          activeUserId = splitUser.id;
        }

        const membership = groupMemberships.find(m => m.user_id === activeUserId);
        if (membership && membership.left_at && expenseDate > membership.left_at) {
          anomalies.push({
            type: 'MEMBER_INCLUDED_AFTER_LEAVING',
            description: `Member '${split.name}' was included in split on date ${normalizedStr} after leaving the group on ${membership.left_at.toISOString().split('T')[0]}.`,
            action_taken: `Removed member '${split.name}' from the split and recalculated.`,
            requires_approval: false
          });
          continue;
        }

        if (splitTypeClean === 'percentage') {
          totalPercentage += split.value || 0;
        } else if (splitTypeClean === 'share') {
          totalShares += split.value || 0;
        }

        cleanSplits.push({
          user_id: activeUserId,
          percentage: splitTypeClean === 'percentage' ? (split.value || 0) : null,
          shares: splitTypeClean === 'share' ? (split.value || 0) : null,
          amount_inr: 0
        });
      }

      if (splitTypeClean === 'percentage' && Math.abs(totalPercentage - 100) > 0.01) {
        anomalies.push({
          type: 'INVALID_PERCENTAGE_SUM',
          description: `Percentages sum to ${totalPercentage}% instead of 100%.`,
          action_taken: 'Flagged for user correction. Splits are zeroed out until reviewed.',
          requires_approval: true
        });
        status = 'pending_review';
      }

      if (status !== 'pending_review' || !anomalies.some(a => a.type === 'INVALID_PERCENTAGE_SUM')) {
        if (splitTypeClean === 'equal') {
          const activeSplitUsers = cleanSplits.length > 0 ? cleanSplits.map(s => s.user_id) : groupMemberships.filter(m => !m.left_at || expenseDate <= m.left_at).map(m => m.user_id);
          const divisor = activeSplitUsers.length;
          
          cleanSplits.length = 0;
          activeSplitUsers.forEach(uid => {
            cleanSplits.push({
              user_id: uid,
              percentage: divisor > 0 ? (100 / divisor) : 0,
              shares: 1,
              amount_inr: divisor > 0 ? (amountINR / divisor) : 0
            });
          });
        } else if (splitTypeClean === 'percentage') {
          cleanSplits.forEach(s => {
            s.amount_inr = (s.percentage || 0) / 100 * amountINR;
          });
        } else if (splitTypeClean === 'share') {
          cleanSplits.forEach(s => {
            s.amount_inr = totalShares > 0 ? ((s.shares || 0) / totalShares * amountINR) : 0;
          });
        } else if (splitTypeClean === 'unequal') {
          let sumDetailsINR = 0;
          parsedSplits.forEach((split) => {
            const matchIndex = cleanSplits.findIndex(s => s.user_id === allUsers.find(u => u.name.toLowerCase() === split.name.toLowerCase())?.id);
            if (matchIndex !== -1) {
              const val = split.value || 0;
              const detailsAmtINR = val * rateUsed;
              cleanSplits[matchIndex].amount_inr = detailsAmtINR;
              sumDetailsINR += detailsAmtINR;
            }
          });
          if (Math.abs(sumDetailsINR - amountINR) > 1.0) {
            anomalies.push({
              type: 'INVALID_SPLIT_TOTAL_MISMATCH',
              description: `Unequal splits sum to INR ${sumDetailsINR.toFixed(2)} while total is INR ${amountINR.toFixed(2)}.`,
              action_taken: 'Flagged for review.',
              requires_approval: true
            });
            status = 'pending_review';
          }
        }
      }

      const exactDupeInBatch = parsedExpenses.some(e => 
        areDescriptionsSimilar(e.description, csvRow.description) &&
        e.expense_date.getTime() === expenseDate.getTime() &&
        e.paid_by_user_id === payerId &&
        Math.abs(e.amount_original - amountParsed) < 0.01
      );

      const exactDupeInDB = await prisma.expense.findFirst({
        where: {
          group_id: groupId,
          paid_by_user_id: payerId || undefined,
          amount_original: amountParsed,
          expense_date: expenseDate,
          status: { not: 'deleted' }
        }
      });

      if (exactDupeInBatch || (exactDupeInDB && areDescriptionsSimilar(exactDupeInDB.description, csvRow.description))) {
        anomalies.push({
          type: 'DUPLICATE_EXPENSE',
          description: `Duplicate found (same payer, amount, date, similar description: '${csvRow.description}').`,
          action_taken: 'Flagged for Meera-style approval before discarding.',
          requires_approval: true
        });
        status = 'pending_review';

        if (exactDupeInBatch) {
          addAnomaly(exactDupeInBatch.rowNum, exactDupeInBatch, 'DUPLICATE_EXPENSE_ORIGINAL', `This is the original entry of a duplicate found on row ${rowNum}.`, 'Flagged for reference', false);
        }
      }

      const conflictingDupeInBatch = parsedExpenses.some(e => 
        areDescriptionsSimilar(e.description, csvRow.description) &&
        e.expense_date.getTime() === expenseDate.getTime() &&
        Math.abs(e.amount_original - amountParsed) >= 0.01
      );

      const conflictingDupeInDB = await prisma.expense.findFirst({
        where: {
          group_id: groupId,
          expense_date: expenseDate,
          status: { not: 'deleted' }
        }
      });

      if (conflictingDupeInBatch || (conflictingDupeInDB && areDescriptionsSimilar(conflictingDupeInDB.description, csvRow.description) && Math.abs(conflictingDupeInDB.amount_original - amountParsed) >= 0.01)) {
        anomalies.push({
          type: 'CONFLICTING_DUPLICATE',
          description: `Conflicting duplicate found (same date, similar description, different amounts: '${csvRow.description}').`,
          action_taken: 'Flagged for user review to select which to keep.',
          requires_approval: true
        });
        status = 'pending_review';
      }

      anomalies.forEach(a => {
        addAnomaly(rowNum, csvRow, a.type, a.description, a.action_taken, a.requires_approval);
      });

      if (isSettlement) {
        let receiverId = null;
        const potentialReceivers = allUsers.filter(u => u.id !== payerId);
        
        const receiverMatch = potentialReceivers.find(u => 
          descLower.includes(u.name.toLowerCase()) || 
          notesLower.includes(u.name.toLowerCase())
        );

        if (receiverMatch) {
          receiverId = receiverMatch.id;
        } else if (cleanSplits.length > 0) {
          receiverId = cleanSplits[0].user_id;
        }

        parsedSettlements.push({
          rowNum,
          group_id: groupId,
          paid_by_user_id: payerId || 1,
          paid_to_user_id: receiverId || 1,
          amount_inr: amountINR,
          settled_at: expenseDate,
          status,
          description: csvRow.description,
          notes: csvRow.notes
        });
      } else {
        parsedExpenses.push({
          rowNum,
          group_id: groupId,
          description: csvRow.description,
          paid_by_user_id: payerId || 1,
          amount_original: amountParsed,
          currency_original: currency,
          amount_inr: amountINR,
          exchange_rate_used: rateUsed,
          split_type: splitTypeClean,
          expense_date: expenseDate,
          status,
          import_batch_id: batch.id,
          splits: cleanSplits
        });
      }

    } catch (err) {
      addAnomaly(rowNum, csvRow, 'CRITICAL_ERROR', err.message || 'Row processing crash', 'Skipped row.', true);
      errors.push(`Row ${rowNum} crashed: ${err.message}`);
    }
  }

  let dbAnomalies = [];
  if (anomaliesToCreate.length > 0) {
    await prisma.importAnomaly.createMany({
      data: anomaliesToCreate
    });
    dbAnomalies = await prisma.importAnomaly.findMany({
      where: { import_batch_id: batch.id }
    });
  }

  let expensesCount = 0;
  for (const exp of parsedExpenses) {
    await prisma.expense.create({
      data: {
        group_id: exp.group_id,
        description: exp.description,
        paid_by_user_id: exp.paid_by_user_id,
        amount_original: exp.amount_original,
        currency_original: exp.currency_original,
        amount_inr: exp.amount_inr,
        exchange_rate_used: exp.exchange_rate_used,
        split_type: exp.split_type,
        expense_date: exp.expense_date,
        status: exp.status,
        import_batch_id: exp.import_batch_id,
        splits: {
          createMany: {
            data: exp.splits.map((s) => ({
              user_id: s.user_id,
              amount_inr: s.amount_inr,
              percentage: s.percentage,
              shares: s.shares
            }))
          }
        }
      }
    });
    expensesCount++;
  }

  for (const set of parsedSettlements) {
    if (set.status === 'pending_review') {
      await prisma.expense.create({
        data: {
          group_id: set.group_id,
          description: set.description,
          paid_by_user_id: set.paid_by_user_id,
          amount_original: set.amount_inr,
          currency_original: 'INR',
          amount_inr: set.amount_inr,
          exchange_rate_used: 1.0,
          split_type: 'equal',
          expense_date: set.settled_at,
          status: 'pending_review',
          is_settlement: true,
          import_batch_id: batch.id,
          splits: {
            createMany: {
              data: [
                { user_id: set.paid_to_user_id, amount_inr: set.amount_inr }
              ]
            }
          }
        }
      });
    } else {
      await prisma.settlement.create({
        data: {
          group_id: set.group_id,
          paid_by_user_id: set.paid_by_user_id,
          paid_to_user_id: set.paid_to_user_id,
          amount_inr: set.amount_inr,
          settled_at: set.settled_at
        }
      });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      anomaly_report: {
        hash: fileHash,
        errors,
        anomaliesCount: anomaliesToCreate.length,
        requiresApprovalCount: anomaliesToCreate.filter(a => a.requires_approval).length
      }
    }
  });

  const csvRows = rows.map((r, i) => {
    const rowNum = i + 2;
    const rowAnomalies = dbAnomalies.filter(a => a.row_number === rowNum);
    return {
      rowNumber: rowNum,
      ...r,
      anomalies: rowAnomalies
    };
  });

  return {
    batchId: batch.id,
    anomaliesCount: anomaliesToCreate.length,
    expensesCount,
    errors,
    csvRows
  };
}

export async function approveAnomaly(anomalyId, userId) {
  const anomaly = await prisma.importAnomaly.findUnique({
    where: { id: anomalyId }
  });

  if (!anomaly) throw new Error('Anomaly not found');

  await prisma.importAnomaly.update({
    where: { id: anomalyId },
    data: {
      approved_by: userId,
      approved_at: new Date()
    }
  });

  const batchId = anomaly.import_batch_id;
  const rawRow = anomaly.raw_row;

  if (anomaly.anomaly_type === 'DUPLICATE_EXPENSE') {
    const exp = await prisma.expense.findFirst({
      where: {
        import_batch_id: batchId,
        description: rawRow.description,
        amount_original: parseFloat((rawRow.amount || '').replace(/,/g, '').trim()),
        status: 'pending_review'
      }
    });
    if (exp) {
      await prisma.expense.update({
        where: { id: exp.id },
        data: { status: 'active' }
      });
    }
  } else if (anomaly.anomaly_type === 'SETTLEMENT_LOGGED_AS_EXPENSE' || anomaly.anomaly_type === 'SAM_DEPOSIT_SETTLEMENT') {
    const exp = await prisma.expense.findFirst({
      where: {
        import_batch_id: batchId,
        description: rawRow.description,
        is_settlement: true,
        status: 'pending_review'
      },
      include: { splits: true }
    });

    if (exp) {
      const recipientId = exp.splits[0]?.user_id || exp.paid_by_user_id;
      await prisma.settlement.create({
        data: {
          group_id: exp.group_id,
          paid_by_user_id: exp.paid_by_user_id,
          paid_to_user_id: recipientId,
          amount_inr: exp.amount_inr,
          settled_at: exp.expense_date
        }
      });
      await prisma.expense.delete({
        where: { id: exp.id }
      });
    }
  } else {
    const exp = await prisma.expense.findFirst({
      where: {
        import_batch_id: batchId,
        description: rawRow.description,
        status: 'pending_review'
      }
    });
    if (exp) {
      await prisma.expense.update({
        where: { id: exp.id },
        data: { status: 'active' }
      });
    }
  }
}

export async function discardAnomalyExpense(anomalyId) {
  const anomaly = await prisma.importAnomaly.findUnique({
    where: { id: anomalyId }
  });

  if (!anomaly) throw new Error('Anomaly not found');

  const batchId = anomaly.import_batch_id;
  const rawRow = anomaly.raw_row;

  const exp = await prisma.expense.findFirst({
    where: {
      import_batch_id: batchId,
      description: rawRow.description,
      status: 'pending_review'
    }
  });

  if (exp) {
    await prisma.expense.update({
      where: { id: exp.id },
      data: { status: 'deleted' }
    });
  }

  await prisma.importAnomaly.delete({
    where: { id: anomalyId }
  });
}
