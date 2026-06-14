import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }

    const settlements = await prisma.settlement.findMany({
      where: { group_id: groupId },
      include: {
        payer: true,
        recipient: true
      },
      orderBy: { settled_at: 'desc' }
    });

    return res.json({ settlements });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const { paidByUserId, paidToUserId, amountInr, settledAt } = req.body;

    if (isNaN(groupId) || !paidByUserId || !paidToUserId || !amountInr) {
      return res.status(400).json({ message: 'Missing required settlement fields.' });
    }

    const parsedAmount = parseFloat(amountInr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        group_id: groupId,
        paid_by_user_id: parseInt(paidByUserId, 10),
        paid_to_user_id: parseInt(paidToUserId, 10),
        amount_inr: parsedAmount,
        settled_at: settledAt ? new Date(settledAt) : new Date()
      },
      include: {
        payer: true,
        recipient: true
      }
    });

    return res.status(201).json({ settlement });
  } catch (error) {
    next(error);
  }
});

export default router;
