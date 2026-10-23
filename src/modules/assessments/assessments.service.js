import { prisma } from '../../lib/prisma.js';
import { teacherAssessmentScope } from './assessment-access.js';

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
    entityType: 'Assessment',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
  };
}

const assessmentInclude = {
  term: {
    select: {
      id: true,
      name: true,
      status: true,
      academicYearId: true,
    },
  },
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  teachingAssignment: {
    include: {
      teacher: true,
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
          subject: true,
          classLevel: true,
        },
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
          subject: { select: { id: true, name: true, code: true } },
          classLevel: { select: { id: true, name: true, levelOrder: true } },
        },
      }
    },
  },
  _count: {
    select: {
      results: true,
    },
  },
};

const editableFields = [
  'title',
  'assessmentType',
  'assessmentDate',
];

function isExamType(type) {
  return ['MID_TERM_EXAM', 'FINAL_EXAM'].includes(type);
}

function asDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function auditSnapshot(assessment) {
  return {
    title: assessment.title,
    assessmentType: assessment.assessmentType,
    assessmentDate: assessment.assessmentDate?.toISOString().slice(0, 10) ?? null,
    maxMark: assessment.maxMark.toString(),
    termId: assessment.termId,
    subjectId: assessment.subjectId,
    teachingAssignmentId: assessment.teachingAssignmentId,
    status: assessment.status,
  };
}

export async function createAssessment(data, actorId, req, teacherUserId = null) {
  if (isExamType(data.assessmentType) && !data.assessmentDate) {
    throw httpError(400, 'ASSESSMENT_DATE_REQUIRED', 'An exam date is required for mid-term and final exams.');
  }
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      id: data.teachingAssignmentId,
      ...(teacherUserId ? { teacher: { userId: teacherUserId } } : {}),
    },
    select: {
      id: true,
      termId: true,
      subjectId: true,
    },
  });

  if (!assignment) {
    throw httpError(
      404,
      'TEACHING_ASSIGNMENT_NOT_FOUND',
      'The selected teaching assignment was not found.',
    );
  }

  if (assignment.termId !== data.termId) {
    throw httpError(
      400,
      'ASSIGNMENT_TERM_MISMATCH',
      'The teaching assignment does not belong to the selected term.',
    );
  }

  const term = await prisma.term.findUnique({
    where: { id: data.termId },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'The selected term was not found.');
  }

  if (!['DRAFT', 'OPEN'].includes(term.status)) {
    throw httpError(
      409,
      'TERM_NOT_AVAILABLE',
      'Assessments can only be created when the term is in DRAFT or OPEN status.',
    );
  }

  const assessmentDate = asDate(data.assessmentDate);
  if (assessmentDate && (assessmentDate < term.startDate || assessmentDate > term.endDate)) {
    throw httpError(400, 'ASSESSMENT_DATE_OUTSIDE_TERM', 'The exam date must fall within the selected term.');
  }

  const assessment = await prisma.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        title: data.title,
        assessmentType: data.assessmentType,
        assessmentDate,
        maxMark: 100,
        termId: data.termId,
        teachingAssignmentId: assignment.id,
        subjectId: assignment.subjectId,
      },
      include: assessmentInclude,
    });

    await tx.auditLog.create({
      data: auditData(
        actorId,
        'ASSESSMENT_CREATED',
        created.id,
        null,
        auditSnapshot(created),
        req,
      ),
    });

    return created;
  });

  return assessment;
}

export async function listAssessments(filters = {}, teacherUserId = null) {
  const assessments = await prisma.assessment.findMany({
    where: {
      ...teacherAssessmentScope(teacherUserId),
      ...(filters.termId && { termId: filters.termId }),
      ...(filters.subjectId && { subjectId: filters.subjectId }),
      ...(filters.teachingAssignmentId && {
        teachingAssignmentId: filters.teachingAssignmentId,
      }),
      ...(filters.status && { status: filters.status }),
      ...(filters.assessmentType && {
        assessmentType: filters.assessmentType,
      }),
    },
    include: assessmentInclude,
    orderBy: [
      { termId: 'asc' },
      { title: 'asc' },
    ],
  });

  const assessmentIds = assessments.map(({ id }) => id);
  const resets = assessmentIds.length
    ? await prisma.auditLog.findMany({
        where: {
          entityType: 'Assessment',
          entityId: { in: assessmentIds },
          action: 'ASSESSMENT_RESET',
        },
        select: { entityId: true },
      })
    : [];
  const resetAssessmentIds = new Set(resets.map(({ entityId }) => entityId));

  return assessments.map((assessment) => ({
    ...assessment,
    adminReopened: assessment.status === 'OPEN' && resetAssessmentIds.has(assessment.id),
  }));
}

export async function getAssessmentById(id, teacherUserId = null) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, ...teacherAssessmentScope(teacherUserId) },
    include: assessmentInclude,
  });

  if (!assessment) {
    throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }

  return assessment;
}

export async function updateAssessment(id, data, actorId, req, teacherUserId = null) {
  const existing = await prisma.assessment.findFirst({
    where: { id, ...teacherAssessmentScope(teacherUserId) },
    include: {
      _count: {
        select: { results: true },
      },
    },
  });

  if (!existing) {
    throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }

  if (!['DRAFT', 'OPEN'].includes(existing.status)) {
    throw httpError(
      409,
      'ASSESSMENT_NOT_EDITABLE',
      'Only draft or open assessments can be edited.',
    );
  }

  const settingMissingExamDate = existing.assessmentDate == null
    && isExamType(existing.assessmentType)
    && typeof data.assessmentDate === 'string'
    && Object.keys(data).every((key) => key === 'assessmentDate');
  if (existing._count.results > 0 && !settingMissingExamDate) {
    throw httpError(
      409,
      'ASSESSMENT_HAS_RESULTS',
      'This assessment already has results and cannot be edited.',
    );
  }

  const term = await prisma.term.findFirst({
    where: { id: existing.termId, schoolId: existing.schoolId },
    select: { status: true, startDate: true, endDate: true },
  });
  if (!term || !['DRAFT', 'OPEN'].includes(term.status)) {
    throw httpError(409, 'TERM_NOT_EDITABLE', 'Assessments can only be edited while their term is in DRAFT or OPEN status.');
  }

  const updatedType = data.assessmentType || existing.assessmentType;
  const updatedDate = data.assessmentDate === undefined
    ? existing.assessmentDate
    : asDate(data.assessmentDate);
  if (isExamType(updatedType) && !updatedDate) {
    throw httpError(400, 'ASSESSMENT_DATE_REQUIRED', 'An exam date is required for mid-term and final exams.');
  }
  if (updatedDate && (updatedDate < term.startDate || updatedDate > term.endDate)) {
    throw httpError(400, 'ASSESSMENT_DATE_OUTSIDE_TERM', 'The exam date must fall within the selected term.');
  }

  const updateData = Object.fromEntries(
    Object.entries(data).filter(([key]) => editableFields.includes(key)),
  );
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.assessment.update({
      where: { id },
      data: updateData,
      include: assessmentInclude,
    });

    await tx.auditLog.create({
      data: auditData(
        actorId,
        'ASSESSMENT_UPDATED',
        result.id,
        auditSnapshot(existing),
        auditSnapshot(result),
        req,
      ),
    });

    return result;
  });

  return updated;
}

export async function deleteAssessment(id, actorId, req, teacherUserId = null) {
  const existing = await prisma.assessment.findFirst({
    where: { id, ...teacherAssessmentScope(teacherUserId) },
    include: { _count: { select: { results: true } } },
  });

  if (!existing) {
    throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }
  if (existing.status !== 'DRAFT') {
    throw httpError(409, 'ASSESSMENT_NOT_DELETABLE', 'Only draft assessments can be deleted.');
  }
  if (existing._count.results > 0) {
    throw httpError(409, 'ASSESSMENT_HAS_RESULTS', 'This assessment already has results and cannot be deleted.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.assessment.delete({ where: { id } });
    await tx.auditLog.create({
      data: auditData(
        actorId,
        'ASSESSMENT_DELETED',
        id,
        auditSnapshot(existing),
        null,
        req,
      ),
    });
  });

  return { id, title: existing.title };
}
