import { prisma } from '../../lib/prisma.js';
import { getReportCardDetails } from './report-card-details.service.js';
import { getGradeScaleForClassLevel } from '../grade-scales/class-level-grade-scale.js';
import { shouldIncludeReportSubject } from '../class-subjects/subject-requirements.js';
import { createNotifications, getStudentAndParentUserIds } from '../notifications/notifications.service.js';

const LOCKED = 'LOCKED';
const MAX_ERROR_DETAILS = 10;
const schoolSelect = { id: true, name: true, email: true, address: true, phone: true, logoDataUrl: true, secondaryLogoDataUrl: true, classTeacherSignerName: true, headteacherSignerName: true, reportDesign: true };

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function typeOf(value) { return String(value || '').toUpperCase().replace(/[^A-Z]/g, ''); }
function isCoursework(type) { return typeOf(type) === 'COURSEWORK'; }
function isMidTerm(type) { return typeOf(type).includes('MIDTERM'); }
function isFinalExam(type) { return typeOf(type).includes('FINALEXAM'); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function percent(mark, maxMark) { return maxMark > 0 ? mark / maxMark * 100 : null; }
function recorded(result) { return result.status === 'PRESENT' ? result.mark !== null : result.status !== 'NOT_ENTERED'; }
function studentName(student) { return [student?.firstName, student?.middleName, student?.lastName].filter(Boolean).join(' ') || student?.admissionNumber || 'Student'; }
function gradeFor(boundaries, mark) { return boundaries.find((boundary) => mark >= Number(boundary.minPercent)) || null; }

function subjectsForEnrollment(enrollment, classSubjects, streamSelections) {
  const subjects = new Map(classSubjects.map(({ subjectId, subject }) => [subjectId, { subjectId, subject }]));
  const requiredIds = new Set(subjects.keys());
  for (const { status, subjectStream } of streamSelections) {
    if (shouldIncludeReportSubject({
      isActive: subjectStream.subject.status === 'ACTIVE',
      isRequired: requiredIds.has(subjectStream.subjectId),
      selected: status === 'ACTIVE',
      hasPublishedResult: false,
    })) subjects.set(subjectStream.subjectId, { subjectId: subjectStream.subjectId, subject: subjectStream.subject });
  }
  return [...subjects.values()].sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

function applies(assessment, enrollment, activeStreamIds) {
  const assignment = assessment.teachingAssignment;
  if (assignment.classSubject?.isRequired) return assignment.classSubject.classLevelId === enrollment.classLevelId;
  if (assignment.subjectStreamId) return activeStreamIds.has(assignment.subjectStreamId);
  return assignment.classGroupId === enrollment.classGroupId;
}

function calculateSubject(subject, assessments, boundaries, scoreOutOf, published) {
  const lines = assessments.filter((item) => isCoursework(item.assessmentType) || isMidTerm(item.assessmentType) || isFinalExam(item.assessmentType));
  const coursework = lines.filter((line) => isCoursework(line.assessmentType));
  const midTerms = lines.filter((line) => isMidTerm(line.assessmentType));
  const finals = lines.filter((line) => isFinalExam(line.assessmentType));
  const issues = [];
  if (coursework.length < 2) issues.push(`Only ${coursework.length} of 2 required coursework assessments are configured`);
  if (!midTerms.length) issues.push('No mid-term exam is configured');
  if (finals.length !== 1) issues.push(`Expected exactly one final exam; found ${finals.length}`);
  const unlocked = lines.filter((line) => line.assessmentStatus !== LOCKED);
  if (unlocked.length) issues.push(`${unlocked.length} assessment${unlocked.length === 1 ? '' : 's'} not approved and locked`);
  const missing = lines.filter((line) => !recorded(line.result));
  if (missing.length) issues.push(`${missing.length} assessment result${missing.length === 1 ? '' : 's'} not entered`);

  const scoreLine = (line) => line.result.status === 'ABSENT' ? 0
    : line.result.status === 'EXEMPT' ? null
      : percent(Number(line.result.mark), Number(line.maxMark));
  const componentScores = [...coursework, ...midTerms].map(scoreLine).filter((value) => value !== null && Number.isFinite(value));
  const finalScore = finals.length === 1 && finals[0].result.status !== 'EXEMPT' ? scoreLine(finals[0]) : null;
  if (!componentScores.length) issues.push('Coursework and mid-term marks cannot be calculated');
  if (finalScore === null) issues.push('Final exam mark is missing or exempt');
  const componentAverage = average(componentScores);
  const finalMark = componentAverage !== null && finalScore !== null
    ? Number((componentAverage * 0.4 + finalScore * 0.6).toFixed(2))
    : null;
  const boundary = finalMark === null ? null : gradeFor(boundaries, finalMark);
  if (finalMark !== null && !boundary) issues.push('No grade boundary matches the calculated mark');
  return {
    subjectId: subject.subjectId,
    subjectCode: subject.subject.code,
    subjectName: subject.subject.name,
    published,
    complete: issues.length === 0,
    issue: issues.join('; ') || null,
    finalMark,
    grade: boundary?.grade ?? null,
    gradeDescription: boundary?.description ?? null,
    teacherComment: lines.map((line) => line.result.teacherComment).find(Boolean) ?? null,
    courseworkAndMidTermAverage: componentAverage === null ? null : Number(componentAverage.toFixed(2)),
    finalExamPercent: finalScore === null ? null : Number(finalScore.toFixed(2)),
    issues,
  };
}

function buildReportCard(enrollment, subjects, assessmentResults, boundaries, scoreOutOf, school, published) {
  const studentSubjects = subjects.map((subject) => calculateSubject(
    subject,
    assessmentResults.get(subject.subjectId) || [],
    boundaries,
    scoreOutOf,
    published,
  ));
  const missingSubjects = studentSubjects.filter((subject) => !subject.complete);
  const marks = studentSubjects.map((subject) => subject.finalMark).filter((mark) => mark !== null);
  return {
    complete: studentSubjects.length > 0 && missingSubjects.length === 0,
    reportType: 'END_OF_TERM',
    enrollment: { id: enrollment.id, status: enrollment.status },
    student: enrollment.student,
    nextEnrollment: enrollment.nextEnrollment ? {
      classLevel: enrollment.nextEnrollment.classLevel,
      classGroup: enrollment.nextEnrollment.classGroup,
      term: enrollment.nextEnrollment.term,
    } : null,
    academicYear: enrollment.term.academicYear,
    scoreOutOf,
    gradeKey: boundaries.map(({ grade, minPercent, description }, index) => ({
      grade,
      minPercent: Number(minPercent),
      minMark: Math.ceil(Number(minPercent) * scoreOutOf / 100),
      maxMark: index === 0 ? scoreOutOf : Math.ceil(Number(boundaries[index - 1].minPercent) * scoreOutOf / 100) - 1,
      description,
    })),
    term: enrollment.term,
    classGroup: enrollment.classGroup,
    classLevel: enrollment.classLevel,
    school,
    summary: {
      requiredSubjects: subjects.length,
      publishedSubjects: published ? studentSubjects.filter((item) => item.complete).length : 0,
      missingSubjects: missingSubjects.length,
      averageMark: marks.length ? Number((marks.reduce((sum, mark) => sum + mark, 0) / marks.length).toFixed(2)) : null,
    },
    subjects: studentSubjects,
    missingSubjects: missingSubjects.map(({ subjectId, subjectCode, subjectName, issue }) => ({ subjectId, subjectCode, subjectName, issue })),
  };
}

function ensureResultsReady(cards) {
  if (cards.some((card) => card.summary.requiredSubjects === 0)) {
    throw httpError(409, 'REPORT_SUBJECTS_NOT_CONFIGURED', 'Report cards cannot be generated because no required subjects are configured for this class.');
  }
  const incomplete = cards.filter((card) => !card.complete);
  if (!incomplete.length) return;
  const details = incomplete.flatMap((card) => card.missingSubjects.map((subject) => `${studentName(card.student)}: ${subject.subjectName} (${subject.issue})`));
  const shown = details.slice(0, MAX_ERROR_DETAILS);
  throw httpError(409, 'END_OF_TERM_ASSESSMENTS_INCOMPLETE', `End-of-term reports are not ready for ${incomplete.length} student${incomplete.length === 1 ? '' : 's'} (${shown.join('; ')}${details.length > shown.length ? `; and ${details.length - shown.length} more` : ''}). Every subject requires two locked coursework assessments, a locked mid-term exam, one locked final exam, and recorded results.`);
}

async function loadCards(enrollments, { termId, schoolId, classLevelId, publication }) {
  if (!enrollments.length) return [];
  const enrollmentIds = enrollments.map(({ id }) => id);
  const classLevelIds = [...new Set(enrollments.map(({ classLevelId: id }) => id))];
  const sampleEnrollment = enrollments[0];
  const [classSubjects, streams, assessments, baseSchool, gradeScale, formTutor, headteacher, detailRows] = await Promise.all([
    prisma.classSubject.findMany({ where: { classLevelId: { in: classLevelIds }, schoolId, isRequired: true, subject: { status: 'ACTIVE' } }, include: { subject: true } }),
    prisma.enrollmentSubjectStream.findMany({ where: { enrollmentId: { in: enrollmentIds }, schoolId, subjectStream: { termId, subject: { status: 'ACTIVE' } } }, include: { subjectStream: { include: { subject: true } } } }),
    prisma.assessment.findMany({
      where: { termId, schoolId },
      select: {
        id: true, title: true, assessmentType: true, maxMark: true, subjectId: true, status: true,
        teachingAssignment: { select: { classGroupId: true, subjectStreamId: true, classSubject: { select: { classLevelId: true, isRequired: true } } } },
        results: { where: { enrollmentId: { in: enrollmentIds } }, select: { enrollmentId: true, mark: true, status: true, teacherComment: true } },
      },
    }),
    prisma.school.findUnique({ where: { id: schoolId }, select: schoolSelect }),
    getGradeScaleForClassLevel(prisma, classLevelId),
    prisma.formTutorAssignment.findFirst({ where: { classGroupId: sampleEnrollment.classGroupId, academicYearId: sampleEnrollment.term.academicYearId, schoolId }, include: { teacher: { select: { firstName: true, lastName: true, user: { select: { signatureDataUrl: true } } } } } }),
    prisma.user.findFirst({ where: { schoolId, role: 'HEADTEACHER', status: 'ACTIVE' }, select: { firstName: true, lastName: true, signatureDataUrl: true } }),
    getReportCardDetails(enrollmentIds, 'END_OF_TERM'),
  ]);
  const detailsByEnrollment = new Map(detailRows.map(({ enrollmentId, ...details }) => [enrollmentId, details]));
  const formTutorName = formTutor ? `${formTutor.teacher.firstName} ${formTutor.teacher.lastName}`.trim() : null;
  const headteacherName = headteacher ? `${headteacher.firstName} ${headteacher.lastName}`.trim() : null;
  const school = { ...baseSchool, classTeacherSignerName: formTutorName || baseSchool.classTeacherSignerName, headteacherSignerName: headteacherName || baseSchool.headteacherSignerName, classTeacherSignatureDataUrl: formTutor?.teacher.user?.signatureDataUrl || null, headteacherSignatureDataUrl: headteacher?.signatureDataUrl || null };
  const classSubjectsByLevel = new Map();
  classSubjects.forEach((item) => { const list = classSubjectsByLevel.get(item.classLevelId) || []; list.push(item); classSubjectsByLevel.set(item.classLevelId, list); });
  const streamsByEnrollment = new Map();
  streams.forEach((item) => { const list = streamsByEnrollment.get(item.enrollmentId) || []; list.push(item); streamsByEnrollment.set(item.enrollmentId, list); });
  const boundaries = (gradeScale.boundaries || []).map((item) => ({ ...item, minPercent: Number(item.minPercent) })).sort((a, b) => b.minPercent - a.minPercent);
  return enrollments.map((enrollment) => {
    const selections = streamsByEnrollment.get(enrollment.id) || [];
    const activeStreamIds = new Set(selections.filter(({ status }) => status === 'ACTIVE').map(({ subjectStream }) => subjectStream.id));
    const applicable = assessments.filter((assessment) => applies(assessment, enrollment, activeStreamIds));
    const resultMap = new Map();
    applicable.forEach((assessment) => {
      const result = assessment.results.find((item) => item.enrollmentId === enrollment.id) || { enrollmentId: enrollment.id, mark: null, status: 'NOT_ENTERED', teacherComment: null };
      const list = resultMap.get(assessment.subjectId) || [];
      list.push({ ...assessment, result, assessmentStatus: assessment.status });
      resultMap.set(assessment.subjectId, list);
    });
    const subjects = subjectsForEnrollment(enrollment, classSubjectsByLevel.get(enrollment.classLevelId) || [], selections);
    return { ...buildReportCard(enrollment, subjects, resultMap, boundaries, gradeScale.maxScore, school, Boolean(publication)), reportDetails: detailsByEnrollment.get(enrollment.id) || null, issuedAt: publication?.publishedAt || new Date() };
  });
}

async function publicationFor(termId, classGroupId, schoolId) {
  return prisma.reportPublication.findFirst({ where: { termId, classGroupId, schoolId, type: 'END_OF_TERM' }, select: { id: true, publishedAt: true } });
}

export async function getParentReportCard(enrollmentId, userId, schoolId) {
  const enrollment = await prisma.enrollment.findFirst({ where: { id: enrollmentId, schoolId, student: { parents: { some: { parent: { userId, schoolId } } } } }, select: { id: true, termId: true, classGroupId: true } });
  if (!enrollment || !enrollment.classGroupId) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'This student enrollment is not available to your parent account.');
  const publication = await publicationFor(enrollment.termId, enrollment.classGroupId, schoolId);
  if (!publication) throw httpError(409, 'TERM_REPORT_NOT_PUBLISHED', 'The school has not published end-of-term reports for this class yet.');
  return getReportCardPreview(enrollment.id, null, true);
}

export async function getReportCardPreview(enrollmentId, teacherUserId = null, parentAccess = false) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { student: true, term: { include: { academicYear: true } }, classLevel: true, classGroup: { include: { classLevel: true } }, nextEnrollment: { include: { classLevel: true, classGroup: true, term: true } } } });
  if (!enrollment) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Student enrollment not found.');
  if (teacherUserId && !parentAccess) {
    const assignment = await prisma.teachingAssignment.findFirst({ where: { teacher: { is: { userId: teacherUserId } }, termId: enrollment.termId, schoolId: enrollment.schoolId, OR: [{ classGroupId: enrollment.classGroupId || undefined }, { subjectStream: { is: { classLevelId: enrollment.classLevelId, studentSelections: { some: { enrollmentId, status: 'ACTIVE' } } } } }] }, select: { id: true } });
    const formTutorAssignment = !assignment && enrollment.classGroupId
      ? await prisma.formTutorAssignment.findFirst({ where: { classGroupId: enrollment.classGroupId, academicYearId: enrollment.term.academicYearId, schoolId: enrollment.schoolId, teacher: { userId: teacherUserId } }, select: { id: true } })
      : null;
    if (!assignment && !formTutorAssignment) throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
  }
  const publication = enrollment.classGroupId ? await publicationFor(enrollment.termId, enrollment.classGroupId, enrollment.schoolId) : null;
  const [card] = await loadCards([enrollment], { termId: enrollment.termId, schoolId: enrollment.schoolId, classLevelId: enrollment.classLevelId, publication });
  ensureResultsReady([card]);
  return card;
}

export async function getClassGroupReportCards({ termId, classGroupId, schoolId, teacherUserId = null, allowIncomplete = false }) {
  const [classGroup, term, publication] = await Promise.all([
    prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { classLevelId: true } }),
    prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true, academicYearId: true } }),
    publicationFor(termId, classGroupId, schoolId),
  ]);
  if (!classGroup || !term) throw httpError(404, 'CLASS_GROUP_TERM_NOT_FOUND', 'The selected term or class group was not found.');
  if (teacherUserId) {
    const assigned = await prisma.teachingAssignment.findFirst({
      where: {
        teacher: { is: { userId: teacherUserId } }, termId, schoolId,
        OR: [
          { classGroupId },
          { subjectStream: { is: {
            classLevelId: classGroup.classLevelId,
            studentSelections: { some: { status: 'ACTIVE', enrollment: { is: { termId, classGroupId, status: 'ACTIVE' } } } },
          } } },
        ],
      },
      select: { id: true },
    });
    const formTutorAssignment = !assigned
      ? await prisma.formTutorAssignment.findFirst({ where: { classGroupId, academicYearId: term.academicYearId, schoolId, teacher: { userId: teacherUserId } }, select: { id: true } })
      : null;
    if (!assigned && !formTutorAssignment) throw httpError(403, 'REPORT_CARD_ACCESS_DENIED', 'You are not assigned to this class group for the selected term.');
  }
  const enrollments = await prisma.enrollment.findMany({ where: { termId, classGroupId, schoolId, status: 'ACTIVE' }, include: { student: true, term: { include: { academicYear: true } }, classLevel: true, classGroup: { include: { classLevel: true } }, nextEnrollment: { include: { classLevel: true, classGroup: true, term: true } } }, orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }] });
  const cards = await loadCards(enrollments, { termId, schoolId, classLevelId: classGroup.classLevelId, publication });
  if (!allowIncomplete) ensureResultsReady(cards);
  return cards;
}

export async function getEndOfTermReportPublication({ termId, classGroupId, schoolId }) { return publicationFor(termId, classGroupId, schoolId); }

export async function publishClassGroupEndOfTermReports({ termId, classGroupId, schoolId, actorId, req }) {
  const cards = await getClassGroupReportCards({ termId, classGroupId, schoolId, allowIncomplete: true });
  if (!cards.length) throw httpError(409, 'REPORT_NO_ACTIVE_STUDENTS', 'There are no active student enrollments to publish for this class and term.');
  ensureResultsReady(cards);
  return prisma.$transaction(async (tx) => {
    const publishedAt = new Date();
    const publication = await tx.reportPublication.upsert({
      where: { termId_classGroupId_type: { termId, classGroupId, type: 'END_OF_TERM' } },
      create: { type: 'END_OF_TERM', termId, classGroupId, schoolId, publishedById: actorId, publishedAt },
      update: { schoolId, publishedById: actorId, publishedAt },
      select: { id: true, publishedAt: true },
    });
    await tx.auditLog.create({ data: { actorId, action: 'END_OF_TERM_REPORTS_PUBLISHED', entityType: 'ReportPublication', entityId: publication.id, schoolId, ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 500), newValues: { type: 'END_OF_TERM', termId, classGroupId, studentCount: cards.length } } });
    const userIds = await getStudentAndParentUserIds(tx, { schoolId, studentIds: cards.map(({ student }) => student.id) });
    await createNotifications(tx, { schoolId, userIds, type: 'TERM_RESULT_PUBLISHED', title: 'End-of-term reports published', message: `End-of-term reports for ${cards[0].term.name} are now available.`, entityId: publication.id });
    return publication;
  }, { isolationLevel: 'Serializable' });
}

export async function unpublishClassGroupEndOfTermReports({ termId, classGroupId, schoolId, actorId, req }) {
  return prisma.$transaction(async (tx) => {
    const publication = await tx.reportPublication.findUnique({
      where: { termId_classGroupId_type: { termId, classGroupId, type: 'END_OF_TERM' } },
      select: { id: true, publishedAt: true },
    });
    if (!publication) return { unpublished: false };
    const enrollments = await tx.enrollment.findMany({ where: { termId, classGroupId, schoolId, status: 'ACTIVE' }, select: { studentId: true } });
    const userIds = await getStudentAndParentUserIds(tx, { schoolId, studentIds: enrollments.map(({ studentId }) => studentId) });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'END_OF_TERM_REPORTS_UNPUBLISHED',
        entityType: 'ReportPublication',
        entityId: publication.id,
        schoolId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 500),
        oldValues: { type: 'END_OF_TERM', termId, classGroupId, publishedAt: publication.publishedAt },
      },
    });
    await tx.reportPublication.delete({ where: { id: publication.id } });
    await createNotifications(tx, {
      schoolId,
      userIds,
      type: 'TERM_RESULT_PUBLISHED',
      title: 'End-of-term reports withdrawn',
      message: 'The school has temporarily withdrawn these end-of-term reports while they are being reviewed.',
      entityId: publication.id,
    });
    return { unpublished: true, previousPublishedAt: publication.publishedAt };
  }, { isolationLevel: 'Serializable' });
}
