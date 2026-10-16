import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function getElectiveAssignment(db, assignmentId, schoolId) {
  const assignment = await db.teachingAssignment.findFirst({
    where: { id: assignmentId, schoolId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      subjectStream: { include: { classLevel: { include: { subjects: { select: { subjectId: true, isRequired: true } } } } } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      term: { select: { id: true, name: true, sequence: true, status: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });
  if (!assignment) throw httpError(404, 'TEACHING_ASSIGNMENT_NOT_FOUND', 'Subject stream not found.');
  if (!assignment.subjectStreamId) {
    throw httpError(409, 'SUBJECT_STREAM_NOT_CONFIGURED', 'This teaching assignment has no subject stream configured.');
  }
  const classSubject = assignment.subjectStream.classLevel.subjects
    .find(({ subjectId }) => subjectId === assignment.subjectId);
  if (classSubject?.isRequired) {
    throw httpError(409, 'REQUIRED_SUBJECT_ROSTER_LOCKED', 'Required subjects include every active student automatically and cannot be managed as elective streams.');
  }
  return assignment;
}

export async function getStudentStreamRoster(assignmentId, schoolId) {
  const assignment = await getElectiveAssignment(prisma, assignmentId, schoolId);
  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId,
      termId: assignment.termId,
      classLevelId: assignment.subjectStream.classLevelId,
      status: 'ACTIVE',
    },
    include: {
      student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true } },
      classGroup: { select: { id: true, name: true } },
      subjectStreams: {
        where: { status: 'ACTIVE', subjectStream: { termId: assignment.termId, subjectId: assignment.subjectId } },
        include: { subjectStream: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  return {
    assignment: {
      id: assignment.id,
      term: assignment.term,
      classGroup: null,
      classLevel: assignment.subjectStream.classLevel,
      subject: assignment.subject,
      subjectStream: assignment.subjectStream,
      teacher: assignment.teacher,
    },
    students: enrollments.map((enrollment) => {
      const selectedStream = enrollment.subjectStreams.find((selection) => selection.subjectStreamId === assignment.subjectStreamId);
      const otherStream = enrollment.subjectStreams.find((selection) => selection.subjectStreamId !== assignment.subjectStreamId);
      return {
        enrollmentId: enrollment.id,
        student: enrollment.student,
        classGroup: enrollment.classGroup,
        selected: Boolean(selectedStream),
        assignedToOtherStream: otherStream?.subjectStream?.name ?? null,
        droppedAt: null,
      };
    }).filter((student) => student.selected || !student.assignedToOtherStream),
  };
}

export async function saveStudentStreamRoster(assignmentId, enrollmentIds, schoolId) {
  const assignment = await getElectiveAssignment(prisma, assignmentId, schoolId);
  if (!['DRAFT', 'OPEN'].includes(assignment.term.status)) {
    throw httpError(409, 'TERM_NOT_EDITABLE', 'Student subject streams can only be changed while the term is in DRAFT or OPEN status.');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      id: { in: enrollmentIds },
      schoolId,
      termId: assignment.termId,
      classLevelId: assignment.subjectStream.classLevelId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (enrollments.length !== enrollmentIds.length) {
    throw httpError(400, 'INVALID_STREAM_ENROLLMENTS', 'Every selected student must have an active enrollment in this class level and term.');
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const elsewhere = enrollmentIds.length ? await tx.enrollmentSubjectStream.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        schoolId,
        status: 'ACTIVE',
        subjectStreamId: { not: assignment.subjectStreamId },
        subjectStream: { termId: assignment.termId, subjectId: assignment.subjectId },
      },
      select: { enrollmentId: true, subjectStream: { select: { name: true } } },
    }) : [];
    if (elsewhere.length) {
      const labels = [...new Set(elsewhere.map((entry) => entry.subjectStream.name))].join(', ');
      throw httpError(409, 'STUDENTS_ASSIGNED_TO_OTHER_STREAM', `Some selected students already belong to another section of this subject (${labels}). Drop them from that section first.`);
    }

    const existing = await tx.enrollmentSubjectStream.findMany({
      where: { subjectStreamId: assignment.subjectStreamId, schoolId },
      select: { id: true, enrollmentId: true, status: true },
    });
    const existingByEnrollment = new Map(existing.map((selection) => [selection.enrollmentId, selection]));

    await tx.enrollmentSubjectStream.updateMany({
      where: {
        subjectStreamId: assignment.subjectStreamId,
        schoolId,
        status: 'ACTIVE',
        ...(enrollmentIds.length ? { enrollmentId: { notIn: enrollmentIds } } : {}),
      },
      data: { status: 'INACTIVE', droppedAt: now },
    });
    if (enrollmentIds.length) {
      await tx.enrollmentSubjectStream.updateMany({
        where: { subjectStreamId: assignment.subjectStreamId, schoolId, enrollmentId: { in: enrollmentIds }, status: 'INACTIVE' },
        data: { status: 'ACTIVE', droppedAt: null },
      });
      const toCreate = enrollmentIds.filter((id) => !existingByEnrollment.has(id));
      if (toCreate.length) {
        await tx.enrollmentSubjectStream.createMany({
          data: toCreate.map((enrollmentId) => ({
            enrollmentId,
            subjectStreamId: assignment.subjectStreamId,
            schoolId,
            status: 'ACTIVE',
          })),
          skipDuplicates: true,
        });
      }
    }

    return { selectedCount: enrollmentIds.length };
  });
}
