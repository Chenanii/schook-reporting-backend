import { prisma } from '../../lib/prisma.js';
import { teacherAssessmentScope } from './assessment-access.js';
import {
  createNotifications,
  notifyActiveStudentsAndParents,
} from '../notifications/notifications.service.js';

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

function isExamType(type) {
  return ['MID_TERM_EXAM', 'FINAL_EXAM'].includes(type);
}

function snapshot(assessment) {
  return {
    status: assessment.status,
    title: assessment.title,
    assessmentDate: assessment.assessmentDate?.toISOString().slice(0, 10) ?? null,
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
          classSubject: { select: { isRequired: true, classLevelId: true } },
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

  let examAbsentEnrollmentIds = [];
  let resetAbsentEnrollmentIds = [];
  if (targetStatus === 'SUBMITTED') {
    const adminReopenedExam = isExamType(assessment.assessmentType)
      && assessment.status === 'OPEN'
      && Boolean(await prisma.auditLog.findFirst({
        where: { entityType: 'Assessment', entityId: assessment.id, action: 'ASSESSMENT_RESET' },
        select: { id: true },
      }));
    const assignment = assessment.teachingAssignment;
    const enrollmentScope = assignment.classSubject?.isRequired
      ? { classLevelId: assignment.classSubject.classLevelId }
      : assignment.subjectStreamId
        ? { subjectStreams: { some: { subjectStreamId: assignment.subjectStreamId, status: 'ACTIVE' } } }
        : assignment.classGroupId
          ? { classGroupId: assignment.classGroupId }
          : null;

    if (!enrollmentScope) {
      throw httpError(
        409,
        'ASSESSMENT_CLASS_UNAVAILABLE',
        'The class scope for this assessment could not be determined. Update the teaching assignment before submitting.',
      );
    }

    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        schoolId: assessment.schoolId,
        termId: assessment.termId,
        ...enrollmentScope,
        status: 'ACTIVE',
      },
      select: { id: true, classGroupId: true },
    });

    if (activeEnrollments.length === 0) {
      throw httpError(
        409,
        'ASSESSMENT_NO_ACTIVE_ENROLLMENTS',
        'This assessment cannot be submitted because there are no active student enrollments in its class or subject stream.',
      );
    }

    let requiredEnrollments = activeEnrollments;
    if (isExamType(assessment.assessmentType)) {
      if (!assessment.assessmentDate) {
        throw httpError(409, 'ASSESSMENT_DATE_REQUIRED', 'Set the exam date before submitting results.');
      }
      const date = new Date(`${assessment.assessmentDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
      const classGroupIds = [...new Set(activeEnrollments.map(({ classGroupId }) => classGroupId).filter(Boolean))];
      const sessions = classGroupIds.length ? await prisma.attendanceSession.findMany({
        where: { schoolId: assessment.schoolId, termId: assessment.termId, date, classGroupId: { in: classGroupIds } },
        select: { classGroupId: true },
      }) : [];
      const recordedClassGroups = new Set(sessions.map(({ classGroupId }) => classGroupId));
      if (activeEnrollments.some(({ classGroupId }) => !classGroupId || !recordedClassGroups.has(classGroupId))) {
        throw httpError(409, 'EXAM_ATTENDANCE_NOT_RECORDED', 'Record class attendance for every class group on the exam date before submitting results.');
      }
      const presentRows = await prisma.attendanceRecord.findMany({
        where: {
          enrollmentId: { in: activeEnrollments.map(({ id }) => id) },
          status: 'PRESENT',
          attendanceSession: { schoolId: assessment.schoolId, termId: assessment.termId, date },
        },
        select: { enrollmentId: true },
      });
      const presentIds = new Set(presentRows.map(({ enrollmentId }) => enrollmentId));
      requiredEnrollments = activeEnrollments.filter(({ id }) => presentIds.has(id));
      examAbsentEnrollmentIds = activeEnrollments.filter(({ id }) => !presentIds.has(id)).map(({ id }) => id);
      if (requiredEnrollments.length === 0 && !adminReopenedExam) {
        throw httpError(409, 'EXAM_NO_PRESENT_STUDENTS', 'No students were marked PRESENT on the exam date.');
      }
    }

    const enteredResults = await prisma.assessmentResult.findMany({
      where: {
        assessmentId,
        enrollmentId: { in: requiredEnrollments.map((item) => item.id) },
      },
      select: { enrollmentId: true, mark: true, status: true },
    });

    const resultsByEnrollment = new Map(enteredResults.map((result) => [result.enrollmentId, result]));
    const maxMark = Number(assessment.maxMark);
    const invalidCount = requiredEnrollments.filter(({ id }) => {
      const result = resultsByEnrollment.get(id);
      if (adminReopenedExam && (!result || (result.status === 'ABSENT' && result.mark === null))) {
        resetAbsentEnrollmentIds.push(id);
        return false;
      }
      if (!result || result.status !== 'PRESENT' || result.mark === null) return true;
      const mark = Number(result.mark);
      return !Number.isFinite(mark) || mark < 0 || mark > maxMark;
    }).length;

    if (invalidCount > 0) {
      throw httpError(
        409,
        'RESULTS_INCOMPLETE',
        `Assessment was not submitted to admins: ${invalidCount} ${isExamType(assessment.assessmentType) ? 'student(s) marked PRESENT on the exam date' : 'active enrollment(s)'} do not have a valid numeric mark. Every eligible student must have a mark from 0 to ${maxMark}${adminReopenedExam ? ' or remain marked ABSENT' : ''}.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    if (examAbsentEnrollmentIds.length || resetAbsentEnrollmentIds.length) {
      await tx.assessmentResult.createMany({
        data: [...new Set([...examAbsentEnrollmentIds, ...resetAbsentEnrollmentIds])].map((enrollmentId) => ({
          assessmentId,
          enrollmentId,
          mark: null,
          status: 'ABSENT',
          enteredById: actorId,
          enteredAt: new Date(),
          schoolId: assessment.schoolId,
        })),
        skipDuplicates: true,
      });
    }
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

    if (targetStatus === 'OPEN') {
      await notifyActiveStudentsAndParents(tx, {
        schoolId: assessment.schoolId,
        termId: assessment.termId,
        classGroupId: assessment.teachingAssignment.classGroupId,
        subjectStreamId: assessment.teachingAssignment.subjectStreamId,
        type: 'ASSESSMENT_OPENED',
        title: 'New assessment available',
        message: `${assessment.title} is now open for your class.`,
        entityId: assessment.id,
      });
    } else if (targetStatus === 'SUBMITTED') {
      const reviewers = await tx.user.findMany({
        where: {
          schoolId: assessment.schoolId,
          status: 'ACTIVE',
          role: { in: ['SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'] },
        },
        select: { id: true },
      });
      await createNotifications(tx, {
        schoolId: assessment.schoolId,
        userIds: reviewers.map(({ id }) => id),
        type: 'ASSESSMENT_SUBMITTED',
        title: 'Assessment ready for review',
        message: `${assessment.title} has been submitted for review.`,
        entityId: assessment.id,
      });
    }

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

    const affectedClassGroupIds = assessment.teachingAssignment.classGroupId
      ? [assessment.teachingAssignment.classGroupId]
      : assessment.teachingAssignment.subjectStreamId
        ? [...new Set((await tx.enrollmentSubjectStream.findMany({
          where: {
            subjectStreamId: assessment.teachingAssignment.subjectStreamId,
            status: 'ACTIVE',
            enrollment: { is: { termId: assessment.termId, status: 'ACTIVE', classGroupId: { not: null } } },
          },
          select: { enrollment: { select: { classGroupId: true } } },
        })).map(({ enrollment }) => enrollment.classGroupId).filter(Boolean))]
        : [];
    const publishedMidTermReports = affectedClassGroupIds.length
      ? await tx.reportPublication.count({
        where: {
          type: 'MID_TERM',
          termId: assessment.termId,
          classGroupId: { in: affectedClassGroupIds },
          schoolId: assessment.schoolId,
        },
      })
      : 0;
    if (publishedMidTermReports > 0) {
      throw httpError(409, 'MID_TERM_REPORTS_ALREADY_PUBLISHED', 'This assessment cannot be reset after mid-term reports have been published for its class.');
    }

    const publishedEndOfTermReports = affectedClassGroupIds.length
      ? await tx.reportPublication.count({ where: { termId: assessment.termId, schoolId: assessment.schoolId, classGroupId: { in: affectedClassGroupIds }, type: 'END_OF_TERM' } })
      : 0;
    if (publishedEndOfTermReports > 0) {
      throw httpError(409, 'END_OF_TERM_REPORTS_ALREADY_PUBLISHED', 'This assessment cannot be reset after end-of-term reports have been published for its class.');
    }

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
        newValues: { ...snapshot(updated), marksPreserved: true },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
      },
    });

    return { ...updated, invalidatedDraftTermResults: 0 };
  }, { isolationLevel: 'Serializable' });
}
