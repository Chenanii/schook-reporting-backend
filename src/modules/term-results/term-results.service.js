import { prisma } from '../../lib/prisma.js';

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
      select: { id: true, name: true },
    }),
    db.classGroup.findUnique({
      where: { id: classGroupId },
      select: { id: true, classLevelId: true },
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

  const classSubject = await db.classSubject.findUnique({
    where: {
      classLevelId_subjectId: {
        classLevelId: classGroup.classLevelId,
        subjectId,
      },
    },
    select: { id: true },
  });

  if (!classSubject) {
    throw httpError(
      409,
      'SUBJECT_NOT_ASSIGNED_TO_CLASS',
      'This subject is not assigned to the class level.',
    );
  }

  return { term, classGroup, subject };
}

async function getActiveEnrollments(db, { termId, classGroupId }) {
  const enrollments = await db.enrollment.findMany({
    where: {
      termId,
      classGroupId,
      status: 'ACTIVE',
    },
    select: { id: true, studentId: true },
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

async function getScopedResults(db, { termId, classGroupId, subjectId }) {
  return db.termSubjectResult.findMany({
    where: {
      subjectId,
      enrollment: {
        is: {
          termId,
          classGroupId,
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
  await validateScope(prisma, { termId, classGroupId, subjectId });

  const enrollments = await getActiveEnrollments(prisma, {
    termId,
    classGroupId,
  });

  const results = await getScopedResults(prisma, {
    termId,
    classGroupId,
    subjectId,
  });

  const resultEnrollmentIds = new Set(
    results.map((result) => result.enrollmentId),
  );

  return {
    expectedCount: enrollments.length,
    resultCount: results.length,
    missingCount: enrollments.filter(
      (enrollment) => !resultEnrollmentIds.has(enrollment.id),
    ).length,
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
    await validateScope(tx, { termId, classGroupId, subjectId });

    const enrollments = await getActiveEnrollments(tx, {
      termId,
      classGroupId,
    });

    const results = await getScopedResults(tx, {
      termId,
      classGroupId,
      subjectId,
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
    await validateScope(tx, { termId, classGroupId, subjectId });

    const enrollments = await getActiveEnrollments(tx, {
      termId,
      classGroupId,
    });

    const results = await getScopedResults(tx, {
      termId,
      classGroupId,
      subjectId,
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

    return published;
  });
}