import { prisma } from '../../lib/prisma.js';
import { teacherAssessmentScope } from './assessment-access.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isExamType(type) {
  return ['MID_TERM_EXAM', 'FINAL_EXAM'].includes(type);
}

function attendanceDay(date) {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
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

function enrollmentScope(assignment) {
  if (assignment.classSubject?.isRequired) {
    const classLevelId = assignment.classSubject.classLevelId
      ?? assignment.subjectStream?.classLevelId
      ?? assignment.classGroup?.classLevelId;
    if (!classLevelId) {
      throw httpError(409, 'ASSESSMENT_CLASS_LEVEL_UNAVAILABLE', 'The class level for this assessment could not be determined. Update the teaching assignment before entering results.');
    }
    return { classLevelId };
  }

  if (assignment.subjectStreamId) {
    return {
      subjectStreams: {
        some: { subjectStreamId: assignment.subjectStreamId, status: 'ACTIVE' }
      }
    };
  }

  if (assignment.classGroupId) return { classGroupId: assignment.classGroupId };
  throw httpError(409, 'ASSESSMENT_CLASS_UNAVAILABLE', 'The class for this assessment could not be determined. Update the teaching assignment before entering results.');
}

export async function getAssessmentResultEntries(assessmentId, teacherUserId = null) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...teacherAssessmentScope(teacherUserId) },
    select: {
      id: true,
      termId: true,
      schoolId: true,
      assessmentType: true,
      assessmentDate: true,
      status: true,
      teachingAssignment: {
        select: {
          id: true,
          classGroupId: true,
          classSubjectId: true,
          subjectStreamId: true,
          classGroup: { select: { classLevelId: true } },
          classSubject: { select: { isRequired: true, classLevelId: true } },
          subjectStream: { select: { classLevelId: true } },
        }
      }
    }
  });

  if (!assessment) {
    throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }

  if (isExamType(assessment.assessmentType) && !assessment.assessmentDate) {
    throw httpError(409, 'ASSESSMENT_DATE_REQUIRED', 'Set the exam date before entering results.');
  }

  let eligibleEnrollmentIds = null;
  let presentEnrollmentIds = null;
  if (isExamType(assessment.assessmentType)) {
    presentEnrollmentIds = new Set((await prisma.attendanceRecord.findMany({
        where: {
          status: 'PRESENT',
          attendanceSession: {
            termId: assessment.termId,
            schoolId: assessment.schoolId,
            date: attendanceDay(assessment.assessmentDate),
          },
        },
        select: { enrollmentId: true },
      })).map(({ enrollmentId }) => enrollmentId));
    // Keep persisted absent rows visible throughout review, including after the
    // assessment is submitted. Submission creates these rows for exam absentees.
    const absentEnrollmentIds = new Set((await prisma.assessmentResult.findMany({
      where: { assessmentId, status: 'ABSENT' },
      select: { enrollmentId: true },
    })).map(({ enrollmentId }) => enrollmentId));
    eligibleEnrollmentIds = ['SUBMITTED', 'APPROVED', 'LOCKED'].includes(assessment.status)
      ? null
      : new Set([...presentEnrollmentIds, ...absentEnrollmentIds]);
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      termId: assessment.termId,
      ...(eligibleEnrollmentIds ? { id: { in: [...eligibleEnrollmentIds] } } : {}),
      ...enrollmentScope(assessment.teachingAssignment),
      status: 'ACTIVE'
    },
    select: {
      id: true,
      student: {
        select: {
          firstName: true,
          middleName: true,
          lastName: true,
          admissionNumber: true
        }
      },
      results: {
        where: { assessmentId },
        select: {
          mark: true,
          status: true,
          teacherComment: true
        },
        take: 1
      }
    },
    orderBy: [
      { student: { lastName: 'asc' } },
      { student: { firstName: 'asc' } }
    ]
  });

  return enrollments.map((enrollment) => {
    const result = enrollment.results[0];
    return {
      enrollmentId: enrollment.id,
      student: enrollment.student,
      mark: result?.mark?.toString() ?? '',
      status: result?.status ?? 'NOT_ENTERED',
      teacherComment: result?.teacherComment ?? '',
      hasResult: Boolean(result),
      canEnterResult: ['DRAFT', 'OPEN'].includes(assessment.status) || !result,
      approvedAbsenceCorrection: Boolean(presentEnrollmentIds && !presentEnrollmentIds.has(enrollment.id))
    };
  });
}

export async function saveAssessmentResults(
  assessmentId,
  inputResults,
  actorId,
  req,
  teacherUserId = null,
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...teacherAssessmentScope(teacherUserId) },
    select: {
      id: true,
      title: true,
      maxMark: true,
      termId: true,
      schoolId: true,
      assessmentType: true,
      assessmentDate: true,
      status: true,
      teachingAssignment: {
        select: {
          termId: true,
          classGroupId: true,
          id: true,
          classSubjectId: true,
          subjectStreamId: true,
          classGroup: { select: { classLevelId: true } },
          classSubject: { select: { isRequired: true, classLevelId: true } },
          subjectStream: { select: { classLevelId: true } },
        },
      },
    },
  });

  if (!assessment) {
    throw httpError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  }

  const finalized = ['SUBMITTED', 'APPROVED', 'LOCKED'].includes(assessment.status);
  if (!['DRAFT', 'OPEN'].includes(assessment.status) && !finalized) {
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
      ...enrollmentScope(assessment.teachingAssignment)
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

  const existingResults = finalized
    ? await prisma.assessmentResult.findMany({
        where: { assessmentId, enrollmentId: { in: enrollmentIds } },
        select: { enrollmentId: true },
      })
    : [];
  const existingResultIds = new Set(existingResults.map(({ enrollmentId }) => enrollmentId));
  if (finalized && enrollmentIds.some((id) => existingResultIds.has(id))) {
    throw httpError(409, 'ASSESSMENT_RESULT_ALREADY_FINALIZED', 'Only students without an existing result can be assessed after this assessment has been submitted or locked.');
  }

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

  if (isExamType(assessment.assessmentType)) {
    if (!assessment.assessmentDate) {
      throw httpError(409, 'ASSESSMENT_DATE_REQUIRED', 'Set the exam date before entering results.');
    }
    const presentEnrollmentIds = new Set((await prisma.attendanceRecord.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        status: 'PRESENT',
        attendanceSession: {
          termId: assessment.termId,
          schoolId: assessment.schoolId,
          date: attendanceDay(assessment.assessmentDate),
        },
      },
      select: { enrollmentId: true },
    })).map(({ enrollmentId }) => enrollmentId));
    const absentEnrollmentIds = enrollmentIds.filter((id) => !presentEnrollmentIds.has(id));
    if (absentEnrollmentIds.length) {
      const approvedAbsentRows = assessment.status === 'OPEN'
        ? await prisma.assessmentResult.findMany({
            where: { assessmentId, enrollmentId: { in: absentEnrollmentIds }, status: 'ABSENT' },
            select: { enrollmentId: true },
          })
        : [];
      const approvedAbsentIds = new Set(approvedAbsentRows.map(({ enrollmentId }) => enrollmentId));
      if (absentEnrollmentIds.some((id) => !approvedAbsentIds.has(id))) {
        throw httpError(400, 'EXAM_STUDENT_NOT_PRESENT', 'Results can only be entered for students marked PRESENT on the exam date, unless an administrator has reopened an absent student’s result for correction.');
      }
      if (inputResults.some((result) => absentEnrollmentIds.includes(result.enrollmentId) && result.status !== 'PRESENT')) {
        throw httpError(400, 'ABSENCE_CORRECTION_MARK_REQUIRED', 'An approved absence correction must include a PRESENT result and a numeric mark.');
      }
    }
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

      const resultData = {
          assessmentId,
          enrollmentId: input.enrollmentId,
          mark,
          status: input.status,
          teacherComment: input.teacherComment ?? null,
          enteredById: input.status === 'NOT_ENTERED' ? null : actorId,
          enteredAt,
      };
      const saved = finalized
        ? await tx.assessmentResult.create({ data: resultData })
        : await tx.assessmentResult.upsert({
            where: {
              assessmentId_enrollmentId: {
                assessmentId,
                enrollmentId: input.enrollmentId,
              },
            },
            create: resultData,
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
