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
    entityType: 'AssessmentResult',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
  };
}

function resultSnapshot(result) {
  return {
    assessmentId: result.assessmentId,
    enrollmentId: result.enrollmentId,
    mark: result.mark?.toString() ?? null,
    status: result.status,
    teacherComment: result.teacherComment,
    enteredById: result.enteredById,
  };
}

export async function saveAssessmentResults(
  assessmentId,
  inputResults,
  actorId,
  req,
) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      title: true,
      maxMark: true,
      termId: true,
      status: true,
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

  if (!['DRAFT', 'OPEN'].includes(assessment.status)) {
    throw httpError(
      409,
      'ASSESSMENT_NOT_EDITABLE',
      'Results can only be entered while the assessment is in DRAFT or OPEN status.',
    );
  }

  if (assessment.teachingAssignment.termId !== assessment.termId) {
    throw httpError(
      409,
      'ASSESSMENT_ASSIGNMENT_MISMATCH',
      'The assessment and its teaching assignment have inconsistent terms.',
    );
  }

  const enrollmentIds = inputResults.map((result) => result.enrollmentId);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      id: { in: enrollmentIds },
      termId: assessment.termId,
      classGroupId: assessment.teachingAssignment.classGroupId,
    },
    select: {
      id: true,
      studentId: true,
      status: true,
    },
  });

  const enrollmentMap = new Map(
    enrollments.map((enrollment) => [enrollment.id, enrollment]),
  );

  const invalidEnrollmentIds = enrollmentIds.filter(
    (id) => !enrollmentMap.has(id),
  );

  if (invalidEnrollmentIds.length > 0) {
    throw httpError(
      400,
      'INVALID_ENROLLMENTS',
      'One or more students are not enrolled in the class and term for this assessment.',
    );
  }

  const inactiveStatuses = enrollments.filter(
    (enrollment) => !['ACTIVE'].includes(enrollment.status),
  );

  if (inactiveStatuses.length > 0) {
    throw httpError(
      409,
      'INACTIVE_ENROLLMENTS',
      'Results can only be entered for ACTIVE enrollments.',
    );
  }

  const maxMark = Number(assessment.maxMark);

  for (const result of inputResults) {
    if (result.status === 'PRESENT' && result.mark > maxMark) {
      throw httpError(
        400,
        'MARK_EXCEEDS_MAXIMUM',
        `A mark cannot exceed the assessment maximum of ${maxMark}.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const savedResults = [];

    for (const input of inputResults) {
      const existing = await tx.assessmentResult.findUnique({
        where: {
          assessmentId_enrollmentId: {
            assessmentId,
            enrollmentId: input.enrollmentId,
          },
        },
      });

      const mark =
        input.status === 'PRESENT' ? input.mark : null;

      const enteredAt =
        input.status === 'NOT_ENTERED' ? null : new Date();

      const saved = await tx.assessmentResult.upsert({
        where: {
          assessmentId_enrollmentId: {
            assessmentId,
            enrollmentId: input.enrollmentId,
          },
        },
        create: {
          assessmentId,
          enrollmentId: input.enrollmentId,
          mark,
          status: input.status,
          teacherComment: input.teacherComment ?? null,
          enteredById: input.status === 'NOT_ENTERED' ? null : actorId,
          enteredAt,
        },
        update: {
          mark,
          status: input.status,
          teacherComment: input.teacherComment ?? null,
          enteredById: input.status === 'NOT_ENTERED' ? null : actorId,
          enteredAt,
        },
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          existing ? 'ASSESSMENT_RESULT_UPDATED' : 'ASSESSMENT_RESULT_CREATED',
          saved.id,
          existing ? resultSnapshot(existing) : null,
          resultSnapshot(saved),
          req,
        ),
      });

      savedResults.push(saved);
    }

    return savedResults;
  });
}
