import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'school-reporting-api',
        database: 'connected',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(Object.assign(new Error('Database health check failed.'), {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      cause: error
    }));
  }
});
