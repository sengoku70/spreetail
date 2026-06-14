import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { getExchangeRate } from '../services/currencyService.js';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }

    const expenses = await prisma.expense.findMany({
      where: {
        group_id: groupId,
        status: { in: ['active', 'pending_review'] }
      },
      include: {
        payer: true,
        splits: {
          include: { user: true }
        }
      },
      orderBy: { expense_date: 'desc' }
    });

    return res.json({ expenses });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const {
      description,
      amount,
      currency,
      expenseDate,
      paidByUserId,
      splitType,
      splits
    } = req.body;

    if (isNaN(groupId) || !description || !amount || !currency || !expenseDate || !paidByUserId || !splitType) {
      return res.status(400).json({ message: 'Missing required expense fields.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ message: 'Invalid amount format.' });
    }

    const parsedDate = new Date(expenseDate);
    let exchangeRate = 1.0;
    if (currency.toUpperCase() === 'USD') {
      exchangeRate = await getExchangeRate(parsedDate);
    }
    const amountINR = parsedAmount * exchangeRate;

    const finalSplits = [];

    if (splitType === 'equal') {
      let activeUserIds = [];
      if (splits && Array.isArray(splits) && splits.length > 0) {
        activeUserIds = splits.map(s => s.userId);
      } else {
        const memberships = await prisma.groupMembership.findMany({
          where: {
            group_id: groupId,
            joined_at: { lte: parsedDate },
            OR: [
              { left_at: null },
              { left_at: { gte: parsedDate } }
            ]
          }
        });
        activeUserIds = memberships.map(m => m.user_id);
      }

      const count = activeUserIds.length;
      const splitAmtINR = count > 0 ? (amountINR / count) : 0;
      activeUserIds.forEach(uid => {
        finalSplits.push({
          user_id: uid,
          amount_inr: splitAmtINR,
          percentage: count > 0 ? (100 / count) : 0,
          shares: 1
        });
      });
    } else if (splitType === 'percentage') {
      let sum = 0;
      splits.forEach((s) => {
        const p = parseFloat(s.percentage || 0);
        sum += p;
        finalSplits.push({
          user_id: s.userId,
          amount_inr: (p / 100) * amountINR,
          percentage: p
        });
      });
      if (Math.abs(sum - 100) > 0.01) {
        return res.status(400).json({ message: `Percentages must sum to 100%. Current sum: ${sum}%` });
      }
    } else if (splitType === 'share') {
      let totalShares = 0;
      splits.forEach((s) => {
        totalShares += parseFloat(s.shares || 0);
      });
      splits.forEach((s) => {
        const sh = parseFloat(s.shares || 0);
        finalSplits.push({
          user_id: s.userId,
          amount_inr: totalShares > 0 ? ((sh / totalShares) * amountINR) : 0,
          shares: sh
        });
      });
    } else if (splitType === 'unequal') {
      let sumINR = 0;
      splits.forEach((s) => {
        const origAmt = parseFloat(s.amount || 0);
        const splitAmtINR = origAmt * exchangeRate;
        sumINR += splitAmtINR;
        finalSplits.push({
          user_id: s.userId,
          amount_inr: splitAmtINR
        });
      });
      if (Math.abs(sumINR - amountINR) > 5.0) {
        return res.status(400).json({ message: `Unequal splits sum (INR ${sumINR.toFixed(2)}) must match total (INR ${amountINR.toFixed(2)})` });
      }
    }

    const expense = await prisma.expense.create({
      data: {
        group_id: groupId,
        description,
        paid_by_user_id: parseInt(paidByUserId, 10),
        amount_original: parsedAmount,
        currency_original: currency.toUpperCase(),
        amount_inr: amountINR,
        exchange_rate_used: exchangeRate,
        split_type: splitType,
        expense_date: parsedDate,
        status: 'active',
        splits: {
          createMany: {
            data: finalSplits.map(s => ({
              user_id: s.user_id,
              amount_inr: s.amount_inr,
              percentage: s.percentage,
              shares: s.shares
            }))
          }
        }
      },
      include: {
        payer: true,
        splits: {
          include: { user: true }
        }
      }
    });

    return res.status(201).json({ expense });
  } catch (error) {
    next(error);
  }
});

router.put('/:expenseId', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const expenseId = parseInt(req.params.expenseId, 10);
    const {
      description,
      amount,
      currency,
      expenseDate,
      paidByUserId,
      splitType,
      splits
    } = req.body;

    if (isNaN(groupId) || isNaN(expenseId)) {
      return res.status(400).json({ message: 'Invalid URL parameters.' });
    }

    const existing = await prisma.expense.findFirst({
      where: { id: expenseId, group_id: groupId }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    const parsedAmount = amount ? parseFloat(amount) : existing.amount_original;
    const parsedDate = expenseDate ? new Date(expenseDate) : existing.expense_date;
    const finalCurrency = currency ? currency.toUpperCase() : existing.currency_original;
    const finalPayerId = paidByUserId ? parseInt(paidByUserId, 10) : existing.paid_by_user_id;
    const finalSplitType = splitType || existing.split_type;

    let exchangeRate = existing.exchange_rate_used;
    if (currency || expenseDate) {
      if (finalCurrency === 'USD') {
        exchangeRate = await getExchangeRate(parsedDate);
      } else {
        exchangeRate = 1.0;
      }
    }
    const amountINR = parsedAmount * exchangeRate;

    let finalSplits = [];
    if (splits && Array.isArray(splits)) {
      if (finalSplitType === 'equal') {
        const count = splits.length;
        const splitAmtINR = count > 0 ? (amountINR / count) : 0;
        splits.forEach(s => {
          finalSplits.push({
            user_id: s.userId,
            amount_inr: splitAmtINR,
            percentage: count > 0 ? (100 / count) : 0,
            shares: 1
          });
        });
      } else if (finalSplitType === 'percentage') {
        let sum = 0;
        splits.forEach((s) => {
          const p = parseFloat(s.percentage || 0);
          sum += p;
          finalSplits.push({
            user_id: s.userId,
            amount_inr: (p / 100) * amountINR,
            percentage: p
          });
        });
        if (Math.abs(sum - 100) > 0.01) {
          return res.status(400).json({ message: 'Percentages must sum to 100%.' });
        }
      } else if (finalSplitType === 'share') {
        let totalShares = 0;
        splits.forEach((s) => {
          totalShares += parseFloat(s.shares || 0);
        });
        splits.forEach((s) => {
          const sh = parseFloat(s.shares || 0);
          finalSplits.push({
            user_id: s.userId,
            amount_inr: totalShares > 0 ? ((sh / totalShares) * amountINR) : 0,
            shares: sh
          });
        });
      } else if (finalSplitType === 'unequal') {
        let sumINR = 0;
        splits.forEach((s) => {
          const origAmt = parseFloat(s.amount || 0);
          const splitAmtINR = origAmt * exchangeRate;
          sumINR += splitAmtINR;
          finalSplits.push({
            user_id: s.userId,
            amount_inr: splitAmtINR
          });
        });
        if (Math.abs(sumINR - amountINR) > 5.0) {
          return res.status(400).json({ message: 'Unequal splits sum must match total amount.' });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (finalSplits.length > 0) {
        await tx.expenseSplit.deleteMany({
          where: { expense_id: expenseId }
        });
      }

      return tx.expense.update({
        where: { id: expenseId },
        data: {
          description: description || existing.description,
          amount_original: parsedAmount,
          currency_original: finalCurrency,
          amount_inr: amountINR,
          exchange_rate_used: exchangeRate,
          split_type: finalSplitType,
          expense_date: parsedDate,
          paid_by_user_id: finalPayerId,
          status: 'active',
          splits: finalSplits.length > 0 ? {
            createMany: {
              data: finalSplits.map(s => ({
                user_id: s.user_id,
                amount_inr: s.amount_inr,
                percentage: s.percentage,
                shares: s.shares
              }))
            }
          } : undefined
        },
        include: {
          payer: true,
          splits: {
            include: { user: true }
          }
        }
      });
    });

    return res.json({ expense: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:expenseId', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const expenseId = parseInt(req.params.expenseId, 10);

    if (isNaN(groupId) || isNaN(expenseId)) {
      return res.status(400).json({ message: 'Invalid URL parameters.' });
    }

    const existing = await prisma.expense.findFirst({
      where: { id: expenseId, group_id: groupId }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    const deleted = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: 'deleted' }
    });

    return res.json({ message: 'Expense successfully deleted.', expense: deleted });
  } catch (error) {
    next(error);
  }
});

export default router;
