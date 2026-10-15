import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

export async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'A valid Bearer token is required.'
        }
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The access token is invalid or expired.'
        }
      });
    }

    let payload;

    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        issuer: 'school-reporting-api',
        audience: 'school-reporting-client'
      });
    } catch {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The access token is invalid or expired.'
        }
      });
    }

    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The access token is invalid.'
        }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_UNAVAILABLE',
          message: 'This account is unavailable.'
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}