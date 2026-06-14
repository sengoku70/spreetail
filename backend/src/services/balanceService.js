import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getGroupBalances(groupId) {
  const memberships = await prisma.groupMembership.findMany({
    where: { group_id: groupId },
    include: { user: true }
  });

  if (memberships.length === 0) {
    return { breakdowns: [], recommendations: [] };
  }

  const expenses = await prisma.expense.findMany({
    where: {
      group_id: groupId,
      status: 'active'
    },
    include: {
      splits: true,
      payer: true
    }
  });

  const settlements = await prisma.settlement.findMany({
    where: { group_id: groupId },
    include: {
      payer: true,
      recipient: true
    }
  });

  const breakdowns = memberships.map(m => ({
    user_id: m.user_id,
    name: m.user.name,
    joined_at: m.joined_at,
    left_at: m.left_at,
    total_paid_expenses_inr: 0,
    total_owed_splits_inr: 0,
    total_paid_settlements_inr: 0,
    total_received_settlements_inr: 0,
    net_balance_inr: 0,
    contributing_paid_expenses: [],
    contributing_owed_splits: [],
    contributing_settlements: []
  }));

  const getBreakdown = (uid) => breakdowns.find(b => b.user_id === uid);

  expenses.forEach(exp => {
    if (exp.amount_original === 0) return;

    const payerB = getBreakdown(exp.paid_by_user_id);
    if (payerB) {
      const isWithinWindow = exp.expense_date >= payerB.joined_at && 
        (!payerB.left_at || exp.expense_date <= payerB.left_at);
      
      if (isWithinWindow) {
        payerB.total_paid_expenses_inr += exp.amount_inr;
        payerB.contributing_paid_expenses.push({
          id: exp.id,
          description: exp.description,
          expense_date: exp.expense_date,
          amount_original: exp.amount_original,
          currency_original: exp.currency_original,
          exchange_rate_used: exp.exchange_rate_used,
          total_amount_inr: exp.amount_inr,
          user_share_inr: exp.amount_inr,
          split_type: exp.split_type
        });
      }
    }

    exp.splits.forEach(split => {
      const splitB = getBreakdown(split.user_id);
      if (splitB) {
        const isWithinWindow = exp.expense_date >= splitB.joined_at && 
          (!splitB.left_at || exp.expense_date <= splitB.left_at);
        
        if (isWithinWindow) {
          splitB.total_owed_splits_inr += split.amount_inr;
          splitB.contributing_owed_splits.push({
            id: exp.id,
            description: exp.description,
            expense_date: exp.expense_date,
            amount_original: exp.amount_original,
            currency_original: exp.currency_original,
            exchange_rate_used: exp.exchange_rate_used,
            total_amount_inr: exp.amount_inr,
            user_share_inr: split.amount_inr,
            split_type: exp.split_type
          });
        }
      }
    });
  });

  settlements.forEach(set => {
    const payerB = getBreakdown(set.paid_by_user_id);
    const recipientB = getBreakdown(set.paid_to_user_id);

    if (payerB) {
      payerB.total_paid_settlements_inr += set.amount_inr;
      payerB.contributing_settlements.push({
        id: set.id,
        amount_inr: set.amount_inr,
        settled_at: set.settled_at,
        other_user_name: recipientB ? recipientB.name : 'Unknown User',
        type: 'paid'
      });
    }

    if (recipientB) {
      recipientB.total_received_settlements_inr += set.amount_inr;
      recipientB.contributing_settlements.push({
        id: set.id,
        amount_inr: set.amount_inr,
        settled_at: set.settled_at,
        other_user_name: payerB ? payerB.name : 'Unknown User',
        type: 'received'
      });
    }
  });

  breakdowns.forEach(b => {
    b.net_balance_inr = b.total_paid_expenses_inr - b.total_owed_splits_inr + 
                        b.total_paid_settlements_inr - b.total_received_settlements_inr;
  });

  const recommendations = [];
  
  const debts = breakdowns.map(b => ({
    user_id: b.user_id,
    name: b.name,
    balance: b.net_balance_inr
  }));

  const tolerance = 0.05;
  let iterations = 0;
  const maxIterations = debts.length * 2;

  while (iterations < maxIterations) {
    debts.sort((a, b) => a.balance - b.balance);

    const debtor = debts[0];
    const creditor = debts[debts.length - 1];

    if (!debtor || !creditor) break;

    if (Math.abs(debtor.balance) < tolerance && Math.abs(creditor.balance) < tolerance) {
      break;
    }

    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
    if (amount < tolerance) break;

    recommendations.push({
      from_user_id: debtor.user_id,
      from_user_name: debtor.name,
      to_user_id: creditor.user_id,
      to_user_name: creditor.name,
      amount_inr: Math.round(amount * 100) / 100
    });

    debtor.balance += amount;
    creditor.balance -= amount;

    iterations++;
  }

  return {
    breakdowns,
    recommendations
  };
}
