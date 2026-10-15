import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { tenantContext } from '../lib/tenant-context.js';

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
        status: true,
        schoolId: true
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

    let scopedSchoolId = user.schoolId ?? null;
    if (user.role === 'SUPER_ADMIN' && req.get('x-school-id')) {
      const selectedSchool = await prisma.school.findUnique({
        where: { id: req.get('x-school-id') },
        select: { id: true }
      });
      if (!selectedSchool) {
        return res.status(404).json({
          success: false,
          error: { code: 'SCHOOL_NOT_FOUND', message: 'Selected school not found.' }
        });
      }
      scopedSchoolId = selectedSchool.id;
    }

    req.user = user;
    req.schoolId = scopedSchoolId;
    tenantContext.run(scopedSchoolId, next);
  } catch (error) {
    next(error);
  }
}
