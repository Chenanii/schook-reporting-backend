
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
    entityType: 'ClassSubject',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function snapshot(link) {
  return {
    classLevelId: link.classLevelId,
    subjectId: link.subjectId
  };
}

function handleDatabaseError(error) {
  if (error.code === 'P2002') {
    throw httpError(
      409,
      'CLASS_SUBJECT_ALREADY_EXISTS',
      'This subject is already linked to the selected class level.'
    );
  }

  if (error.code === 'P2003') {
    throw httpError(
      409,
      'CLASS_SUBJECT_IN_USE',
      'This link is referenced by another record and cannot be changed or deleted.'
    );
  }

  throw error;
}

const classSubjectInclude = {
  classLevel: {
    select: {
      id: true,
      name: true,
      levelOrder: true
    }
  },
  subject: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true
    }
  },
  _count: {
    select: {
      assignments: true
    }
  }
};

export async function createClassSubject(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const [classLevel, subject] = await Promise.all([
        tx.classLevel.findUnique({
          where: { id: data.classLevelId },
          select: { id: true, name: true }
        }),
        tx.subject.findUnique({
          where: { id: data.subjectId },
          select: { id: true, code: true, name: true, status: true }
        })
      ]);

      if (!classLevel) {
        throw httpError(
          404,
          'CLASS_LEVEL_NOT_FOUND',
          'The selected class level was not found.'
        );
      }

      if (!subject) {
        throw httpError(
          404,
          'SUBJECT_NOT_FOUND',
          'The selected subject was not found.'
        );
      }

      if (subject.status !== 'ACTIVE') {
        throw httpError(
          409,
          'SUBJECT_NOT_ACTIVE',
          'Only active subjects can be linked to a class level.'
        );
      }

      const link = await tx.classSubject.create({
        data: {
          classLevelId: data.classLevelId,
          subjectId: data.subjectId
        },
        include: classSubjectInclude
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'CLASS_SUBJECT_CREATED',
          link.id,
          null,
          snapshot(link),
          req
        )
      });

      return link;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listClassSubjects(filters) {
  const { page, limit, classLevelId, subjectId, search } = filters;

  const where = {
    ...(classLevelId ? { classLevelId } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(search
      ? {
          OR: [
            {
              subject: {
                name: {
                  contains: search,
                  mode: 'insensitive'
                }
              }
            },
            {
              subject: {
                code: {
                  contains: search,
                  mode: 'insensitive'
                }
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

  const [data, total] = await prisma.$transaction([
    prisma.classSubject.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { classLevel: { levelOrder: 'asc' } },
        { subject: { name: 'asc' } }
      ],
      include: classSubjectInclude
    }),
    prisma.classSubject.count({ where })
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getClassSubjectById(id) {
  const link = await prisma.classSubject.findUnique({
    where: { id },
    include: classSubjectInclude
  });

  if (!link) {
    throw httpError(
      404,
      'CLASS_SUBJECT_NOT_FOUND',
      'Class subject link not found.'
    );
  }

  return link;
}

export async function deleteClassSubject(id, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const link = await tx.classSubject.findUnique({
        where: { id },
        include: {
          ...classSubjectInclude
        }
      });

      if (!link) {
        throw httpError(
          404,
          'CLASS_SUBJECT_NOT_FOUND',
          'Class subject link not found.'
        );
      }

      if (link._count.assignments > 0) {
        throw httpError(
          409,
          'CLASS_SUBJECT_HAS_ASSIGNMENTS',
          'This subject is used by teaching assignments. Remove or reassign those assignments before deleting this link.'
        );
      }

      await tx.classSubject.delete({
        where: { id }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'CLASS_SUBJECT_DELETED',
          id,
          snapshot(link),
          null,
          req
        )
      });

      return { id };
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}
