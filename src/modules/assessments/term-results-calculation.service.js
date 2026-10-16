import { prisma } from '../../lib/prisma.js';
import { calculateFinalSubjectMark } from './assessment-scoring.js';
import { getGradeScaleForClassLevel } from '../grade-scales/class-level-grade-scale.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
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

function calculateCohort(assessments, enrollments, boundaries, subjectId) {
  const unlocked = assessments.filter((assessment) => assessment.status !== 'LOCKED');
  if (unlocked.length) throw httpError(409, 'ASSESSMENTS_NOT_LOCKED', 'Every assessment must be locked before term results can be calculated.');
  const componentAssessments = assessments.filter((assessment) => ['COURSEWORK', 'MID_TERM_EXAM'].includes(assessment.assessmentType));
  const finalExams = assessments.filter((assessment) => assessment.assessmentType === 'FINAL_EXAM');
  const unsupported = assessments.filter((assessment) => !['COURSEWORK', 'MID_TERM_EXAM', 'FINAL_EXAM'].includes(assessment.assessmentType));
  if (unsupported.length) throw httpError(409, 'UNSUPPORTED_ASSESSMENT_TYPE', 'One or more assessments have an unsupported assessment type.');
  if (!componentAssessments.length) throw httpError(409, 'CONTINUOUS_ASSESSMENT_MISSING', 'At least one coursework or mid-term assessment is required.');
  if (finalExams.length !== 1) throw httpError(409, 'FINAL_EXAM_CONFIGURATION_INVALID', 'Exactly one locked FINAL_EXAM assessment is required per subject stream and term.');

  const finalExam = finalExams[0];
  const assessmentResults = new Map(assessments.map((assessment) => [
    assessment.id,
    new Map(assessment.results.map((result) => [result.enrollmentId, result])),
  ]));
  const calculations = [];
  for (const enrollment of enrollments) {
    const studentResults = assessments.map((assessment) => ({ assessment, result: assessmentResults.get(assessment.id).get(enrollment.id) }));
    const missingAssessments = studentResults.filter(({ result }) => !result || result.status === 'NOT_ENTERED').map(({ assessment }) => assessment.title);
    if (missingAssessments.length) {
      const student = enrollment.student;
      const studentLabel = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
      throw httpError(409, 'STUDENT_RESULTS_INCOMPLETE', `Missing assessment result${missingAssessments.length === 1 ? '' : 's'} for ${studentLabel || 'student'} (${student.admissionNumber}) in ${missingAssessments.join(', ')}. Record the student’s result for these assessments before calculating term results. No term results were saved.`);
    }
    const finalResult = assessmentResults.get(finalExam.id).get(enrollment.id);
    if (finalResult.status === 'EXEMPT') throw httpError(409, 'FINAL_EXAM_EXEMPTION_REQUIRES_REVIEW', `Enrollment ${enrollment.id} is exempt from the final exam. Manual review is required.`);
    const finalExamPercent = finalResult.status === 'ABSENT' ? 0 : (Number(finalResult.mark) / Number(finalExam.maxMark)) * 100;
    const componentPercents = componentAssessments
      .map((assessment) => ({
        assessment,
        result: assessmentResults.get(assessment.id).get(enrollment.id),
      }))
      .filter(({ result }) => result.status !== 'EXEMPT')
      .map(({ assessment, result }) => result.status === 'ABSENT'
        ? 0
        : (Number(result.mark) / Number(assessment.maxMark)) * 100);
    if (componentPercents.length === 0) throw httpError(409, 'CONTINUOUS_ASSESSMENT_NOT_CALCULABLE', `Enrollment ${enrollment.id} has no eligible coursework or mid-term marks.`);
    const finalMark = calculateFinalSubjectMark(componentPercents, finalExamPercent);
    const boundary = [...boundaries].reverse().find((item) => finalMark >= Number(item.minPercent));
    if (!boundary) throw httpError(409, 'GRADE_BOUNDARY_NOT_FOUND', `No grade boundary matches the calculated mark ${finalMark}%.`);
    calculations.push({ enrollmentId: enrollment.id, subjectId, finalMark: finalMark.toFixed(2), grade: boundary.grade, gradeDescription: boundary.description ?? null });
  }
  return calculations;
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
    select: { id: true },
  });

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'Term not found.');
  }

  const classGroup = await prisma.classGroup.findUnique({
    where: { id: classGroupId },
    select: { id: true, classLevelId: true },
  });
  if (!classGroup) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');

  const gradeScale = await getGradeScaleForClassLevel(prisma, classGroup.classLevelId);
  const boundaries = gradeScale.boundaries;
  if (boundaries.length === 0) {
    throw httpError(
      409,
      'GRADE_BOUNDARIES_MISSING',
      'The configured grade scale has no grade boundaries.',
    );
  }

  const classSubject = await prisma.classSubject.findUnique({
      where: { classLevelId_subjectId: { classLevelId: classGroup.classLevelId, subjectId } },
      select: { isRequired: true },
  });
  const isRequired = classSubject?.isRequired === true;

  const streams = await prisma.subjectStream.findMany({
      where: {
        classLevelId: classGroup.classLevelId,
        termId,
        subjectId,
        teachingAssignments: { some: { termId } },
        ...(isRequired ? {} : {
          studentSelections: {
            some: { status: 'ACTIVE', enrollment: { is: { termId, classGroupId, status: 'ACTIVE' } } },
          },
        }),
      },
      select: { id: true },
  });
  const streamIds = streams.map(({ id }) => id);

  const cohortKeys = streamIds;
  if (!cohortKeys.length) {
    throw httpError(404, 'ASSESSMENTS_NOT_FOUND', isRequired
      ? 'No teaching assignment exists for this required subject in the selected term.'
      : 'No active students are enrolled in a subject stream for this class, subject, and term.');
  }
  if (isRequired && cohortKeys.length > 1) {
    throw httpError(
      409,
      'REQUIRED_SUBJECT_MULTIPLE_STREAMS',
      'A required subject must have one teaching stream per class level and term so every student is calculated exactly once.',
    );
  }

  const calculations = [];
  for (const streamId of cohortKeys) {
    const assessments = await prisma.assessment.findMany({
      where: {
        termId,
        subjectId,
        teachingAssignment: { subjectStreamId: streamId },
      },
      include: {
        results: true,
        teachingAssignment: { select: { id: true, classSubjectId: true, subjectStreamId: true } },
      },
      orderBy: { title: 'asc' },
    });
    if (!assessments.length) {
        throw httpError(404, 'ASSESSMENTS_NOT_FOUND', `No assessments were found for subject section ${streamId} in this term.`);
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        termId,
        ...(isRequired ? { classLevelId: classGroup.classLevelId } : { classGroupId }),
        status: 'ACTIVE',
        ...(!isRequired ? {
          subjectStreams: { some: { subjectStreamId: streamId, status: 'ACTIVE' } },
        } : {}),
      },
      select: {
        id: true,
        classGroupId: true,
        student: { select: { admissionNumber: true, firstName: true, middleName: true, lastName: true } },
      },
    });
    const scopedEnrollments = isRequired
      ? enrollments.filter((enrollment) => enrollment.classGroupId === classGroupId)
      : enrollments;
    if (!scopedEnrollments.length) continue;
    calculations.push(...calculateCohort(assessments, scopedEnrollments, boundaries, subjectId));
  }

  if (!calculations.length) {
    throw httpError(409, 'NO_ACTIVE_ENROLLMENTS', 'There are no active students to calculate for this class, subject, and term.');
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
