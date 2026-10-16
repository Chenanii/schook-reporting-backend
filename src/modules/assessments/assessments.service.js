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
  'maxMark',
  'weightPercent',
];

function auditSnapshot(assessment) {
  return {
    title: assessment.title,
    assessmentType: assessment.assessmentType,
    maxMark: assessment.maxMark.toString(),
    weightPercent: assessment.weightPercent.toString(),
    termId: assessment.termId,
    subjectId: assessment.subjectId,
    teachingAssignmentId: assessment.teachingAssignmentId,
    status: assessment.status,
  };
}

export async function createAssessment(data, actorId, req, teacherUserId = null) {
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

  const assessment = await prisma.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        title: data.title,
        assessmentType: data.assessmentType,
        maxMark: data.maxMark,
        weightPercent: data.assessmentType === 'FINAL_EXAM' ? 60 : data.weightPercent,
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
  return prisma.assessment.findMany({
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

  if (existing.status !== 'DRAFT') {
    throw httpError(
      409,
      'ASSESSMENT_NOT_EDITABLE',
      'Only assessments in DRAFT status can be edited.',
    );
  }

  if (existing._count.results > 0) {
    throw httpError(
      409,
      'ASSESSMENT_HAS_RESULTS',
      'This assessment already has results and cannot be edited.',
    );
  }

  const updateData = Object.fromEntries(
    Object.entries(data).filter(([key]) => editableFields.includes(key)),
  );
  const nextType = data.assessmentType ?? existing.assessmentType;
  if (nextType === 'FINAL_EXAM') {
    updateData.weightPercent = 60;
  } else {
    const nextWeight = data.weightPercent ?? (
      existing.assessmentType === 'FINAL_EXAM' && data.assessmentType ? 40 : Number(existing.weightPercent)
    );
    if (nextWeight > 40) {
      throw httpError(400, 'ASSESSMENT_WEIGHT_INVALID', 'Coursework and mid-term assessment weights cannot exceed 40%.');
    }
    if (data.assessmentType && existing.assessmentType === 'FINAL_EXAM') {
      updateData.weightPercent = nextWeight;
    }
  }

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
