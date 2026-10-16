import { prisma } from '../lib/prisma.js';

const auditedRoles = new Set([
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'ACADEMIC_ADMIN',
  'EXAMS_OFFICER'
]);
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const privateFields = /password|token|secret|authorization|credential/i;

function safeAuditValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (depth >= 5) return '[nested data omitted]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeAuditValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateFields.test(key))
      .slice(0, 100)
      .map(([key, item]) => [key, safeAuditValue(item, depth + 1)]));
  }
  return String(value);
}

function targetSchoolId(req) {
  if (req.schoolId || req.user?.schoolId) return req.schoolId || req.user.schoolId;
  if (req.user?.role === 'SUPER_ADMIN') {
    return req.originalUrl.match(/\/schools\/([^/?]+)\/status(?:\?|$)/)?.[1] ?? null;
  }
  return null;
}

export function adminAuditMiddleware(req, res, next) {
  if (!writeMethods.has(req.method)) return next();
  const startedAt = new Date();
  res.once('finish', () => {
    const actor = req.user;
    if (!actor || !auditedRoles.has(actor.role)) return;

    const schoolId = targetSchoolId(req);
    const path = req.originalUrl.split('?')[0].slice(0, 500);
    const requestRecord = {
      actorId: actor.id,
      schoolId,
      action: 'ADMIN_API_REQUEST',
      entityType: 'AdminApiRequest',
      entityId: path,
      newValues: {
        method: req.method,
        path,
        statusCode: res.statusCode,
        body: safeAuditValue(req.body ?? {})
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 500)
    };

    void (async () => {
      const detailedAuditExists = await prisma.auditLog.findFirst({
        where: {
          actorId: actor.id,
          ...(schoolId ? { schoolId } : { schoolId: null }),
          createdAt: { gte: startedAt }
        },
        select: { id: true }
      });
      if (!detailedAuditExists) await prisma.auditLog.create({ data: requestRecord });
    })().catch((error) => {
      console.error('Could not save the admin request audit entry.', error);
    });
  });
  next();
}
