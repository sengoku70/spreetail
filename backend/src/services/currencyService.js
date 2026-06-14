import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const memoryCache = {};

export function formatDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getExchangeRate(date) {
  const dateKey = formatDateKey(date);

  if (memoryCache[dateKey]) {
    return memoryCache[dateKey];
  }

  const startOfDay = new Date(dateKey);
  const endOfDay = new Date(dateKey);
  endOfDay.setHours(23, 59, 59, 999);

  const existingExpense = await prisma.expense.findFirst({
    where: {
      expense_date: {
        gte: startOfDay,
        lte: endOfDay,
      },
      currency_original: 'USD',
      exchange_rate_used: {
        gt: 0,
      },
    },
  });

  if (existingExpense) {
    const rate = existingExpense.exchange_rate_used;
    memoryCache[dateKey] = rate;
    return rate;
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (apiKey) {
    try {
      const parts = dateKey.split('-');
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/history/USD/${parts[0]}/${parts[1]}/${parts[2]}`;
      const response = await axios.get(url);
      if (response.data && response.data.conversion_rates && response.data.conversion_rates.INR) {
        const rate = response.data.conversion_rates.INR;
        memoryCache[dateKey] = rate;
        return rate;
      }
    } catch (error) {
      console.warn(`Failed to fetch exchange rate from ExchangeRate-API for date ${dateKey}:`, error.message);
    }
  }

  try {
    const fallbackUrl = `https://open.er-api.com/v6/latest/USD`;
    const response = await axios.get(fallbackUrl);
    if (response.data && response.data.rates && response.data.rates.INR) {
      const rate = response.data.rates.INR;
      memoryCache[dateKey] = rate;
      return rate;
    }
  } catch (error) {
    console.warn(`Fallback exchange rate fetch failed:`, error.message);
  }

  const absoluteFallback = 83.3;
  memoryCache[dateKey] = absoluteFallback;
  return absoluteFallback;
}
