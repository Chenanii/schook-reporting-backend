
import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function auditData(actorId, action, entityId, oldValues, newValues, req) {
  return {
    actorId,
    action,
    entityType: 'ClassGroup',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function snapshot(group) {
  return {
    name: group.name,
    classLevelId: group.classLevelId
  };
}

function handleDatabaseError(error) {
  if (error.code === 'P2002') {
    throw httpError(
      409,
      'CLASS_GROUP_ALREADY_EXISTS',
      'A class group with this name already exists at this class level.'
    );
  }

  if (error.code === 'P2003') {
    throw httpError(
      400,
      'INVALID_CLASS_LEVEL',
      'The selected class level does not exist or cannot be used.'
    );
  }

  throw error;
}

export async function createClassGroup(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const classLevel = await tx.classLevel.findUnique({
        where: { id: data.classLevelId },
        select: { id: true, name: true, levelOrder: true }
      });

      if (!classLevel) {
        throw httpError(
          404,
          'CLASS_LEVEL_NOT_FOUND',
          'The selected class level was not found.'
        );
      }

      const group = await tx.classGroup.create({
        data: {
          name: data.name,
          classLevelId: data.classLevelId
        },
        include: {
          classLevel: {
            select: { id: true, name: true, levelOrder: true }
          },
          _count: {
            select: {
              enrollments: true,
              assignments: true
            }
          }
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'CLASS_GROUP_CREATED',
          group.id,
          null,
          snapshot(group),
          req
        )
      });

      return group;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listClassGroups(filters) {
  const { page, limit, search, classLevelId } = filters;

  const where = {
    ...(classLevelId ? { classLevelId } : {}),
    ...(search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              classLevel: {
                name: {
                  contains: search,
                  mode: 'insensitive'
                }
              }
            }
          ]
        }
      : {})
  };

  const [groups, total] = await prisma.$transaction([
    prisma.classGroup.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { classLevel: { levelOrder: 'asc' } },
        { name: 'asc' }
      ],
      include: {
        classLevel: {
          select: { id: true, name: true, levelOrder: true }
        },
        _count: {
          select: {
            enrollments: true,
            assignments: true
          }
        }
      }
    }),
    prisma.classGroup.count({ where })
  ]);

  return {
    data: groups,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getClassGroupById(id) {
  const group = await prisma.classGroup.findUnique({
    where: { id },
    include: {
      classLevel: {
        select: { id: true, name: true, levelOrder: true }
      },
      _count: {
        select: {
          enrollments: true,
          assignments: true
        }
      }
    }
  });

  if (!group) {
    throw httpError(
      404,
      'CLASS_GROUP_NOT_FOUND',
      'Class group not found.'
    );
  }

  return group;
}

export async function updateClassGroup(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.classGroup.findUnique({
        where: { id }
      });

      if (!existing) {
        throw httpError(
          404,
          'CLASS_GROUP_NOT_FOUND',
          'Class group not found.'
        );
      }

      const classLevelId = data.classLevelId ?? existing.classLevelId;

      if (data.classLevelId) {
        const classLevel = await tx.classLevel.findUnique({
          where: { id: classLevelId },
          select: { id: true }
        });

        if (!classLevel) {
          throw httpError(
            404,
            'CLASS_LEVEL_NOT_FOUND',
            'The selected class level was not found.'
          );
        }
      }

      const updated = await tx.classGroup.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.classLevelId !== undefined
            ? { classLevelId: data.classLevelId }
            : {})
        },
        include: {
          classLevel: {
            select: { id: true, name: true, levelOrder: true }
          },
          _count: {
            select: {
              enrollments: true,
              assignments: true
            }
          }
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'CLASS_GROUP_UPDATED',
          id,
          snapshot(existing),
          snapshot(updated),
          req
        )
      });

      return updated;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}
