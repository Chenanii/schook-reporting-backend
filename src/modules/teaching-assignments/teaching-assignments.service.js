
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
    entityType: 'TeachingAssignment',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function snapshot(assignment) {
  return {
    teacherId: assignment.teacherId,
    classGroupId: assignment.classGroupId,
    classSubjectId: assignment.classSubjectId,
    termId: assignment.termId
  };
}

function handleDatabaseError(error) {
  if (error.code === 'P2002') {
    throw httpError(
      409,
      'TEACHING_ASSIGNMENT_ALREADY_EXISTS',
      'This teacher, class group, subject, and term combination already exists.'
    );
  }

  if (error.code === 'P2003') {
    throw httpError(
      400,
      'INVALID_ASSIGNMENT_REFERENCE',
      'One or more referenced records do not exist or cannot be used.'
    );
  }

  throw error;
}

const assignmentInclude = {
  teacher: {
    select: {
      id: true,
      staffNumber: true
    }
  },
  classGroup: {
    include: {
      classLevel: {
        select: {
          id: true,
          name: true,
          levelOrder: true
        }
      }
    }
  },
  classSubject: {
    include: {
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
      }
    }
  },
  term: true,
  _count: {
    select: {
      assessments: true
    }
  }
};

async function validateAssignmentReferences(tx, data) {
  const [teacher, classGroup, classSubject, term] = await Promise.all([
    tx.teacher.findUnique({
      where: { id: data.teacherId },
      select: { id: true }
    }),
    tx.classGroup.findUnique({
      where: { id: data.classGroupId },
      select: {
        id: true,
        classLevelId: true
      }
    }),
    tx.classSubject.findUnique({
      where: { id: data.classSubjectId },
      select: {
        id: true,
        classLevelId: true,
        subject: {
          select: { status: true }
        }
      }
    }),
    tx.term.findUnique({
      where: { id: data.termId },
      select: { id: true }
    })
  ]);

  if (!teacher) {
    throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher not found.');
  }

  if (!classGroup) {
    throw httpError(
      404,
      'CLASS_GROUP_NOT_FOUND',
      'Class group not found.'
    );
  }

  if (!classSubject) {
    throw httpError(
      404,
      'CLASS_SUBJECT_NOT_FOUND',
      'Class subject link not found.'
    );
  }

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
  }

  if (classGroup.classLevelId !== classSubject.classLevelId) {
    throw httpError(
      400,
      'CLASS_LEVEL_MISMATCH',
      'The selected subject is not linked to the class level of this class group.'
    );
  }

  if (classSubject.subject.status !== 'ACTIVE') {
    throw httpError(
      409,
      'SUBJECT_NOT_ACTIVE',
      'Only active subjects can be assigned to a teacher.'
    );
  }
}

export async function createTeachingAssignment(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      await validateAssignmentReferences(tx, data);

      const assignment = await tx.teachingAssignment.create({
        data,
        include: assignmentInclude
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TEACHING_ASSIGNMENT_CREATED',
          assignment.id,
          null,
          snapshot(assignment),
          req
        )
      });

      return assignment;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listTeachingAssignments(filters) {
  const {
    page,
    limit,
    teacherId,
    classGroupId,
    classSubjectId,
    termId
  } = filters;

  const where = {
    ...(teacherId ? { teacherId } : {}),
    ...(classGroupId ? { classGroupId } : {}),
    ...(classSubjectId ? { classSubjectId } : {}),
    ...(termId ? { termId } : {})
  };

  const [data, total] = await prisma.$transaction([
    prisma.teachingAssignment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { termId: 'asc' },
        { classGroup: { classLevel: { levelOrder: 'asc' } } },
        { classGroup: { name: 'asc' } }
      ],
      include: assignmentInclude
    }),
    prisma.teachingAssignment.count({ where })
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

export async function getTeachingAssignmentById(id) {
  const assignment = await prisma.teachingAssignment.findUnique({
    where: { id },
    include: assignmentInclude
  });

  if (!assignment) {
    throw httpError(
      404,
      'TEACHING_ASSIGNMENT_NOT_FOUND',
      'Teaching assignment not found.'
    );
  }

  return assignment;
}

export async function updateTeachingAssignment(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.teachingAssignment.findUnique({
        where: { id },
        include: {
          _count: {
            select: { assessments: true }
          }
        }
      });

      if (!existing) {
        throw httpError(
          404,
          'TEACHING_ASSIGNMENT_NOT_FOUND',
          'Teaching assignment not found.'
        );
      }

      const merged = {
        teacherId: data.teacherId ?? existing.teacherId,
        classGroupId: data.classGroupId ?? existing.classGroupId,
        classSubjectId: data.classSubjectId ?? existing.classSubjectId,
        termId: data.termId ?? existing.termId
      };

      const changesStructure =
        merged.classGroupId !== existing.classGroupId ||
        merged.classSubjectId !== existing.classSubjectId ||
        merged.termId !== existing.termId;

      if (existing._count.assessments > 0 && changesStructure) {
        throw httpError(
          409,
          'ASSIGNMENT_HAS_ASSESSMENTS',
          'The class, subject, or term cannot be changed because assessments already exist for this assignment. Create a new assignment instead.'
        );
      }

      await validateAssignmentReferences(tx, merged);

      const updated = await tx.teachingAssignment.update({
        where: { id },
        data: merged,
        include: assignmentInclude
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TEACHING_ASSIGNMENT_UPDATED',
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

export async function deleteTeachingAssignment(id, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.teachingAssignment.findUnique({
        where: { id },
        include: {
          _count: {
            select: { assessments: true }
          }
        }
      });

      if (!existing) {
        throw httpError(
          404,
          'TEACHING_ASSIGNMENT_NOT_FOUND',
          'Teaching assignment not found.'
        );
      }

      if (existing._count.assessments > 0) {
        throw httpError(
          409,
          'ASSIGNMENT_HAS_ASSESSMENTS',
          'This assignment has assessments and cannot be deleted.'
        );
      }

      await tx.teachingAssignment.delete({
        where: { id }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TEACHING_ASSIGNMENT_DELETED',
          id,
          snapshot(existing),
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
