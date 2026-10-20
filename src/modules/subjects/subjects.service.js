
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
    entityType: 'Subject',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function snapshot(subject) {
  return {
    code: subject.code,
    name: subject.name,
    status: subject.status
  };
}

function handleDatabaseError(error) {
  if (error.code === 'P2002') {
    throw httpError(
      409,
      'SUBJECT_ALREADY_EXISTS',
      'A subject with this code or name already exists.'
    );
  }

  throw error;
}

const subjectIncludes = {
  _count: {
    select: {
      classLinks: true,
      assessments: true,
      annualResults: true
    }
  }
};

export async function createSubject(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.create({
        data: {
          code: data.code,
          name: data.name,
          ...(data.status ? { status: data.status } : {})
        },
        include: subjectIncludes
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'SUBJECT_CREATED',
          subject.id,
          null,
          snapshot(subject),
          req
        )
      });

      return subject;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listSubjects(filters) {
  const { page, limit, search, status } = filters;

  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            {
              code: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              name: {
                contains: search,
                mode: 'insensitive'
              }
            }
          ]
        }
      : {})
  };

  const [subjects, total] = await prisma.$transaction([
    prisma.subject.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      include: subjectIncludes
    }),
    prisma.subject.count({ where })
  ]);

  return {
    data: subjects,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getSubjectById(id) {
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      classLinks: {
        include: {
          classLevel: {
            select: {
              id: true,
              name: true,
              levelOrder: true
            }
          }
        },
        orderBy: {
          classLevel: { levelOrder: 'asc' }
        }
      },
      ...subjectIncludes
    }
  });

  if (!subject) {
    throw httpError(404, 'SUBJECT_NOT_FOUND', 'Subject not found.');
  }

  return subject;
}

export async function updateSubject(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.subject.findUnique({
        where: { id }
      });

      if (!existing) {
        throw httpError(404, 'SUBJECT_NOT_FOUND', 'Subject not found.');
      }

      const updated = await tx.subject.update({
        where: { id },
        data: {
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.status !== undefined ? { status: data.status } : {})
        },
        include: subjectIncludes
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'SUBJECT_UPDATED',
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
