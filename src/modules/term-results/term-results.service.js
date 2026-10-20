import { prisma } from '../../lib/prisma.js';
import { getGradeScaleForClassLevel } from '../grade-scales/class-level-grade-scale.js';
import { createNotifications, getStudentAndParentUserIds } from '../notifications/notifications.service.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function snapshot(result) {
  return {
    id: result.id,
    enrollmentId: result.enrollmentId,
    subjectId: result.subjectId,
    finalMark: result.finalMark?.toString() ?? null,
    grade: result.grade,
    gradeDescription: result.gradeDescription,
    status: result.status,
  };
}

async function validateScope(db, { termId, classGroupId, subjectId }) {
  const [term, classGroup, subject] = await Promise.all([
    db.term.findUnique({
      where: { id: termId },
      select: { id: true, name: true, schoolId: true },
    }),
    db.classGroup.findUnique({
      where: { id: classGroupId },
      select: { id: true, name: true, classLevelId: true },
    }),
    db.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, code: true, name: true },
    }),
  ]);

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
  }

  if (!classGroup) {
    throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  }

  if (!subject) {
    throw httpError(404, 'SUBJECT_NOT_FOUND', 'Subject not found.');
  }

  const assignments = await db.teachingAssignment.findMany({
    where: {
      termId,
      subjectId,
      OR: [
        { classGroupId: classGroup.id },
        { subjectStream: { is: { classLevelId: classGroup.classLevelId } } },
        { classSubject: { is: { classLevelId: classGroup.classLevelId } } },
      ],
    },
    select: { subjectStreamId: true },
  });

  const classLinks = await db.classSubject.findMany({ where: { subjectId }, select: { classLevelId: true, isRequired: true } });
  if (classLinks.length > 0 && !classLinks.some((link) => link.classLevelId === classGroup.classLevelId)) {
    throw httpError(
      409,
      'SUBJECT_NOT_ASSIGNED_TO_CLASS',
      'This subject is linked to a different class level.',
    );
  }
  const classSubject = classLinks.find((link) => link.classLevelId === classGroup.classLevelId);

  if (!assignments.length) {
    throw httpError(
      409,
      'SUBJECT_NOT_ASSIGNED_TO_CLASS_GROUP',
      'Create a teacher assignment and subject section for this class level and term before managing its results.',
    );
  }

  return {
    term,
    classGroup,
    subject,
    isRequired: classSubject?.isRequired === true,
    streamAssignmentIds: assignments.map(({ subjectStreamId }) => subjectStreamId).filter(Boolean),
  };
}

async function getActiveEnrollments(db, { termId, classGroupId, isRequired, streamAssignmentIds }) {
  const enrollments = await db.enrollment.findMany({
    where: {
      termId,
      classGroupId,
      status: 'ACTIVE',
      ...(!isRequired && streamAssignmentIds?.length ? {
        subjectStreams: {
          some: { subjectStreamId: { in: streamAssignmentIds }, status: 'ACTIVE' },
        },
      } : {}),
    },
    select: {
      id: true,
      studentId: true,
      student: {
        select: {
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
        },
      },
    },
  });

  if (enrollments.length === 0) {
    throw httpError(
      409,
      'NO_ACTIVE_ENROLLMENTS',
      'There are no active student enrollments for this term and class.',
    );
  }

  return enrollments;
}

async function getScopedResults(db, { termId, classGroupId, subjectId, isRequired, streamAssignmentIds }) {
  return db.termSubjectResult.findMany({
    where: {
      subjectId,
      enrollment: {
        is: {
          termId,
          classGroupId,
          ...(!isRequired && streamAssignmentIds?.length ? {
            subjectStreams: {
              some: { subjectStreamId: { in: streamAssignmentIds }, status: 'ACTIVE' },
            },
          } : {}),
          status: 'ACTIVE',
        },
      },
    },
    include: {
      enrollment: {
        select: {
          id: true,
          studentId: true,
          classGroupId: true,
          termId: true,
          status: true,
          student: {
            select: {
              admissionNumber: true,
              firstName: true,
              middleName: true,
              lastName: true,
            },
          },
        },
      },
      subject: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: { enrollmentId: 'asc' },
  });
}

export async function listTermSubjectResults({
  termId,
  classGroupId,
  subjectId,
}) {
  const scope = await validateScope(prisma, { termId, classGroupId, subjectId });

  const gradeScale = await getGradeScaleForClassLevel(prisma, scope.classGroup.classLevelId);

  const enrollments = await getActiveEnrollments(prisma, {
    termId,
    classGroupId,
    isRequired: scope.isRequired,
    streamAssignmentIds: scope.streamAssignmentIds,
  });

  const results = await getScopedResults(prisma, {
    termId,
    classGroupId,
    subjectId,
    isRequired: scope.isRequired,
    streamAssignmentIds: scope.streamAssignmentIds,
  });

  const resultEnrollmentIds = new Set(
    results.map((result) => result.enrollmentId),
  );

  return {
    scoreOutOf: gradeScale.maxScore,
    expectedCount: enrollments.length,
    resultCount: results.length,
    missingCount: enrollments.filter((enrollment) => !resultEnrollmentIds.has(enrollment.id)).length,
    missingEnrollments: enrollments.filter(
      (enrollment) => !resultEnrollmentIds.has(enrollment.id),
    ),
    data: results,
  };
}

export async function finalizeTermSubjectResults({
  termId,
  classGroupId,
  subjectId,
  actorId,
  req,
}) {
  return prisma.$transaction(async (tx) => {
    const scope = await validateScope(tx, { termId, classGroupId, subjectId });

    const enrollments = await getActiveEnrollments(tx, {
      termId,
      classGroupId,
      isRequired: scope.isRequired,
      streamAssignmentIds: scope.streamAssignmentIds,
    });

    const results = await getScopedResults(tx, {
      termId,
      classGroupId,
      subjectId,
      isRequired: scope.isRequired,
      streamAssignmentIds: scope.streamAssignmentIds,
    });

    const resultByEnrollment = new Map(
      results.map((result) => [result.enrollmentId, result]),
    );

    const missing = enrollments.filter(
      (enrollment) => !resultByEnrollment.has(enrollment.id),
    );

    if (missing.length > 0) {
      throw httpError(
        409,
        'RESULTS_INCOMPLETE',
        `${missing.length} active student enrollment(s) have no calculated subject result.`,
      );
    }

    const incomplete = results.filter(
      (result) => result.finalMark === null || !result.grade,
    );

    if (incomplete.length > 0) {
      throw httpError(
        409,
        'RESULTS_NOT_CALCULATED',
        `${incomplete.length} result(s) are missing a final mark or grade.`,
      );
    }

    const notDraft = results.filter((result) => result.status !== 'DRAFT');

    if (notDraft.length > 0) {
      throw httpError(
        409,
        'RESULTS_NOT_ALL_DRAFT',
        'All subject results must be in DRAFT status before finalization.',
      );
    }

    const finalized = [];

    for (const result of results) {
      const updated = await tx.termSubjectResult.update({
        where: { id: result.id },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'TERM_SUBJECT_RESULT_FINALIZED',
          entityType: 'TermSubjectResult',
          entityId: result.id,
          oldValues: snapshot(result),
          newValues: snapshot(updated),
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500),
        },
      });

      finalized.push(updated);
    }

    return finalized;
  });
}

export async function publishTermSubjectResults({
  termId,
  classGroupId,
  subjectId,
  actorId,
  req,
}) {
  return prisma.$transaction(async (tx) => {
    const scope = await validateScope(tx, { termId, classGroupId, subjectId });

    const enrollments = await getActiveEnrollments(tx, {
      termId,
      classGroupId,
      isRequired: scope.isRequired,
      streamAssignmentIds: scope.streamAssignmentIds,
    });

    const results = await getScopedResults(tx, {
      termId,
      classGroupId,
      subjectId,
      isRequired: scope.isRequired,
      streamAssignmentIds: scope.streamAssignmentIds,
    });

    const resultEnrollmentIds = new Set(
      results.map((result) => result.enrollmentId),
    );

    const missing = enrollments.filter(
      (enrollment) => !resultEnrollmentIds.has(enrollment.id),
    );

    if (missing.length > 0) {
      throw httpError(
        409,
        'RESULTS_INCOMPLETE',
        `${missing.length} active student enrollment(s) have no subject result.`,
      );
    }

    if (results.some((result) => result.status !== 'FINALIZED')) {
      throw httpError(
        409,
        'RESULTS_NOT_FINALIZED',
        'All subject results must be FINALIZED before publication.',
      );
    }

    if (results.some((result) => result.finalMark === null || !result.grade)) {
      throw httpError(
        409,
        'RESULTS_INCOMPLETE',
        'Every result must have a final mark and grade before publication.',
      );
    }

    const published = [];

    for (const result of results) {
      const updated = await tx.termSubjectResult.update({
        where: { id: result.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'TERM_SUBJECT_RESULT_PUBLISHED',
          entityType: 'TermSubjectResult',
          entityId: result.id,
          oldValues: snapshot(result),
          newValues: snapshot(updated),
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500),
        },
      });

      published.push(updated);
    }

    const userIds = await getStudentAndParentUserIds(tx, {
      schoolId: scope.term.schoolId,
      studentIds: results.map(({ enrollment }) => enrollment.studentId),
    });
    await createNotifications(tx, {
      schoolId: scope.term.schoolId,
      userIds,
      type: 'TERM_RESULT_PUBLISHED',
      title: 'Subject result published',
      message: `${scope.subject.name} results for ${scope.term.name} are now available.`,
    });

    return published;
  });
}

export async function publishClassGroupTermResults({ termId, classGroupId, schoolId, actorId, req }) {
  return prisma.$transaction(async (tx) => {
    const [term, classGroup] = await Promise.all([
      tx.term.findFirst({ where: { id: termId, schoolId }, select: { id: true, name: true, schoolId: true } }),
      tx.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { id: true, classLevelId: true } }),
    ]);
    if (!term || !classGroup) throw httpError(404, 'CLASS_GROUP_TERM_NOT_FOUND', 'The selected term or class group was not found.');

    const activeEnrollmentCount = await tx.enrollment.count({ where: { termId, classGroupId, schoolId, status: 'ACTIVE' } });
    if (!activeEnrollmentCount) throw httpError(409, 'NO_ACTIVE_ENROLLMENTS', 'There are no active student enrollments for this term and class.');

    const [classSubjects, classAssignments] = await Promise.all([
      tx.classSubject.findMany({ where: { classLevelId: classGroup.classLevelId, schoolId, isRequired: true, subject: { status: 'ACTIVE' } }, select: { subjectId: true } }),
      tx.teachingAssignment.findMany({
        where: {
          termId,
          schoolId,
          subject: { status: 'ACTIVE' },
          OR: [
            { classGroupId },
            { subjectStream: { is: { classLevelId: classGroup.classLevelId } } },
            { classSubject: { is: { classLevelId: classGroup.classLevelId } } },
          ],
        },
        select: { subjectId: true },
      }),
    ]);
    const subjectIds = [...new Set([...classSubjects.map(({ subjectId }) => subjectId), ...classAssignments.map(({ subjectId }) => subjectId)])];
    if (!subjectIds.length) throw httpError(409, 'NO_RESULTS_TO_PUBLISH', 'No subjects are configured for this class and term.');

    const toPublish = [];
    const issues = [];
    const affectedStudentIds = new Set();
    let validResultCount = 0;
    for (const subjectId of subjectIds) {
      const scope = await validateScope(tx, { termId, classGroupId, subjectId });
      let enrollments;
      try {
        enrollments = await getActiveEnrollments(tx, {
          termId,
          classGroupId,
          isRequired: scope.isRequired,
          streamAssignmentIds: scope.streamAssignmentIds,
        });
      } catch (error) {
        if (error.code === 'NO_ACTIVE_ENROLLMENTS') continue;
        throw error;
      }
      const results = await getScopedResults(tx, {
        termId,
        classGroupId,
        subjectId,
        isRequired: scope.isRequired,
        streamAssignmentIds: scope.streamAssignmentIds,
      });
      const resultByEnrollmentId = new Map(results.map((result) => [result.enrollmentId, result]));
      for (const enrollment of enrollments) {
        const result = resultByEnrollmentId.get(enrollment.id);
        const studentName = [enrollment.student.firstName, enrollment.student.middleName, enrollment.student.lastName].filter(Boolean).join(' ') || enrollment.student.admissionNumber;
        if (!result) issues.push(`${studentName}: ${scope.subject.name} (not calculated)`);
        else if (!['FINALIZED', 'PUBLISHED'].includes(result.status)) issues.push(`${studentName}: ${scope.subject.name} (not finalized)`);
        else if (result.finalMark === null || !result.grade) issues.push(`${studentName}: ${scope.subject.name} (missing final mark or grade)`);
        else {
          validResultCount += 1;
          affectedStudentIds.add(result.enrollment.studentId);
          if (result.status === 'FINALIZED') toPublish.push(result);
        }
      }
    }
    if (issues.length) {
      const shown = issues.slice(0, 12);
      const hidden = issues.length - shown.length;
      throw httpError(409, 'CLASS_RESULTS_NOT_READY', `Class results were not published. Resolve these items first: ${shown.join('; ')}${hidden > 0 ? `; and ${hidden} more` : ''}.`);
    }
    if (!validResultCount) throw httpError(409, 'NO_RESULTS_TO_PUBLISH', 'No active subject results are ready to publish for this class and term.');
    const existingPublication = await tx.reportPublication.findUnique({
      where: { termId_classGroupId_type: { termId, classGroupId, type: 'END_OF_TERM' } },
      select: { id: true, publishedAt: true },
    });
    if (!toPublish.length && existingPublication) {
      return { count: 0, subjectCount: subjectIds.length, alreadyPublished: true, publishedAt: existingPublication.publishedAt };
    }

    const publishedAt = new Date();
    const published = [];
    for (const result of toPublish) {
      const updated = await tx.termSubjectResult.update({
        where: { id: result.id },
        data: { status: 'PUBLISHED', publishedAt },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'TERM_SUBJECT_RESULT_PUBLISHED',
          entityType: 'TermSubjectResult',
          entityId: result.id,
          oldValues: snapshot(result),
          newValues: snapshot(updated),
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500),
          schoolId,
        },
      });
      published.push(updated);
    }
    const publication = await tx.reportPublication.upsert({
      where: { termId_classGroupId_type: { termId, classGroupId, type: 'END_OF_TERM' } },
      create: { type: 'END_OF_TERM', termId, classGroupId, schoolId, publishedById: actorId, publishedAt },
      update: { schoolId, publishedById: actorId, publishedAt },
      select: { id: true, publishedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'END_OF_TERM_REPORTS_PUBLISHED',
        entityType: 'ReportPublication',
        entityId: publication.id,
        schoolId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
        newValues: { type: 'END_OF_TERM', termId, classGroupId, subjectCount: subjectIds.length, resultCount: published.length },
      },
    });
    const userIds = await getStudentAndParentUserIds(tx, {
      schoolId,
      studentIds: [...affectedStudentIds],
    });
    await createNotifications(tx, {
      schoolId,
      userIds,
      type: 'TERM_RESULT_PUBLISHED',
      title: 'End-of-term reports published',
      message: `End-of-term results and reports for ${term.name} are now available.`,
    });
    return { count: published.length, subjectCount: subjectIds.length, publishedAt: publication.publishedAt };
  }, { isolationLevel: 'Serializable' });
}
