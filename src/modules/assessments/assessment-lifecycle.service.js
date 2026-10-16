import { prisma } from '../../lib/prisma.js';
import { teacherAssessmentScope } from './assessment-access.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const nextStatus = {
  DRAFT: 'OPEN',
  OPEN: 'SUBMITTED',
  SUBMITTED: 'APPROVED',
  APPROVED: 'LOCKED',
};

function snapshot(assessment) {
  return {
    status: assessment.status,
    title: assessment.title,
    termId: assessment.termId,
    teachingAssignmentId: assessment.teachingAssignmentId,
  };
}

export async function transitionAssessment(
  assessmentId,
  actorId,
  req,
  actorRole,
  teacherUserId = null,
) {
  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      ...teacherAssessmentScope(actorRole === 'TEACHER' ? teacherUserId : null),
    },
    include: {
      teachingAssignment: {
        select: {
          id: true,
          termId: true,
          classGroupId: true,
          classSubjectId: true,
          subjectStreamId: true,
        },
      },
    },
  });

  if (!assessment) {
    throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }

  const targetStatus = nextStatus[assessment.status];

  if (!targetStatus) {
    throw httpError(
      409,
      'INVALID_ASSESSMENT_TRANSITION',
      'This assessment has no further lifecycle transition.',
    );
  }

  if (actorRole === 'TEACHER' && !['OPEN', 'SUBMITTED'].includes(targetStatus)) {
    throw httpError(
      403,
      'ASSESSMENT_REVIEW_REQUIRED',
      'Teachers can submit assessments for review but cannot approve or lock them.',
    );
  }

  if (assessment.teachingAssignment.termId !== assessment.termId) {
    throw httpError(
      409,
      'ASSESSMENT_ASSIGNMENT_MISMATCH',
      'The assessment and teaching assignment terms do not match.',
    );
  }

  if (targetStatus === 'SUBMITTED') {
    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        termId: assessment.termId,
        ...(!assessment.teachingAssignment.subjectStreamId ? { classGroupId: assessment.teachingAssignment.classGroupId } : {}),
        status: 'ACTIVE',
        ...(assessment.teachingAssignment.subjectStreamId ? {
          subjectStreams: { some: { subjectStreamId: assessment.teachingAssignment.subjectStreamId, status: 'ACTIVE' } },
        } : {}),
      },
      select: { id: true },
    });

    const enteredResults = await prisma.assessmentResult.findMany({
      where: {
        assessmentId,
        enrollmentId: { in: activeEnrollments.map((item) => item.id) },
        status: { in: ['PRESENT', 'ABSENT', 'EXEMPT'] },
      },
      select: { enrollmentId: true },
    });

    const enteredIds = new Set(enteredResults.map((item) => item.enrollmentId));
    const missingCount = activeEnrollments.filter(
      (item) => !enteredIds.has(item.id),
    ).length;

    if (missingCount > 0) {
      throw httpError(
        409,
        'RESULTS_INCOMPLETE',
        `${missingCount} active enrollment(s) still need a result before submission.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.assessment.update({
      where: { id: assessmentId },
      data: { status: targetStatus },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: `ASSESSMENT_${targetStatus}`,
        entityType: 'Assessment',
        entityId: assessmentId,
        oldValues: snapshot(assessment),
        newValues: snapshot(updated),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
      },
    });

    return updated;
  });
}

export async function resetAssessment(assessmentId, actorId, req) {
  return prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        teachingAssignment: { select: { termId: true, classGroupId: true, subjectStreamId: true } },
      },
    });

    if (!assessment) throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
    if (['DRAFT', 'OPEN'].includes(assessment.status)) {
      throw httpError(409, 'ASSESSMENT_ALREADY_OPEN', 'This assessment is already open for editing.');
    }
    if (assessment.teachingAssignment.termId !== assessment.termId) {
      throw httpError(409, 'ASSESSMENT_ASSIGNMENT_MISMATCH', 'The assessment and teaching assignment terms do not match.');
    }

    const term = await tx.term.findUnique({
      where: { id: assessment.termId },
      select: { status: true },
    });
    if (!term || !['DRAFT', 'OPEN'].includes(term.status)) {
      throw httpError(409, 'TERM_NOT_EDITABLE', 'Assessments can only be reset while their term is in DRAFT or OPEN status.');
    }

    const resultScope = {
      subjectId: assessment.subjectId,
      enrollment: {
        is: {
          termId: assessment.termId,
          ...(!assessment.teachingAssignment.subjectStreamId ? { classGroupId: assessment.teachingAssignment.classGroupId } : {}),
          ...(assessment.teachingAssignment.subjectStreamId ? { subjectStreams: { some: { subjectStreamId: assessment.teachingAssignment.subjectStreamId, status: 'ACTIVE' } } } : {}),
        },
      },
    };
    const protectedResults = await tx.termSubjectResult.count({
      where: { ...resultScope, status: { in: ['FINALIZED', 'PUBLISHED'] } },
    });
    if (protectedResults > 0) {
      throw httpError(409, 'TERM_RESULTS_ALREADY_FINALIZED', 'Published or finalized term results must be reverted before this assessment can be reset.');
    }

    const invalidated = await tx.termSubjectResult.updateMany({
      where: { ...resultScope, status: 'DRAFT' },
      data: { finalMark: null, grade: null, gradeDescription: null, calculatedAt: null },
    });

    const updated = await tx.assessment.update({
      where: { id: assessment.id },
      data: { status: 'OPEN' },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'ASSESSMENT_RESET',
        entityType: 'Assessment',
        entityId: assessment.id,
        oldValues: snapshot(assessment),
        newValues: { ...snapshot(updated), marksPreserved: true, invalidatedDraftTermResults: invalidated.count },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
      },
    });

    return { ...updated, invalidatedDraftTermResults: invalidated.count };
  }, { isolationLevel: 'Serializable' });
}
