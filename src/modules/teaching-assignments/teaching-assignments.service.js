import { prisma } from '../../lib/prisma.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
    termId: assignment.termId,
    academicYearId: assignment.term?.academicYearId ?? null
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
    select: { id: true, firstName: true, lastName: true, staffNumber: true }
  },
  classGroup: {
    include: {
      classLevel: { select: { id: true, name: true, levelOrder: true } }
    }
  },
  classSubject: {
    include: {
      classLevel: { select: { id: true, name: true, levelOrder: true } },
      subject: { select: { id: true, code: true, name: true, status: true } }
    }
  },
  subject: {
    select: { id: true, code: true, name: true, status: true }
  },
  subjectStream: {
    include: {
      subject: { select: { id: true, code: true, name: true } },
      classLevel: { select: { id: true, name: true, levelOrder: true } },
      term: { select: { id: true, name: true, sequence: true } }
    }
  },
  term: {
    include: { academicYear: { select: { id: true, name: true, isCurrent: true } } }
  },
  _count: { select: { assessments: true } }
};

/**
 * Decide whether a request is class-group based.
 * Priority: explicit assignmentType -> existing record's mode -> presence of classGroupId.
 */
function isClassBased(data, existing = null) {
  if (data.assignmentType) return data.assignmentType === 'CLASS';
  if (existing) return Boolean(existing.classGroupId);
  return Boolean(data.classGroupId);
}

function normalizeStreamName(value, fallback = 'A') {
  return value?.trim().toLocaleUpperCase() || fallback;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

async function validateAssignmentReferences(tx, data) {
  const [teacher, classGroup, subject, academicYear] = await Promise.all([
    tx.teacher.findUnique({
      where: { id: data.teacherId },
      select: { id: true }
    }),
    data.classGroupId
      ? tx.classGroup.findUnique({
          where: { id: data.classGroupId },
          select: { id: true, classLevelId: true }
        })
      : Promise.resolve(null),
    tx.subject.findUnique({
      where: { id: data.subjectId },
      select: {
        id: true,
        status: true,
        classLinks: { select: { id: true, classLevelId: true } }
      }
    }),
    tx.academicYear.findUnique({
      where: { id: data.academicYearId },
      select: { id: true, schoolId: true }
    })
  ]);

  if (!teacher) {
    throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher not found.');
  }

  if (data.classGroupId && !classGroup) {
    throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  }

  const classLevelId = data.classLevelId || classGroup?.classLevelId;
  if (!classLevelId) {
    throw httpError(400, 'CLASS_LEVEL_REQUIRED', 'A class level is required for this assignment.');
  }
  const classLevel = await tx.classLevel.findUnique({
    where: { id: classLevelId },
    select: { id: true, schoolId: true }
  });
  if (!classLevel) throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found.');
  if (classGroup && classGroup.classLevelId !== classLevel.id) {
    throw httpError(400, 'CLASS_LEVEL_MISMATCH', 'The selected class group does not belong to the chosen class level.');
  }

  if (!subject) {
    throw httpError(404, 'SUBJECT_NOT_FOUND', 'Subject not found.');
  }

  if (!academicYear) {
    throw httpError(404, 'ACADEMIC_YEAR_NOT_FOUND', 'Academic year not found.');
  }

  const classSubject = subject.classLinks.find((link) => link.classLevelId === classLevel.id);

  if (subject.classLinks.length > 0 && !classSubject) {
    throw httpError(400, 'CLASS_LEVEL_MISMATCH', 'This subject is linked to a different class level.');
  }

  if (subject.status !== 'ACTIVE') {
    throw httpError(409, 'SUBJECT_NOT_ACTIVE', 'Only active subjects can be assigned to a teacher.');
  }

  if (classLevel.schoolId !== academicYear.schoolId) {
    throw httpError(400, 'ACADEMIC_YEAR_SCHOOL_MISMATCH', 'The academic year and class level must belong to the same school.');
  }

  const terms = await tx.term.findMany({
    where: { academicYearId: academicYear.id, schoolId: academicYear.schoolId },
    orderBy: { sequence: 'asc' },
    select: { id: true, name: true, sequence: true, academicYearId: true, schoolId: true, status: true }
  });
  if (terms.length !== 3 || terms.some((term, index) => term.sequence !== index + 1)) {
    throw httpError(409, 'ACADEMIC_YEAR_TERMS_INCOMPLETE', 'Create all three terms for this academic year before assigning a teacher.');
  }

  return {
    classSubjectId: classSubject?.id ?? null,
    classLevelId: classLevel.id,
    academicYear,
    terms
  };
}

/* -------------------------------------------------------------------------- */
/* Stream helpers (only used for stream-based allocations)                    */
/* -------------------------------------------------------------------------- */

async function ensureSubjectStream(tx, data, streamName) {
  const classLevel = await tx.classLevel.findUnique({
    where: { id: data.classLevelId },
    select: { schoolId: true }
  });
  return tx.subjectStream.upsert({
    where: {
      classLevelId_termId_subjectId_name: {
        classLevelId: data.classLevelId,
        termId: data.termId,
        subjectId: data.subjectId,
        name: streamName
      }
    },
    create: {
      name: streamName,
      classLevelId: data.classLevelId,
      termId: data.termId,
      subjectId: data.subjectId,
      schoolId: classLevel.schoolId
    },
    update: {}
  });
}

async function ensureRequiredSubjectUsesSingleStream(tx, {
  classSubjectId,
  subjectId,
  termId,
  exceptAssignmentId = null
}) {
  if (!classSubjectId) return;
  const classSubject = await tx.classSubject.findUnique({
    where: { id: classSubjectId },
    select: { isRequired: true }
  });
  if (!classSubject?.isRequired) return;

  const existing = await tx.teachingAssignment.findFirst({
    where: {
      classSubjectId,
      subjectId,
      termId,
      subjectStreamId: { not: null },
      ...(exceptAssignmentId ? { id: { not: exceptAssignmentId } } : {})
    },
    select: { id: true }
  });
  if (existing) {
    throw httpError(
      409,
      'REQUIRED_SUBJECT_MULTIPLE_STREAMS',
      'A required subject can have only one teaching stream per class level and term.'
    );
  }
}

async function ensureStreamIsAvailable(tx, subjectStreamId, allowedAssignmentIds = []) {
  if (!subjectStreamId) return;
  const existing = await tx.teachingAssignment.findFirst({
    where: {
      subjectStreamId,
      ...(allowedAssignmentIds.length ? { id: { notIn: allowedAssignmentIds } } : {})
    },
    select: { id: true, teacherId: true }
  });
  if (existing) {
    throw httpError(409, 'SUBJECT_STREAM_ASSIGNMENT_ALREADY_EXISTS', 'This subject stream is already part of another teaching assignment.');
  }
}

/**
 * A subject at a class level and term is taught either per class group or per
 * subject stream, never both (otherwise the same students get two teachers).
 */
async function ensureNoModeConflict(tx, { classLevelId, subjectId, termId, classBased, exceptIds = [] }) {
  const conflict = await tx.teachingAssignment.findFirst({
    where: {
      subjectId,
      termId,
      ...(exceptIds.length ? { id: { notIn: exceptIds } } : {}),
      ...(classBased
        ? { subjectStreamId: { not: null }, subjectStream: { is: { classLevelId } } }
        : { classGroupId: { not: null }, classGroup: { is: { classLevelId } } })
    },
    select: { id: true }
  });
  if (conflict) {
    throw httpError(
      409,
      'ASSIGNMENT_MODE_CONFLICT',
      classBased
        ? 'This subject already uses subject streams at this class level. Remove those allocations first.'
        : 'This subject is already assigned per class group at this class level. Remove those allocations first.'
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Annual assignment lookup                                                   */
/* -------------------------------------------------------------------------- */

function annualAssignmentWhere({ academicYearId, classLevelId, subjectId, streamName, classGroupId = null }) {
  const base = { subjectId, term: { is: { academicYearId } } };

  if (classGroupId) {
    return { ...base, classGroupId, subjectStreamId: null };
  }

  return {
    ...base,
    classGroupId: null,
    subjectStream: { is: { classLevelId, subjectId, name: streamName } }
  };
}

async function findAnnualAssignments(tx, scope) {
  const assignments = await tx.teachingAssignment.findMany({
    where: annualAssignmentWhere(scope),
    include: {
      subjectStream: true,
      term: { select: { id: true, sequence: true, academicYearId: true } },
      _count: { select: { assessments: true } }
    }
  });
  const bySequence = new Map();
  for (const assignment of assignments) {
    if (bySequence.has(assignment.term.sequence)) {
      throw httpError(
        409,
        'DUPLICATE_ANNUAL_ASSIGNMENT',
        'More than one assignment exists for this section in the same term. Resolve the duplicate before editing the yearly allocation.'
      );
    }
    bySequence.set(assignment.term.sequence, assignment);
  }
  return bySequence;
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createTeachingAssignment(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const classBased = isClassBased(data);
      if (classBased && !data.classGroupId) {
        throw httpError(400, 'CLASS_GROUP_REQUIRED', 'Select a class group for a class-based assignment.');
      }

      const { classSubjectId, classLevelId, terms } = await validateAssignmentReferences(tx, {
        ...data,
        classGroupId: classBased ? data.classGroupId : undefined
      });
      const streamName = classBased ? null : normalizeStreamName(data.streamName);

      const existingBySequence = await findAnnualAssignments(tx, {
        academicYearId: terms[0].academicYearId,
        classLevelId,
        subjectId: data.subjectId,
        streamName,
        classGroupId: classBased ? data.classGroupId : null
      });
      if (existingBySequence.size) {
        throw httpError(
          409,
          'ANNUAL_ASSIGNMENT_ALREADY_EXISTS',
          classBased
            ? 'This class group already has a teacher for this subject in this academic year. Edit the existing allocation to change its teacher.'
            : 'This subject stream already has an assignment in this academic year. Edit the existing allocation to change its teacher.'
        );
      }

      const annualAssignments = [];

      for (const term of terms) {
        await ensureNoModeConflict(tx, {
          classLevelId,
          subjectId: data.subjectId,
          termId: term.id,
          classBased
        });

        let subjectStreamId = null;
        if (!classBased) {
          await ensureRequiredSubjectUsesSingleStream(tx, {
            classSubjectId,
            subjectId: data.subjectId,
            termId: term.id
          });
          const stream = await ensureSubjectStream(
            tx,
            { classLevelId, subjectId: data.subjectId, termId: term.id },
            streamName
          );
          await ensureStreamIsAvailable(tx, stream.id);
          subjectStreamId = stream.id;
        }

        const assignment = await tx.teachingAssignment.create({
          data: {
            teacherId: data.teacherId,
            classGroupId: classBased ? data.classGroupId : null,
            subjectId: data.subjectId,
            termId: term.id,
            classSubjectId,
            subjectStreamId
          },
          include: assignmentInclude
        });

        await tx.auditLog.create({
          data: auditData(actorId, 'TEACHING_ASSIGNMENT_CREATED', assignment.id, null, snapshot(assignment), req)
        });
        annualAssignments.push(assignment);
      }

      return annualAssignments[0];
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Read                                                                       */
/* -------------------------------------------------------------------------- */

export async function listTeachingAssignments(filters, teacherUserId = null) {
  const { page, limit, teacherId, classGroupId, subjectId, termId } = filters;

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
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

export async function getTeachingAssignmentById(id) {
  const assignment = await prisma.teachingAssignment.findUnique({
    where: { id },
    include: assignmentInclude
  });

  if (!assignment) {
    throw httpError(404, 'TEACHING_ASSIGNMENT_NOT_FOUND', 'Teaching assignment not found.');
  }

  return assignment;
}

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

export async function updateTeachingAssignment(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.teachingAssignment.findUnique({
        where: { id },
        include: {
          subjectStream: true,
          classGroup: { select: { id: true, classLevelId: true } },
          term: { select: { id: true, sequence: true, academicYearId: true } },
          _count: { select: { assessments: true } }
        }
      });

      if (!existing) {
        throw httpError(404, 'TEACHING_ASSIGNMENT_NOT_FOUND', 'Teaching assignment not found.');
      }

      const existingClassBased = Boolean(existing.classGroupId);
      const classBased = isClassBased(data, existing);
      const existingLevelId = existing.subjectStream?.classLevelId ?? existing.classGroup?.classLevelId;

      const merged = {
        teacherId: data.teacherId ?? existing.teacherId,
        classGroupId: classBased ? (data.classGroupId ?? existing.classGroupId ?? undefined) : undefined,
        classLevelId: data.classLevelId ?? existingLevelId ?? undefined,
        subjectId: data.subjectId ?? existing.subjectId,
        academicYearId: data.academicYearId ?? existing.term.academicYearId
      };
      if (classBased && !merged.classGroupId) {
        throw httpError(400, 'CLASS_GROUP_REQUIRED', 'Select a class group for a class-based assignment.');
      }
      const streamName = classBased
        ? null
        : normalizeStreamName(data.streamName, existing.subjectStream?.name || 'A');

      if (merged.academicYearId !== existing.term.academicYearId) {
        throw httpError(400, 'ACADEMIC_YEAR_CHANGE_NOT_ALLOWED', 'Create a new teaching assignment to move an allocation to another academic year.');
      }

      const changesStructure =
        classBased !== existingClassBased ||
        merged.subjectId !== existing.subjectId ||
        Boolean(merged.classLevelId && merged.classLevelId !== existingLevelId) ||
        (classBased
          ? merged.classGroupId !== existing.classGroupId
          : streamName !== existing.subjectStream?.name);

      const oldScope = {
        academicYearId: existing.term.academicYearId,
        classLevelId: existingLevelId,
        subjectId: existing.subjectId,
        streamName: existing.subjectStream?.name ?? null,
        classGroupId: existing.classGroupId
      };
      const oldAssignmentsBySequence = await findAnnualAssignments(tx, oldScope);
      const oldAssignments = [...oldAssignmentsBySequence.values()];
      if (changesStructure && oldAssignments.some((a) => a._count.assessments > 0)) {
        throw httpError(
          409,
          'ASSIGNMENT_HAS_ASSESSMENTS',
          'The type, class, subject, or stream cannot be changed because assessments exist in this academic year. Create a new assignment instead.'
        );
      }

      const { classSubjectId, classLevelId, terms } = await validateAssignmentReferences(tx, merged);
      const effectiveFromTerm = terms.find((t) => t.id === (data.effectiveFromTermId ?? existing.term.id));
      if (!effectiveFromTerm) {
        throw httpError(400, 'INVALID_EFFECTIVE_TERM', 'Choose an effective term from the assignment academic year.');
      }
      if (
        data.teacherId &&
        data.teacherId !== existing.teacherId &&
        terms.some((t) => t.sequence >= effectiveFromTerm.sequence && !['DRAFT', 'OPEN'].includes(t.status))
      ) {
        throw httpError(409, 'TERM_NOT_AVAILABLE', 'A teacher change can only apply to the selected open term and later terms that have not been finalized.');
      }
      if (changesStructure && effectiveFromTerm.sequence !== 1) {
        throw httpError(400, 'STRUCTURE_CHANGE_MUST_START_AT_YEAR', 'Type, class, subject, and stream changes must apply from the first term. Teacher changes can start from any term.');
      }

      const targetAssignmentsBySequence = await findAnnualAssignments(tx, {
        academicYearId: terms[0].academicYearId,
        classLevelId,
        subjectId: merged.subjectId,
        streamName,
        classGroupId: classBased ? merged.classGroupId : null
      });
      const oldAssignmentIds = oldAssignments.map((a) => a.id);
      for (const [sequence, target] of targetAssignmentsBySequence) {
        if (!oldAssignmentIds.includes(target.id)) {
          throw httpError(409, 'ANNUAL_ASSIGNMENT_ALREADY_EXISTS', `A teaching assignment already exists for this section in term ${sequence}.`);
        }
      }

      const updatedAssignments = [];
      for (const term of terms) {
        if (term.sequence < effectiveFromTerm.sequence) continue;

        const reusable =
          targetAssignmentsBySequence.get(term.sequence) || oldAssignmentsBySequence.get(term.sequence);

        await ensureNoModeConflict(tx, {
          classLevelId,
          subjectId: merged.subjectId,
          termId: term.id,
          classBased,
          exceptIds: oldAssignmentIds
        });

        let subjectStreamId = null;
        if (!classBased) {
          await ensureRequiredSubjectUsesSingleStream(tx, {
            classSubjectId,
            subjectId: merged.subjectId,
            termId: term.id,
            exceptAssignmentId: reusable?.id ?? null
          });
          const stream = await ensureSubjectStream(
            tx,
            { classLevelId, subjectId: merged.subjectId, termId: term.id },
            streamName
          );
          await ensureStreamIsAvailable(tx, stream.id, oldAssignmentIds);
          subjectStreamId = stream.id;
        }

        const row = {
          teacherId: merged.teacherId,
          classGroupId: classBased ? merged.classGroupId : null,
          subjectId: merged.subjectId,
          termId: term.id,
          classSubjectId,
          subjectStreamId
        };

        const updated = reusable
          ? await tx.teachingAssignment.update({ where: { id: reusable.id }, data: row, include: assignmentInclude })
          : await tx.teachingAssignment.create({ data: row, include: assignmentInclude });

        await tx.auditLog.create({
          data: auditData(
            actorId,
            reusable ? 'TEACHING_ASSIGNMENT_UPDATED' : 'TEACHING_ASSIGNMENT_CREATED',
            updated.id,
            reusable ? snapshot(reusable) : null,
            snapshot(updated),
            req
          )
        });
        updatedAssignments.push(updated);
      }

      const updated = updatedAssignments.find((a) => a.id === id) ?? updatedAssignments[0];
      if (!updated) {
        throw httpError(400, 'EFFECTIVE_TERM_BEFORE_ASSIGNMENT', 'The effective term must be the selected assignment term or a later term.');
      }
      return updated;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteTeachingAssignment(id, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.teachingAssignment.findUnique({
        where: { id },
        include: {
          subjectStream: true,
          term: { select: { sequence: true, academicYearId: true } },
          _count: { select: { assessments: true } }
        }
      });

      if (!existing) {
        throw httpError(404, 'TEACHING_ASSIGNMENT_NOT_FOUND', 'Teaching assignment not found.');
      }

      const annualAssignmentsBySequence = await findAnnualAssignments(tx, {
        academicYearId: existing.term.academicYearId,
        classLevelId: existing.subjectStream?.classLevelId,
        subjectId: existing.subjectId,
        streamName: existing.subjectStream?.name ?? null,
        classGroupId: existing.classGroupId
      });
      const annualAssignments = [...annualAssignmentsBySequence.values()];
      if (annualAssignments.some((a) => a._count.assessments > 0)) {
        throw httpError(409, 'ASSIGNMENT_HAS_ASSESSMENTS', 'This academic-year assignment has assessments and cannot be deleted.');
      }

      for (const assignment of annualAssignments) {
        await tx.teachingAssignment.delete({ where: { id: assignment.id } });
        await tx.auditLog.create({
          data: auditData(actorId, 'TEACHING_ASSIGNMENT_DELETED', assignment.id, snapshot(assignment), null, req)
        });
      }

      return { id, deletedCount: annualAssignments.length };
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}
