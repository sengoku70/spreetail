import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import groupsRouter from './routes/groups.js';
import expensesRouter from './routes/expenses.js';
import balancesRouter from './routes/balances.js';
import settlementsRouter from './routes/settlements.js';
import importRouter from './routes/import.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/groups/:groupId/expenses', expensesRouter);
app.use('/api/groups/:groupId/balances', balancesRouter);
app.use('/api/groups/:groupId/settlements', settlementsRouter);
app.use('/api/import', importRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
