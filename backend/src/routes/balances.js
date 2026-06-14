import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getGroupBalances } from '../services/balanceService.js';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }

    const balanceReport = await getGroupBalances(groupId);
    return res.json(balanceReport);
  } catch (error) {
    next(error);
  }
});

export default router;
