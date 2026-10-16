import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function reportCardForEnrollment(enrollment, requiredSubjects) {
  const publishedResultsBySubject = new Map(
    enrollment.termResults.map((result) => [result.subjectId, result]),
  );
  const subjects = requiredSubjects.map(({ subjectId, subject }) => {
    const result = publishedResultsBySubject.get(subjectId);
    return {
      subjectId,
      subjectCode: subject.code,
      subjectName: subject.name,
      published: Boolean(result),
      finalMark: result?.finalMark == null ? null : Number(result.finalMark),
      grade: result?.grade ?? null,
      gradeDescription: result?.gradeDescription ?? null,
      teacherComment: result?.teacherComment ?? null,
    };
  }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  const publishedSubjects = subjects.filter((subject) => subject.published);
  const missingSubjects = subjects.filter((subject) => !subject.published);
  const marks = publishedSubjects.map((subject) => subject.finalMark).filter((mark) => mark !== null);
  const averageMark = marks.length > 0
    ? Number((marks.reduce((total, mark) => total + mark, 0) / marks.length).toFixed(2))
    : null;
  return {
    complete: missingSubjects.length === 0,
    enrollment: { id: enrollment.id, status: enrollment.status },
    student: enrollment.student,
    academicYear: enrollment.term.academicYear,
    scoreOutOf: enrollment.term.academicYear.gradeScale?.maxScore ?? 100,
    term: enrollment.term,
    classGroup: enrollment.classGroup,
    summary: {
      requiredSubjects: requiredSubjects.length,
      publishedSubjects: publishedSubjects.length,
      missingSubjects: missingSubjects.length,
      averageMark,
    },
    subjects,
    missingSubjects: missingSubjects.map(({ subjectId, subjectCode, subjectName }) => ({ subjectId, subjectCode, subjectName })),
  };
}

const reportEnrollmentInclude = {
  student: true,
  term: { include: { academicYear: { include: { gradeScale: { select: { maxScore: true } } } } } },
  classGroup: { include: { classLevel: true } },
  termResults: { where: { status: 'PUBLISHED' } },
};

async function getRequiredSubjects({ classLevelId, classGroupId, termId, schoolId }) {
  const [classSubjects, teachingAssignments] = await Promise.all([
    prisma.classSubject.findMany({ where: { classLevelId }, include: { subject: true } }),
    prisma.teachingAssignment.findMany({
      where: { classGroupId, termId, schoolId },
      include: { subject: true },
    }),
  ]);
  const subjectsById = new Map();
  for (const link of classSubjects) subjectsById.set(link.subjectId, link);
  for (const assignment of teachingAssignments) {
    if (!subjectsById.has(assignment.subjectId)) {
      subjectsById.set(assignment.subjectId, { subjectId: assignment.subjectId, subject: assignment.subject });
    }
  }
  const subjects = [...subjectsById.values()];
  if (!subjects.length) {
    throw httpError(409, 'NO_SUBJECTS_CONFIGURED', 'No subjects are assigned to this class group for the selected term.');
  }
  return subjects;
}

export async function getReportCardPreview(enrollmentId, teacherUserId = null) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: reportEnrollmentInclude });
  if (!enrollment) {
    throw httpError(
      404,
      'ENROLLMENT_NOT_FOUND',
      'Student enrollment not found.',
    );
  }

  if (teacherUserId) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        teacher: { is: { userId: teacherUserId } },
        termId: enrollment.termId,
        classGroupId: enrollment.classGroupId,
        schoolId: enrollment.schoolId,
      },
      select: { id: true },
    });
    if (!assignment) throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
  }

  const classLevelId = enrollment.classGroup.classLevelId;

  return reportCardForEnrollment(enrollment, await getRequiredSubjects({
    classLevelId,
    classGroupId: enrollment.classGroupId,
    termId: enrollment.termId,
    schoolId: enrollment.schoolId,
  }));
}

export async function getClassGroupReportCards({ termId, classGroupId, schoolId, teacherUserId = null }) {
  const [classGroup, term] = await Promise.all([
    prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { classLevelId: true } }),
    prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
  ]);
  if (!classGroup || !term) throw httpError(404, 'CLASS_GROUP_TERM_NOT_FOUND', 'The selected term or class group was not found.');
  if (teacherUserId) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: { teacher: { is: { userId: teacherUserId } }, termId, classGroupId, schoolId },
      select: { id: true },
    });
    if (!assignment) throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
  }
  const requiredSubjects = await getRequiredSubjects({ classLevelId: classGroup.classLevelId, classGroupId, termId, schoolId });
  const enrollments = await prisma.enrollment.findMany({
    where: { termId, classGroupId, schoolId, status: 'ACTIVE' },
    include: reportEnrollmentInclude,
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  return enrollments.map((enrollment) => reportCardForEnrollment(enrollment, requiredSubjects));
}
