import { prisma } from '../../lib/prisma.js';
import { getGradeScaleForClassLevel } from '../grade-scales/class-level-grade-scale.js';
import { shouldIncludeReportSubject } from '../class-subjects/subject-requirements.js';
import { createNotifications, getStudentAndParentUserIds } from '../notifications/notifications.service.js';

/* -------------------------------------------------------------------------- */
/* Policy                                                                     */
/* -------------------------------------------------------------------------- */

// Every subject needs at least this many coursework assessments plus the mid-term exam.
// The mid-term grade is the plain average of coursework and mid-term exam percentages.
export const MID_TERM_POLICY = Object.freeze({
  minContinuousAssessments: 2,
});

// Coursework and mid-term exams only count once approved and locked.
const LOCKED_ASSESSMENT_STATUS = 'LOCKED';

const MAX_ERROR_DETAILS = 10;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isMidTermExam(assessmentType) {
  const normalized = String(assessmentType ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  // Assessment types are stored as free strings and older records may use
  // labels such as MID_TERM_EXAMINATION or MIDTERM TEST.
  return normalized.includes('MIDTERM');
}

function isContinuousAssessment(assessmentType) {
  return String(assessmentType ?? '').toUpperCase().replace(/[^A-Z]/g, '') === 'COURSEWORK';
}

function roundTo(value, places = 2) {
  return Number(value.toFixed(places));
}

function averageOf(values) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function percentOf(mark, maxMark) {
  return maxMark > 0 ? (mark / maxMark) * 100 : null;
}

// A result is "recorded" once the teacher has stated an outcome: a mark, absent, or exempt.
function isRecorded(result) {
  return result.status === 'PRESENT' ? result.mark !== null : result.status !== 'NOT_ENTERED';
}

function studentDisplayName(student) {
  return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')
    || student.admissionNumber;
}

function gradeFor(boundaries, percent) {
  return boundaries.find((boundary) => percent >= boundary.minPercent) ?? null;
}

async function loadBoundaries(gradeScale) {
  const raw = gradeScale.boundaries
    ?? (gradeScale.id
      ? await prisma.gradeBoundary.findMany({ where: { gradeScaleId: gradeScale.id } })
      : []);
  return raw
    .map((boundary) => ({
      grade: boundary.grade,
      minPercent: Number(boundary.minPercent),
      description: boundary.description ?? null,
    }))
    .sort((a, b) => b.minPercent - a.minPercent);
}

const midTermEnrollmentInclude = {
  student: true,
  term: { include: { academicYear: true } },
  classLevel: true,
  classGroup: { include: { classLevel: true } },
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

/* -------------------------------------------------------------------------- */
/* Report building (pure, no database access)                                 */
/* -------------------------------------------------------------------------- */

function assessmentLine(result) {
  const { assessment } = result;
  const maxMark = Number(assessment.maxMark);
  const mark = result.mark === null ? null : Number(result.mark);
  const scored = result.status === 'PRESENT' && mark !== null;
  return {
    assessmentId: assessment.id,
    title: assessment.title,
    assessmentType: assessment.assessmentType,
    isMidTermExam: isMidTermExam(assessment.assessmentType),
    isContinuousAssessment: isContinuousAssessment(assessment.assessmentType),
    assessmentStatus: assessment.status,
    locked: assessment.status === LOCKED_ASSESSMENT_STATUS,
    maxMark,
    mark: scored ? mark : null,
    percent: scored ? percentOf(mark, maxMark) : null,
    status: result.status,
    recorded: isRecorded(result),
    teacherComment: result.teacherComment ?? null,
  };
}

function buildSubjectMidTerm({ subjectId, subject }, results, boundaries, scoreOutOf) {
  const lines = results
    .map(assessmentLine)
    .sort((a, b) => a.title.localeCompare(b.title));
  const reportableLines = lines.filter((line) => line.isContinuousAssessment || line.isMidTermExam);
  const lockedLines = reportableLines.filter((line) => line.locked);
  const unlockedCount = reportableLines.length - lockedLines.length;
  const continuous = lockedLines.filter((line) => line.isContinuousAssessment);
  const exams = lockedLines.filter((line) => line.isMidTermExam);

  const issues = [];
  if (unlockedCount > 0) {
    issues.push({
      code: 'ASSESSMENTS_NOT_LOCKED',
      message: `${unlockedCount} assessment${unlockedCount === 1 ? '' : 's'} not approved and locked`,
    });
  }
  const recordedContinuous = continuous.filter((line) => line.recorded).length;
  if (recordedContinuous < MID_TERM_POLICY.minContinuousAssessments) {
    issues.push({
      code: 'CONTINUOUS_ASSESSMENTS_MISSING',
      message: `Only ${recordedContinuous} of ${MID_TERM_POLICY.minContinuousAssessments} required coursework assessments have recorded results`,
    });
  }
  if (exams.length === 0) {
    issues.push({ code: 'MID_TERM_EXAM_MISSING', message: 'no locked mid-term exam' });
  } else if (!exams.some((line) => line.recorded)) {
    issues.push({ code: 'MID_TERM_EXAM_NOT_ENTERED', message: 'mid-term exam not entered' });
  }

  // Absence counts as zero, matching term-result calculations. Exempt results
  // do not contribute a score to the average.
  const averageablePercents = (list) => list
    .map((line) => (line.status === 'ABSENT' ? 0 : line.percent))
    .filter((percent) => percent !== null);
  const continuousPercent = averageOf(averageablePercents(continuous));
  const examPercent = averageOf(averageablePercents(exams));

  // Treat coursework and mid-term exams as two equally weighted components:
  // average all coursework first, average mid-term exams, then average those
  // component averages. This prevents a subject with more coursework entries
  // from outweighing its mid-term exam.
  const componentAverages = [continuousPercent, examPercent].filter((value) => value !== null);
  const averagePercent = averageOf(componentAverages);
  const boundary = averagePercent === null ? null : gradeFor(boundaries, averagePercent);
  if (!boundary) {
    issues.push({ code: 'GRADE_MISSING', message: 'no grade could be calculated' });
  }

  return {
    subjectId,
    subjectCode: subject.code,
    subjectName: subject.name,
    complete: issues.length === 0,
    issues,
    assessments: lines.map((line) => ({
      ...line,
      percent: line.percent === null ? null : roundTo(line.percent),
    })),
    continuousAssessment: {
      count: continuous.length,
      recordedCount: recordedContinuous,
      averagePercent: continuousPercent === null ? null : roundTo(continuousPercent),
    },
    midTermExam: {
      percent: examPercent === null ? null : roundTo(examPercent),
      absent: exams.length > 0 && exams.every((line) => line.status === 'ABSENT'),
    },
    averagePercent: averagePercent === null ? null : roundTo(averagePercent),
    // Keep marks as percentages, consistent with term report results; the UI
    // converts this percentage to the configured scoreOutOf scale for display.
    finalMark: averagePercent === null ? null : roundTo(averagePercent),
    grade: boundary?.grade ?? null,
    gradeDescription: boundary?.description ?? null,
  };
}

function resolveReportSubjects(enrollment, classSubjects, streamSelections, subjectIdsWithResults) {
  const subjectsById = new Map(
    classSubjects.map(({ subjectId, subject }) => [subjectId, { subjectId, subject }]),
  );
  const requiredIds = new Set(classSubjects.map(({ subjectId }) => subjectId));

  streamSelections.forEach(({ status, subjectStream }) => {
    if (subjectStream.classLevelId !== enrollment.classLevelId) return;
    const include = shouldIncludeReportSubject({
      isActive: subjectStream.subject.status === 'ACTIVE',
      isRequired: requiredIds.has(subjectStream.subjectId),
      selected: status === 'ACTIVE',
      hasPublishedResult: subjectIdsWithResults.has(subjectStream.subjectId),
    });
    if (include) {
      subjectsById.set(subjectStream.subjectId, {
        subjectId: subjectStream.subjectId,
        subject: subjectStream.subject,
      });
    }
  });

  return [...subjectsById.values()].sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

function midTermReportCardForEnrollment({ enrollment, subjects, resultsBySubject, boundaries, scoreOutOf, school }) {
  const subjectResults = subjects.map((subject) => buildSubjectMidTerm(
    subject,
    resultsBySubject.get(subject.subjectId) ?? [],
    boundaries,
    scoreOutOf,
  ));
  const incompleteSubjects = subjectResults
    .filter((subject) => !subject.complete)
    .map(({ subjectId, subjectCode, subjectName, issues }) => ({ subjectId, subjectCode, subjectName, issues }));
  const percents = subjectResults.map((s) => s.averagePercent).filter((p) => p !== null);
  const overallPercent = averageOf(percents);

  return {
    complete: subjectResults.length > 0 && incompleteSubjects.length === 0,
    reportType: 'MID_TERM',
    enrollment: { id: enrollment.id, status: enrollment.status },
    student: enrollment.student,
    academicYear: enrollment.term.academicYear,
    scoreOutOf,
    term: enrollment.term,
    classGroup: enrollment.classGroup,
    classLevel: enrollment.classLevel,
    school,
    policy: MID_TERM_POLICY,
    summary: {
      subjects: subjectResults.length,
      completeSubjects: subjectResults.length - incompleteSubjects.length,
      incompleteSubjects: incompleteSubjects.length,
      averagePercent: overallPercent === null ? null : roundTo(overallPercent),
      averageMark: overallPercent === null ? null : roundTo(overallPercent),
    },
    subjects: subjectResults,
    incompleteSubjects,
  };
}

function ensureMidTermComplete(reportCards) {
  if (reportCards.some((card) => card.summary.subjects === 0)) {
    throw httpError(
      409,
      'MID_TERM_SUBJECTS_NOT_CONFIGURED',
      'Mid-term report cards cannot be generated because no required subjects are configured for this class.',
    );
  }
  const incompleteCards = reportCards.filter((card) => !card.complete);
  if (incompleteCards.length > 0) {
    const details = incompleteCards.flatMap((card) => {
      const studentName = studentDisplayName(card.student);
      return card.incompleteSubjects.map((subject) => (
        `${studentName}: ${subject.subjectName} (${subject.issues.map((issue) => issue.message).join(', ')})`
      ));
    });
    const shown = details.slice(0, MAX_ERROR_DETAILS);
    const hidden = details.length - shown.length;
    throw httpError(
      409,
      'MID_TERM_RESULTS_INCOMPLETE',
      `Mid-term report cards cannot be finalised because results are incomplete for ${incompleteCards.length} student${incompleteCards.length === 1 ? '' : 's'} (${shown.join('; ')}${hidden > 0 ? `; and ${hidden} more` : ''}). Every subject needs at least ${MID_TERM_POLICY.minContinuousAssessments} assessments plus the mid-term exam, all approved and locked, and a calculated grade.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Data loading (one round of queries for any number of enrollments)          */
/* -------------------------------------------------------------------------- */

async function loadMidTermContext(enrollments, { termId, schoolId }) {
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  const classLevelIds = [...new Set(enrollments.map((enrollment) => enrollment.classLevelId))];

  const [classSubjects, streamSelections, assessments] = await Promise.all([
    prisma.classSubject.findMany({
      where: { classLevelId: { in: classLevelIds }, schoolId, isRequired: true, subject: { status: 'ACTIVE' } },
      include: { subject: true },
    }),
    prisma.enrollmentSubjectStream.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        schoolId,
        subjectStream: { termId, subject: { status: 'ACTIVE' } },
      },
      include: { subjectStream: { include: { subject: true } } },
    }),
    prisma.assessment.findMany({
      where: { termId, schoolId },
      select: {
        id: true,
        title: true,
        assessmentType: true,
        maxMark: true,
        subjectId: true,
        status: true,
        teachingAssignment: {
          select: {
            classGroupId: true,
            subjectStreamId: true,
            classSubject: { select: { classLevelId: true, isRequired: true } },
          },
        },
        results: {
          where: { enrollmentId: { in: enrollmentIds } },
          select: { enrollmentId: true, mark: true, status: true, teacherComment: true },
        },
      },
    }),
  ]);

  const classSubjectsByLevel = new Map();
  classSubjects.forEach((classSubject) => {
    const list = classSubjectsByLevel.get(classSubject.classLevelId) ?? [];
    list.push(classSubject);
    classSubjectsByLevel.set(classSubject.classLevelId, list);
  });

  const streamsByEnrollment = new Map();
  streamSelections.forEach((selection) => {
    const list = streamsByEnrollment.get(selection.enrollmentId) ?? [];
    list.push(selection);
    streamsByEnrollment.set(selection.enrollmentId, list);
  });

  const resultsByEnrollment = new Map();
  assessments.forEach((assessment) => {
    const assignment = assessment.teachingAssignment;
    const resultByEnrollmentId = new Map(assessment.results.map((result) => [result.enrollmentId, result]));
    enrollments.forEach((enrollment) => {
      const streamSelection = (streamsByEnrollment.get(enrollment.id) ?? [])
        .some(({ status, subjectStream }) => status === 'ACTIVE' && subjectStream.id === assignment.subjectStreamId);
      const appliesToEnrollment = assignment.classSubject?.isRequired
        ? assignment.classSubject.classLevelId === enrollment.classLevelId
        : assignment.subjectStreamId
          ? streamSelection
          : assignment.classGroupId === enrollment.classGroupId;
      if (!appliesToEnrollment) return;

      const result = resultByEnrollmentId.get(enrollment.id) ?? {
        enrollmentId: enrollment.id,
        mark: null,
        status: 'NOT_ENTERED',
        teacherComment: null,
      };
      const bySubject = resultsByEnrollment.get(enrollment.id) ?? new Map();
      const list = bySubject.get(assessment.subjectId) ?? [];
      list.push({ ...result, assessment });
      bySubject.set(assessment.subjectId, list);
      resultsByEnrollment.set(enrollment.id, bySubject);
    });
  });

  return { classSubjectsByLevel, streamsByEnrollment, resultsByEnrollment };
}

async function buildMidTermReportCards(enrollments, { termId, schoolId, classLevelId }) {
  const gradeScale = await getGradeScaleForClassLevel(prisma, classLevelId);
  const [school, boundaries, context] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: reportSchoolSelect }),
    loadBoundaries(gradeScale),
    loadMidTermContext(enrollments, { termId, schoolId }),
  ]);

  return enrollments.map((enrollment) => {
    const resultsBySubject = context.resultsByEnrollment.get(enrollment.id) ?? new Map();
    const subjects = resolveReportSubjects(
      enrollment,
      context.classSubjectsByLevel.get(enrollment.classLevelId) ?? [],
      context.streamsByEnrollment.get(enrollment.id) ?? [],
      new Set(resultsBySubject.keys()),
    );
    return midTermReportCardForEnrollment({
      enrollment,
      subjects,
      resultsBySubject,
      boundaries,
      scoreOutOf: gradeScale.maxScore,
      school,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function getMidTermReportCardPreview(enrollmentId, {
  schoolId,
  teacherUserId = null,
  allowIncomplete = false,
}) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, schoolId },
    include: midTermEnrollmentInclude,
  });
  if (!enrollment) {
    throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Student enrollment not found.');
  }

  if (teacherUserId) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        teacher: { is: { userId: teacherUserId } },
        termId: enrollment.termId,
        schoolId,
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
      },
      select: { id: true },
    });
    const formTutorAssignment = !assignment && enrollment.classGroupId
      ? await prisma.formTutorAssignment.findFirst({
          where: {
            classGroupId: enrollment.classGroupId,
            academicYearId: enrollment.term.academicYearId,
            schoolId,
            teacher: { userId: teacherUserId },
          },
          select: { id: true },
        })
      : null;
    if (!assignment && !formTutorAssignment) {
      throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
    }
  }

  const [reportCard] = await buildMidTermReportCards([enrollment], {
    termId: enrollment.termId,
    schoolId,
    classLevelId: enrollment.classLevelId,
  });
  if (!allowIncomplete) ensureMidTermComplete([reportCard]);
  return reportCard;
}

export async function getClassGroupMidTermReportCards({
  termId,
  classGroupId,
  schoolId,
  teacherUserId = null,
  allowIncomplete = false,
}) {
  const [classGroup, term] = await Promise.all([
    prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { classLevelId: true } }),
    prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true, academicYearId: true } }),
  ]);
  if (!classGroup || !term) {
    throw httpError(404, 'CLASS_GROUP_TERM_NOT_FOUND', 'The selected term or class group was not found.');
  }

  if (teacherUserId) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        teacher: { is: { userId: teacherUserId } },
        termId,
        schoolId,
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
    const formTutorAssignment = !assignment
      ? await prisma.formTutorAssignment.findFirst({
          where: {
            classGroupId,
            academicYearId: term.academicYearId,
            schoolId,
            teacher: { userId: teacherUserId },
          },
          select: { id: true },
        })
      : null;
    if (!assignment && !formTutorAssignment) {
      throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
    }
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { termId, classGroupId, schoolId, status: 'ACTIVE' },
    include: midTermEnrollmentInclude,
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  if (enrollments.length === 0) return [];

  const reportCards = await buildMidTermReportCards(enrollments, {
    termId,
    schoolId,
    classLevelId: classGroup.classLevelId,
  });
  if (!allowIncomplete) ensureMidTermComplete(reportCards);
  return reportCards;
}

export async function getMidTermReportPublication({ termId, classGroupId, schoolId }) {
  return prisma.reportPublication.findFirst({
    where: { termId, classGroupId, schoolId, type: 'MID_TERM' },
    select: { id: true, publishedAt: true, publishedBy: { select: { firstName: true, lastName: true } } },
  });
}

export async function publishClassGroupMidTermReports({ termId, classGroupId, schoolId, actorId, req }) {
  const reportCards = await getClassGroupMidTermReportCards({ termId, classGroupId, schoolId, allowIncomplete: true });
  if (!reportCards.length) {
    throw httpError(409, 'MID_TERM_NO_ACTIVE_STUDENTS', 'There are no active student enrollments to publish for this class and term.');
  }
  ensureMidTermComplete(reportCards);

  return prisma.$transaction(async (tx) => {
    const publication = await tx.reportPublication.upsert({
      where: { termId_classGroupId_type: { termId, classGroupId, type: 'MID_TERM' } },
      create: { type: 'MID_TERM', termId, classGroupId, schoolId, publishedById: actorId },
      update: { schoolId, publishedById: actorId, publishedAt: new Date() },
      select: { id: true, publishedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'MID_TERM_REPORTS_PUBLISHED',
        entityType: 'ReportPublication',
        entityId: publication.id,
        schoolId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
        newValues: { type: 'MID_TERM', termId, classGroupId, studentCount: reportCards.length },
      },
    });
    const userIds = await getStudentAndParentUserIds(tx, {
      schoolId,
      studentIds: reportCards.map(({ student }) => student.id),
    });
    const term = reportCards[0].term;
    await createNotifications(tx, {
      schoolId,
      userIds,
      type: 'MID_TERM_REPORT_PUBLISHED',
      title: 'Mid-term reports published',
      message: `Mid-term reports for ${term.name} are now available.`,
      entityId: publication.id,
    });
    return publication;
  }, { isolationLevel: 'Serializable' });
}

export async function getParentPublishedMidTermReport(enrollmentId, userId, schoolId) {
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      schoolId,
      student: { is: { parents: { some: { parent: { userId, schoolId } } } } },
    },
    select: { id: true, termId: true, classGroupId: true },
  });
  if (!enrollment || !enrollment.classGroupId) {
    throw httpError(404, 'MID_TERM_REPORT_NOT_AVAILABLE', 'This mid-term report is not available to your parent account.');
  }
  const publication = await getMidTermReportPublication({
    termId: enrollment.termId,
    classGroupId: enrollment.classGroupId,
    schoolId,
  });
  if (!publication) {
    throw httpError(404, 'MID_TERM_REPORT_NOT_PUBLISHED', 'The school has not published this mid-term report yet.');
  }
  return getMidTermReportCardPreview(enrollmentId, { schoolId });
}
