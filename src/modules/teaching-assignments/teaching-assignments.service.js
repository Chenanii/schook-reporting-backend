
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
    subjectId: assignment.subjectId,
    classSubjectId: assignment.classSubjectId,
    subjectStreamId: assignment.subjectStreamId,
    streamName: assignment.subjectStream?.name ?? null,
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
      firstName: true,
      lastName: true,
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
  subject: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true
    }
  },
  subjectStream: {
    include: {
      subject: { select: { id: true, code: true, name: true } },
      classLevel: { select: { id: true, name: true, levelOrder: true } },
      term: { select: { id: true, name: true, sequence: true } }
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
  const [teacher, classGroup, subject, term] = await Promise.all([
    tx.teacher.findUnique({
      where: { id: data.teacherId },
      select: { id: true }
    }),
    data.classGroupId ? tx.classGroup.findUnique({
      where: { id: data.classGroupId },
      select: {
        id: true,
        classLevelId: true
      }
    }) : Promise.resolve(null),
    tx.subject.findUnique({
      where: { id: data.subjectId },
      select: {
        id: true,
        status: true,
        classLinks: { select: { id: true, classLevelId: true } }
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

  if (data.classGroupId && !classGroup) {
    throw httpError(
      404,
      'CLASS_GROUP_NOT_FOUND',
      'Class group not found.'
    );
  }

  const classLevelId = data.classLevelId || classGroup?.classLevelId;
  if (!classLevelId) {
    throw httpError(400, 'CLASS_LEVEL_REQUIRED', 'A class level is required for a subject stream.');
  }
  const classLevel = await tx.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true, schoolId: true } });
  if (!classLevel) throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found.');
  if (classGroup && classGroup.classLevelId !== classLevel.id) {
    throw httpError(400, 'CLASS_LEVEL_MISMATCH', 'The selected class group does not belong to the chosen class level.');
  }

  if (!subject) {
    throw httpError(
      404,
      'SUBJECT_NOT_FOUND',
      'Subject not found.'
    );
  }

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
  }

  const classSubject = subject.classLinks.find(
    (link) => link.classLevelId === classLevel.id
  );

  if (subject.classLinks.length > 0 && !classSubject) {
    throw httpError(
      400,
      'CLASS_LEVEL_MISMATCH',
      'This subject is linked to a different class level.'
    );
  }

  if (subject.status !== 'ACTIVE') {
    throw httpError(
      409,
      'SUBJECT_NOT_ACTIVE',
      'Only active subjects can be assigned to a teacher.'
    );
  }

  return { classSubjectId: classSubject?.id ?? null, classLevelId: classLevel.id };
}

async function ensureSubjectStream(tx, data, classSubjectId, streamName) {
  const classLevel = await tx.classLevel.findUnique({ where: { id: data.classLevelId }, select: { schoolId: true } });
  return tx.subjectStream.upsert({
    where: { classLevelId_termId_subjectId_name: { classLevelId: data.classLevelId, termId: data.termId, subjectId: data.subjectId, name: streamName } },
    create: { name: streamName, classLevelId: data.classLevelId, termId: data.termId, subjectId: data.subjectId, schoolId: classLevel.schoolId },
    update: {}
  });
}

async function ensureRequiredSubjectUsesSingleStream(tx, {
  classSubjectId,
  subjectId,
  termId,
  exceptAssignmentId = null,
}) {
  if (!classSubjectId) return;
  const classSubject = await tx.classSubject.findUnique({
    where: { id: classSubjectId },
    select: { isRequired: true },
  });
  if (!classSubject?.isRequired) return;

  const existing = await tx.teachingAssignment.findFirst({
    where: {
      classSubjectId,
      subjectId,
      termId,
      ...(exceptAssignmentId ? { id: { not: exceptAssignmentId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw httpError(
      409,
      'REQUIRED_SUBJECT_MULTIPLE_STREAMS',
      'A required subject can have only one teaching stream per class level and term.',
    );
  }
}

async function ensureStreamHasNoOtherTeacher(tx, subjectStreamId, teacherId, exceptAssignmentId = null) {
  if (!subjectStreamId) return;
  const existing = await tx.teachingAssignment.findFirst({
    where: {
      subjectStreamId,
      ...(exceptAssignmentId ? { id: { not: exceptAssignmentId } } : {}),
    },
    select: { id: true, teacherId: true },
  });
  if (existing && existing.teacherId !== teacherId) {
    throw httpError(409, 'SUBJECT_STREAM_ALREADY_ASSIGNED', 'This subject stream already has a teacher assigned. Edit its existing assignment to change the teacher.');
  }
  if (existing) {
    throw httpError(409, 'SUBJECT_STREAM_ASSIGNMENT_ALREADY_EXISTS', 'This subject stream already has a teaching assignment. Edit that assignment instead of creating a duplicate.');
  }
}

export async function createTeachingAssignment(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const { classSubjectId, classLevelId } = await validateAssignmentReferences(tx, data);
      await ensureRequiredSubjectUsesSingleStream(tx, {
        classSubjectId,
        subjectId: data.subjectId,
        termId: data.termId,
      });
      const streamName = data.streamName?.trim().toLocaleUpperCase() || 'A';
      const subjectStream = await ensureSubjectStream(tx, { ...data, classLevelId }, classSubjectId, streamName);
      await ensureStreamHasNoOtherTeacher(tx, subjectStream?.id, data.teacherId);

      const assignment = await tx.teachingAssignment.create({
        data: { teacherId: data.teacherId, classGroupId: null, subjectId: data.subjectId, termId: data.termId, classSubjectId, subjectStreamId: subjectStream.id },
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

export async function listTeachingAssignments(filters, teacherUserId = null) {
  const {
    page,
    limit,
    teacherId,
    classGroupId,
    subjectId,
    termId
  } = filters;

  const where = {
    ...(teacherUserId ? { teacher: { userId: teacherUserId } } : {}),
    ...(teacherId ? { teacherId } : {}),
    ...(classGroupId ? { classGroupId } : {}),
    ...(subjectId ? { subjectId } : {}),
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
          subjectStream: true,
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
        classLevelId: data.classLevelId ?? existing.subjectStream?.classLevelId ?? undefined,
        subjectId: data.subjectId ?? existing.subjectId,
        termId: data.termId ?? existing.termId
      };
      const streamName = data.streamName?.trim().toLocaleUpperCase() || existing.subjectStream?.name || 'A';

      const changesStructure =
        merged.classGroupId !== existing.classGroupId ||
        (merged.classLevelId && merged.classLevelId !== existing.subjectStream?.classLevelId) ||
        merged.subjectId !== existing.subjectId ||
        merged.termId !== existing.termId ||
        (existing.subjectStream && streamName !== existing.subjectStream.name);

      if (existing._count.assessments > 0 && changesStructure) {
        throw httpError(
          409,
          'ASSIGNMENT_HAS_ASSESSMENTS',
          'The class, subject, or term cannot be changed because assessments already exist for this assignment. Create a new assignment instead.'
        );
      }

      const { classSubjectId, classLevelId } = await validateAssignmentReferences(tx, merged);
      await ensureRequiredSubjectUsesSingleStream(tx, {
        classSubjectId,
        subjectId: merged.subjectId,
        termId: merged.termId,
        exceptAssignmentId: id,
      });
      const subjectStream = await ensureSubjectStream(tx, { ...merged, classLevelId }, classSubjectId, streamName);
      await ensureStreamHasNoOtherTeacher(tx, subjectStream?.id, merged.teacherId, id);

      const updated = await tx.teachingAssignment.update({
        where: { id },
        data: { teacherId: merged.teacherId, classGroupId: null, subjectId: merged.subjectId, termId: merged.termId, classSubjectId, subjectStreamId: subjectStream.id },
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
