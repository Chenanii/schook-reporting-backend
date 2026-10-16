import { prisma } from '../../lib/prisma.js';

export async function listAuditLogs(filters) {
  const { page, limit, action, entityType, actorId, from, to, search } = filters;
  const endOfToDate = to ? new Date(to) : null;
  if (endOfToDate) endOfToDate.setUTCHours(23, 59, 59, 999);
  const where = {
    ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
    ...(entityType ? { entityType: { contains: entityType, mode: 'insensitive' } } : {}),
    ...(actorId ? { actorId } : {}),
    ...(from || endOfToDate ? { createdAt: { ...(from ? { gte: from } : {}), ...(endOfToDate ? { lte: endOfToDate } : {}) } } : {}),
    ...(search ? {
      OR: [
        { action: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { actor: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
        { actor: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
        { actor: { is: { email: { contains: search, mode: 'insensitive' } } } }
      ]
    } : {})
  };

  const [data, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        school: { select: { id: true, name: true } }
      }
    }),
    prisma.auditLog.count({ where })
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
