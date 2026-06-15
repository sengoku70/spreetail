import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { runImportPipeline, approveAnomaly, discardAnomalyExpense } from '../services/importService.js';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.post('/upload', async (req, res, next) => {
  try {
    const { filename, csvContent, forceImport } = req.body;

    if (!filename || !csvContent) {
      return res.status(400).json({ message: 'Filename and csvContent are required.' });
    }

    if (!forceImport) {
      const fileHash = Buffer.from(csvContent).toString('base64').substring(0, 32);
      const existingBatch = await prisma.importBatch.findFirst({
        where: {
          filename,
          anomaly_report: {
            path: ['hash'],
            equals: fileHash
          }
        }
      });
      if (existingBatch) {
        return res.status(409).json({ code: 'DUPLICATE_FILE', message: 'This file has already been imported.' });
      }
    }

    const groupName = filename.replace('.csv', '').trim() || 'Imported Spreadsheet';
    
    const newGroup = await prisma.group.create({
      data: {
        name: groupName
      }
    });

    // Ensure the uploader is always a member of the group they create
    await prisma.groupMembership.create({
      data: {
        group_id: newGroup.id,
        user_id: req.user.id,
        joined_at: new Date()
      }
    });

    const result = await runImportPipeline(newGroup.id, filename, csvContent);
    return res.status(201).json({ ...result, groupId: newGroup.id });
  } catch (error) {
    if (error.message && error.message.includes('Duplicate import')) {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
});

router.get('/batches/:batchId/anomalies', async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({ message: 'Invalid batch ID.' });
    }

    const anomalies = await prisma.importAnomaly.findMany({
      where: { import_batch_id: batchId },
      orderBy: { row_number: 'asc' }
    });

    return res.json({ anomalies });
  } catch (error) {
    next(error);
  }
});

router.post('/anomalies/:anomalyId/approve', async (req, res, next) => {
  try {
    const anomalyId = parseInt(req.params.anomalyId, 10);
    if (isNaN(anomalyId)) {
      return res.status(400).json({ message: 'Invalid anomaly ID.' });
    }

    const userId = req.user.id;
    await approveAnomaly(anomalyId, userId);
    
    return res.json({ message: 'Anomaly approved successfully.' });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Approval failed.' });
  }
});

router.post('/anomalies/:anomalyId/discard', async (req, res, next) => {
  try {
    const anomalyId = parseInt(req.params.anomalyId, 10);
    if (isNaN(anomalyId)) {
      return res.status(400).json({ message: 'Invalid anomaly ID.' });
    }

    await discardAnomalyExpense(anomalyId);
    
    return res.json({ message: 'Anomaly discarded/deleted successfully.' });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Discard failed.' });
  }
});

router.post('/anomalies/:anomalyId/create-user', async (req, res, next) => {
  try {
    const anomalyId = parseInt(req.params.anomalyId, 10);
    if (isNaN(anomalyId)) {
      return res.status(400).json({ message: 'Invalid anomaly ID.' });
    }

    const anomaly = await prisma.importAnomaly.findUnique({
      where: { id: anomalyId }
    });

    if (!anomaly) return res.status(404).json({ message: 'Anomaly not found.' });

    const newName = anomaly.raw_row.paid_by.trim();
    
    // Check if user already exists exactly
    let newUser = await prisma.user.findFirst({ where: { name: newName } });
    if (!newUser) {
      newUser = await prisma.user.create({
        data: {
          name: newName,
          email: `${newName.toLowerCase().replace(/[^a-z0-9]/g, '')}@spreetail.com`,
          password_hash: 'default_hash'
        }
      });
    }

    // Since this anomaly is now "resolved" by creating the exact user, 
    // the frontend will force a re-evaluation which will match this user.
    return res.json({ message: 'User created successfully.', user: newUser });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'User creation failed.' });
  }
});

export default router;
