import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resultSnapshot(result) {
  return {
    enrollmentId: result.enrollmentId,
    subjectId: result.subjectId,
    finalMark: result.finalMark?.toString() ?? null,
    grade: result.grade,
    status: result.status,
  };
}

export async function calculateTermSubjectResults({
  termId,
  classGroupId,
  subjectId,
  actorId,
  req,
}) {
  if (!termId || !classGroupId || !subjectId) {
    throw httpError(
      400,
      'MISSING_CALCULATION_FILTERS',
      'termId, classGroupId, and subjectId are required.',
    );
  }

  const term = await prisma.term.findUnique({
    where: { id: termId },
    include: {
      academicYear: {
        include: {
          gradeScale: {
            include: {
              boundaries: {
                orderBy: { minPercent: 'asc' },
              },
            },
          },
        },
      },
    },
  });

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'Term not found.');
  }

  if (!term.academicYear.gradeScale) {
    throw httpError(
      409,
      'GRADE_SCALE_NOT_CONFIGURED',
      'Configure a grade scale for this academic year before calculating results.',
    );
  }

  const boundaries = term.academicYear.gradeScale.boundaries;

  if (boundaries.length === 0) {
    throw httpError(
      409,
      'GRADE_BOUNDARIES_MISSING',
      'The configured grade scale has no grade boundaries.',
    );
  }

  const assessments = await prisma.assessment.findMany({
    where: {
      termId,
      subjectId,
      teachingAssignment: { classGroupId },
    },
    include: {
      results: true,
    },
    orderBy: { title: 'asc' },
  });

  if (assessments.length === 0) {
    throw httpError(
      404,
      'ASSESSMENTS_NOT_FOUND',
      'No assessments were found for this class, subject, and term.',
    );
  }

  const unlocked = assessments.filter(
    (assessment) => assessment.status !== 'LOCKED',
  );

  if (unlocked.length > 0) {
    throw httpError(
      409,
      'ASSESSMENTS_NOT_LOCKED',
      'Every assessment must be locked before term results can be calculated.',
    );
  }

  const componentAssessments = assessments.filter(
    (assessment) =>
      ['COURSEWORK', 'MID_TERM_EXAM'].includes(assessment.assessmentType),
  );

  const finalExams = assessments.filter(
    (assessment) => assessment.assessmentType === 'FINAL_EXAM',
  );

  const unsupported = assessments.filter(
    (assessment) =>
      !['COURSEWORK', 'MID_TERM_EXAM', 'FINAL_EXAM'].includes(
        assessment.assessmentType,
      ),
  );

  if (unsupported.length > 0) {
    throw httpError(
      409,
      'UNSUPPORTED_ASSESSMENT_TYPE',
      'One or more assessments have an unsupported assessment type.',
    );
  }

  if (componentAssessments.length === 0) {
    throw httpError(
      409,
      'CONTINUOUS_ASSESSMENT_MISSING',
      'At least one coursework or mid-term assessment is required.',
    );
  }

  if (finalExams.length !== 1) {
    throw httpError(
      409,
      'FINAL_EXAM_CONFIGURATION_INVALID',
      'Exactly one locked FINAL_EXAM assessment is required per class, subject, and term.',
    );
  }

  const totalWeight = componentAssessments.reduce(
    (sum, assessment) => sum + Number(assessment.weightPercent),
    0,
  );

  if (Math.abs(totalWeight - 100) > 0.01) {
    throw httpError(
      409,
      'CONTINUOUS_ASSESSMENT_WEIGHTS_INVALID',
      `Coursework and mid-term assessment weights must total 100%. Current total: ${round2(totalWeight)}%.`,
    );
  }

  const finalExam = finalExams[0];

  const enrollments = await prisma.enrollment.findMany({
    where: {
      termId,
      classGroupId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  if (enrollments.length === 0) {
    throw httpError(
      409,
      'NO_ACTIVE_ENROLLMENTS',
      'There are no active enrollments to calculate.',
    );
  }

  const assessmentResults = new Map();

  for (const assessment of assessments) {
    assessmentResults.set(
      assessment.id,
      new Map(
        assessment.results.map((result) => [
          result.enrollmentId,
          result,
        ]),
      ),
    );
  }

  const calculations = [];

  for (const enrollment of enrollments) {
    const studentResults = assessments.map((assessment) => ({
      assessment,
      result: assessmentResults.get(assessment.id).get(enrollment.id),
    }));

    const missing = studentResults.some(
      ({ result }) =>
        !result || result.status === 'NOT_ENTERED',
    );

    if (missing) {
      throw httpError(
        409,
        'STUDENT_RESULTS_INCOMPLETE',
        `Enrollment ${enrollment.id} has missing assessment results. No term results were saved.`,
      );
    }

    const finalResult = assessmentResults
      .get(finalExam.id)
      .get(enrollment.id);

    if (finalResult.status === 'EXEMPT') {
      throw httpError(
        409,
        'FINAL_EXAM_EXEMPTION_REQUIRES_REVIEW',
        `Enrollment ${enrollment.id} is exempt from the final exam. Manual review is required.`,
      );
    }

    const finalExamPercent =
      finalResult.status === 'ABSENT'
        ? 0
        : (Number(finalResult.mark) / Number(finalExam.maxMark)) * 100;

    const eligibleComponents = componentAssessments
      .map((assessment) => {
        const result = assessmentResults
          .get(assessment.id)
          .get(enrollment.id);

        return {
          assessment,
          result,
          weight: Number(assessment.weightPercent),
        };
      })
      .filter(({ result }) => result.status !== 'EXEMPT');

    const eligibleWeight = eligibleComponents.reduce(
      (sum, item) => sum + item.weight,
      0,
    );

    if (eligibleWeight <= 0) {
      throw httpError(
        409,
        'CONTINUOUS_ASSESSMENT_NOT_CALCULABLE',
        `Enrollment ${enrollment.id} has no eligible coursework or mid-term marks.`,
      );
    }

    const continuousPercent = eligibleComponents.reduce(
      (sum, { assessment, result, weight }) => {
        const percent =
          result.status === 'ABSENT'
            ? 0
            : (Number(result.mark) / Number(assessment.maxMark)) * 100;

        return sum + percent * (weight / eligibleWeight);
      },
      0,
    );

    const finalMark = round2(
      continuousPercent * 0.4 + finalExamPercent * 0.6,
    );

    const boundary = [...boundaries]
      .reverse()
      .find((item) => finalMark >= Number(item.minPercent));

    if (!boundary) {
      throw httpError(
        409,
        'GRADE_BOUNDARY_NOT_FOUND',
        `No grade boundary matches the calculated mark ${finalMark}%.`,
      );
    }

    calculations.push({
      enrollmentId: enrollment.id,
      subjectId,
      finalMark: finalMark.toFixed(2),
      grade: boundary.grade,
      gradeDescription: boundary.description ?? null,
    });
  }

  return prisma.$transaction(async (tx) => {
    const savedResults = [];

    for (const calculation of calculations) {
      const existing = await tx.termSubjectResult.findUnique({
        where: {
          enrollmentId_subjectId: {
            enrollmentId: calculation.enrollmentId,
            subjectId: calculation.subjectId,
          },
        },
      });

      if (
        existing &&
        ['FINALIZED', 'PUBLISHED'].includes(existing.status)
      ) {
        throw httpError(
          409,
          'TERM_RESULT_ALREADY_FINALIZED',
          `The result for enrollment ${calculation.enrollmentId} is already finalized or published.`,
        );
      }

      const saved = await tx.termSubjectResult.upsert({
        where: {
          enrollmentId_subjectId: {
            enrollmentId: calculation.enrollmentId,
            subjectId: calculation.subjectId,
          },
        },
        create: {
          ...calculation,
          status: 'DRAFT',
          calculatedAt: new Date(),
        },
        update: {
          finalMark: calculation.finalMark,
          grade: calculation.grade,
          gradeDescription: calculation.gradeDescription,
          calculatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: existing
            ? 'TERM_RESULT_RECALCULATED'
            : 'TERM_RESULT_CALCULATED',
          entityType: 'TermSubjectResult',
          entityId: saved.id,
          oldValues: existing ? resultSnapshot(existing) : undefined,
          newValues: resultSnapshot(saved),
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500),
        },
      });

      savedResults.push(saved);
    }

    return savedResults;
  });
}
