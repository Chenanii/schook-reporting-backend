import { prisma } from '../../lib/prisma.js';

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

export async function transitionAssessment(assessmentId, actorId, req) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      teachingAssignment: {
        select: {
          termId: true,
          classGroupId: true,
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
        classGroupId: assessment.teachingAssignment.classGroupId,
        status: 'ACTIVE',
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
