import { prisma } from '../../lib/prisma.js';
import { getGradeScaleForClassLevel } from '../grade-scales/class-level-grade-scale.js';
import { shouldIncludeReportSubject } from '../class-subjects/subject-requirements.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function reportCardForEnrollment(enrollment, requiredSubjects, scoreOutOf, school) {
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
    complete: subjects.length > 0 && missingSubjects.length === 0,
    enrollment: { id: enrollment.id, status: enrollment.status },
    student: enrollment.student,
    academicYear: enrollment.term.academicYear,
    scoreOutOf,
    term: enrollment.term,
    classGroup: enrollment.classGroup,
    classLevel: enrollment.classLevel,
    school,
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

function ensureResultsPublished(reportCards) {
  if (reportCards.some((reportCard) => reportCard.summary.requiredSubjects === 0)) {
    throw httpError(
      409,
      'REPORT_SUBJECTS_NOT_CONFIGURED',
      'Report cards cannot be generated because no required subjects are configured for this class.',
    );
  }
  const incompleteCount = reportCards.filter((reportCard) => !reportCard.complete).length;
  if (incompleteCount > 0) {
    const missingDetails = reportCards
      .filter((reportCard) => !reportCard.complete)
      .flatMap((reportCard) => {
        const studentName = [
          reportCard.student.firstName,
          reportCard.student.middleName,
          reportCard.student.lastName,
        ].filter(Boolean).join(' ') || reportCard.student.admissionNumber;
        return reportCard.missingSubjects.map((subject) => `${studentName}: ${subject.subjectName}`);
      });
    throw httpError(
      409,
      'REPORT_RESULTS_NOT_PUBLISHED',
      `Report cards cannot be generated because published results are missing for ${incompleteCount} student${incompleteCount === 1 ? '' : 's'}${missingDetails.length ? ` (${missingDetails.join('; ')})` : ''}. Publish all required subject results in Term results first.`,
    );
  }
}

const reportEnrollmentInclude = {
  student: true,
  term: { include: { academicYear: true } },
  classLevel: true,
  classGroup: { include: { classLevel: true } },
  termResults: { where: { status: 'PUBLISHED' } },
};

const reportSchoolSelect = {
  id: true,
  name: true,
  email: true,
  address: true,
  phone: true,
  logoDataUrl: true,
  classTeacherSignerName: true,
  headteacherSignerName: true,
};

async function getRequiredSubjects(enrollment) {
  const classSubjects = await prisma.classSubject.findMany({
    where: { classLevelId: enrollment.classLevelId, isRequired: true, subject: { status: 'ACTIVE' } },
    include: { subject: true },
  });
  const selectedStreams = await prisma.enrollmentSubjectStream.findMany({
    where: {
      enrollmentId: enrollment.id,
      schoolId: enrollment.schoolId,
      subjectStream: {
        termId: enrollment.termId,
        classLevelId: enrollment.classLevelId,
        subject: { status: 'ACTIVE' },
      },
    },
    include: { subjectStream: { include: { subject: true } } },
  });
  const publishedSubjectIds = new Set(enrollment.termResults.map((result) => result.subjectId));
  const subjectsById = new Map(classSubjects.map((classSubject) => [classSubject.subjectId, classSubject]));
  selectedStreams.forEach(({ status, subjectStream }) => {
    const isActive = subjectStream.subject.status === 'ACTIVE';
    const isRequired = classSubjects.some(({ subjectId }) => subjectId === subjectStream.subjectId);
    const selected = status === 'ACTIVE';
    const hasPublishedResult = publishedSubjectIds.has(subjectStream.subjectId);
    if (shouldIncludeReportSubject({ isActive, isRequired, selected, hasPublishedResult })) {
      subjectsById.set(subjectStream.subjectId, {
        subjectId: subjectStream.subjectId,
        subject: subjectStream.subject,
      });
    }
  });
  return [...subjectsById.values()];
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
        OR: [
          ...(enrollment.classGroupId ? [{ classGroupId: enrollment.classGroupId }] : []),
          {
            subjectStream: {
              is: {
                classLevelId: enrollment.classLevelId,
                studentSelections: { some: { enrollmentId: enrollment.id, status: 'ACTIVE' } },
              },
            },
          },
        ],
        schoolId: enrollment.schoolId,
      },
      select: { id: true },
    });
    if (!assignment) throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
  }

  const gradeScale = await getGradeScaleForClassLevel(prisma, enrollment.classLevelId);
  const school = await prisma.school.findUnique({
    where: { id: enrollment.schoolId },
    select: reportSchoolSelect,
  });
  const reportCard = reportCardForEnrollment(enrollment, await getRequiredSubjects(enrollment), gradeScale.maxScore, school);
  ensureResultsPublished([reportCard]);
  return reportCard;
}

export async function getClassGroupReportCards({ termId, classGroupId, schoolId, teacherUserId = null }) {
  const [classGroup, term] = await Promise.all([
    prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { classLevelId: true } }),
    prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
  ]);
  if (!classGroup || !term) throw httpError(404, 'CLASS_GROUP_TERM_NOT_FOUND', 'The selected term or class group was not found.');
  if (teacherUserId) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        teacher: { is: { userId: teacherUserId } }, termId, schoolId,
        OR: [
          { classGroupId },
          {
            subjectStream: {
              is: {
                classLevelId: classGroup.classLevelId,
                studentSelections: {
                  some: {
                    status: 'ACTIVE',
                    enrollment: { is: { termId, classGroupId, status: 'ACTIVE' } },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!assignment) throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
  }
  const enrollments = await prisma.enrollment.findMany({
    where: { termId, classGroupId, schoolId, status: 'ACTIVE' },
    include: reportEnrollmentInclude,
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  const gradeScale = await getGradeScaleForClassLevel(prisma, classGroup.classLevelId);
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: reportSchoolSelect,
  });
  const reportCards = await Promise.all(enrollments.map(async (enrollment) => (
    reportCardForEnrollment(enrollment, await getRequiredSubjects(enrollment), gradeScale.maxScore, school)
  )));
  ensureResultsPublished(reportCards);
  return reportCards;
}
