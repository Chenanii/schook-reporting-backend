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
    entityType: 'ClassLevel',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function snapshot(level) {
  return {
    name: level.name,
    levelOrder: level.levelOrder,
    nextLevelId: level.nextLevelId
  };
}

async function validateNextLevel(tx, currentId, nextLevelId, currentOrder) {
  if (nextLevelId == null) return;

  if (currentId && nextLevelId === currentId) {
    throw httpError(
      400,
      'INVALID_CLASS_PROGRESSION',
      'A class level cannot progress to itself.'
    );
  }

  const nextLevel = await tx.classLevel.findUnique({
    where: { id: nextLevelId },
    select: { id: true, name: true, levelOrder: true, nextLevelId: true }
  });

  if (!nextLevel) {
    throw httpError(
      404,
      'NEXT_CLASS_LEVEL_NOT_FOUND',
      'The selected next class level does not exist.'
    );
  }

  if (nextLevel.levelOrder <= currentOrder) {
    throw httpError(
      400,
      'INVALID_CLASS_PROGRESSION_ORDER',
      'The next class level must have a higher level order.'
    );
  }

  // Follow the progression chain to ensure it cannot return to this level.
  const visited = new Set();
  let cursor = nextLevel;

  while (cursor) {
    if (cursor.id === currentId) {
      throw httpError(
        400,
        'CLASS_PROGRESSION_CYCLE',
        'This change would create a circular class progression.'
      );
    }

    if (visited.has(cursor.id)) {
      throw httpError(
        409,
        'EXISTING_CLASS_PROGRESSION_CYCLE',
        'An existing circular progression was detected. Correct it before continuing.'
      );
    }

    visited.add(cursor.id);

    if (!cursor.nextLevelId) break;

    cursor = await tx.classLevel.findUnique({
      where: { id: cursor.nextLevelId },
      select: { id: true, name: true, levelOrder: true, nextLevelId: true }
    });

    if (!cursor) break;
  }
}

async function validateIncomingProgressions(tx, id, newOrder) {
  const previousLevels = await tx.classLevel.findMany({
    where: { nextLevelId: id },
    select: { id: true, name: true, levelOrder: true }
  });

  const invalidPrevious = previousLevels.find(
    (level) => level.levelOrder >= newOrder
  );

  if (invalidPrevious) {
    throw httpError(
      409,
      'INVALID_CLASS_PROGRESSION_ORDER',
      `Cannot use this level order because "${invalidPrevious.name}" already progresses to this class level.`
    );
  }
}

export async function createClassLevel(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (data.nextLevelId) {
        await validateNextLevel(
          tx,
          null,
          data.nextLevelId,
          data.levelOrder
        );
      }

      const level = await tx.classLevel.create({
        data: {
          name: data.name,
          levelOrder: data.levelOrder,
          nextLevelId: data.nextLevelId ?? null
        },
        include: {
          nextLevel: {
            select: { id: true, name: true, levelOrder: true }
          },
          _count: { select: { groups: true, subjects: true } }
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'CLASS_LEVEL_CREATED',
          level.id,
          null,
          snapshot(level),
          req
        )
      });

      return level;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_CLASS_LEVEL',
        'A class level with this name or level order already exists.'
      );
    }

    if (error.code === 'P2034') {
      throw httpError(
        409,
        'CLASS_LEVEL_CONCURRENT_UPDATE',
        'Another operation changed class levels at the same time. Please retry.'
      );
    }

    throw error;
  }
}

export async function listClassLevels(filters) {
  const { page, limit, search } = filters;

  const where = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  const [levels, total] = await prisma.$transaction([
    prisma.classLevel.findMany({
      where,
      include: {
        nextLevel: {
          select: { id: true, name: true, levelOrder: true }
        },
        _count: {
          select: { groups: true, subjects: true, previousLevels: true }
        }
      },
      orderBy: { levelOrder: 'asc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.classLevel.count({ where })
  ]);

  return {
    data: levels,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getClassLevelById(id) {
  const level = await prisma.classLevel.findUnique({
    where: { id },
    include: {
      nextLevel: {
        select: { id: true, name: true, levelOrder: true }
      },
      previousLevels: {
        select: { id: true, name: true, levelOrder: true },
        orderBy: { levelOrder: 'asc' }
      },
      groups: {
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { enrollments: true, assignments: true } }
        }
      },
      subjects: {
        orderBy: { subject: { name: 'asc' } },
        include: {
          subject: {
            select: { id: true, code: true, name: true, status: true }
          }
        }
      },
      _count: {
        select: { groups: true, subjects: true, previousLevels: true }
      }
    }
  });

  if (!level) {
    throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found.');
  }

  return level;
}

export async function updateClassLevel(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.classLevel.findUnique({
        where: { id }
      });

      if (!current) {
        throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found.');
      }

      const nextLevelId = data.nextLevelId !== undefined
        ? data.nextLevelId
        : current.nextLevelId;

      const levelOrder = data.levelOrder ?? current.levelOrder;

      await validateIncomingProgressions(tx, id, levelOrder);

      if (nextLevelId) {
        await validateNextLevel(tx, id, nextLevelId, levelOrder);
      }

      const updated = await tx.classLevel.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.levelOrder !== undefined ? { levelOrder: data.levelOrder } : {}),
          ...(data.nextLevelId !== undefined
            ? { nextLevelId: data.nextLevelId }
            : {})
        },
        include: {
          nextLevel: {
            select: { id: true, name: true, levelOrder: true }
          },
          _count: { select: { groups: true, subjects: true } }
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'CLASS_LEVEL_UPDATED',
          id,
          snapshot(current),
          snapshot(updated),
          req
        )
      });

      return updated;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_CLASS_LEVEL',
        'A class level with this name or level order already exists.'
      );
    }

    if (error.code === 'P2034') {
      throw httpError(
        409,
        'CLASS_LEVEL_CONCURRENT_UPDATE',
        'Another operation changed class levels at the same time. Please retry.'
      );
    }

    throw error;
  }
}