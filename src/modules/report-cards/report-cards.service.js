import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function getReportCardPreview(enrollmentId) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      term: {
        include: {
          academicYear: true,
        },
      },
      classGroup: {
        include: {
          classLevel: true,
        },
      },
      termResults: {
        where: {
          status: 'PUBLISHED',
        },
        include: {
          subject: true,
        },
      },
    },
  });

  if (!enrollment) {
    throw httpError(
      404,
      'ENROLLMENT_NOT_FOUND',
      'Student enrollment not found.',
    );
  }

  const classLevelId = enrollment.classGroup.classLevelId;

  const requiredSubjects = await prisma.classSubject.findMany({
    where: { classLevelId },
    include: {
      subject: true,
    },
  });

  if (requiredSubjects.length === 0) {
    throw httpError(
      409,
      'NO_SUBJECTS_CONFIGURED',
      'No subjects have been assigned to this class level.',
    );
  }

  const publishedResultsBySubject = new Map(
    enrollment.termResults.map((result) => [result.subjectId, result]),
  );

  const subjects = requiredSubjects
    .map(({ subjectId, subject }) => {
      const result = publishedResultsBySubject.get(subjectId);

      return {
        subjectId,
        subjectCode: subject.code,
        subjectName: subject.name,
        published: Boolean(result),
        finalMark: result?.finalMark == null
          ? null
          : Number(result.finalMark),
        grade: result?.grade ?? null,
        gradeDescription: result?.gradeDescription ?? null,
        teacherComment: result?.teacherComment ?? null,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const publishedSubjects = subjects.filter(
    (subject) => subject.published,
  );

  const missingSubjects = subjects.filter(
    (subject) => !subject.published,
  );

  const marks = publishedSubjects
    .map((subject) => subject.finalMark)
    .filter((mark) => mark !== null);

  const averageMark = marks.length > 0
    ? Number(
        (marks.reduce((total, mark) => total + mark, 0) / marks.length)
          .toFixed(2),
      )
    : null;

  return {
    complete: missingSubjects.length === 0,
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
    },
    student: enrollment.student,
    academicYear: enrollment.term.academicYear,
    term: enrollment.term,
    classGroup: enrollment.classGroup,
    summary: {
      requiredSubjects: requiredSubjects.length,
      publishedSubjects: publishedSubjects.length,
      missingSubjects: missingSubjects.length,
      averageMark,
    },
    subjects,
    missingSubjects: missingSubjects.map((subject) => ({
      subjectId: subject.subjectId,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
    })),
  };
}