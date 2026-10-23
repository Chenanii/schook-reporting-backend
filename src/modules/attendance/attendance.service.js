import { prisma } from '../../lib/prisma.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'];
const MARKABLE_TERM_STATUSES = ['OPEN'];

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function attendanceDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function currentSchoolDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Blantyre',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function loadTerm(termId, schoolId) {
  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId },
    include: { academicYear: { select: { id: true, name: true } } }
  });
  if (!term) throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
  return term;
}

async function requireCurrentFormTutor(db, classGroupId, academicYearId, userId, schoolId) {
  const assignment = await db.formTutorAssignment.findFirst({
    where: { classGroupId, academicYearId, schoolId, teacher: { userId } },
    include: { teacher: { select: { id: true, firstName: true, lastName: true } } }
  });
  if (!assignment) throw httpError(403, 'FORM_TUTOR_REQUIRED', 'Only the currently assigned form tutor can take attendance for this class.');
  return assignment;
}

async function getRoster(db, termId, classGroupId, schoolId) {
  return db.enrollment.findMany({
    where: { termId, classGroupId, schoolId, status: 'ACTIVE' },
    include: { student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } } },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }, { id: 'asc' }]
  });
}

export async function listAttendanceClasses(termId, date, user, schoolId) {
  const term = await loadTerm(termId, schoolId);
  const assignments = await prisma.formTutorAssignment.findMany({
    where: {
      academicYearId: term.academicYearId,
      schoolId,
      ...(ADMIN_ROLES.includes(user.role) ? {} : { teacher: { userId: user.id } })
    },
    include: {
      teacher: { select: { id: true, firstName: true, lastName: true } },
      classGroup: { include: { classLevel: { select: { id: true, name: true, levelOrder: true } } } }
    },
    orderBy: [{ classGroup: { classLevel: { levelOrder: 'asc' } } }, { classGroup: { name: 'asc' } }]
  });
  const groupIds = assignments.map(({ classGroupId }) => classGroupId);
  const counts = groupIds.length ? await prisma.enrollment.groupBy({
    by: ['classGroupId'],
    where: { schoolId, termId, status: 'ACTIVE', classGroupId: { in: groupIds } },
    _count: { _all: true }
  }) : [];
  const countByGroup = new Map(counts.map((item) => [item.classGroupId, item._count._all]));
  const sessions = date && groupIds.length ? await prisma.attendanceSession.findMany({
    where: { termId, date: attendanceDate(date), schoolId, classGroupId: { in: groupIds } },
    include: {
      records: { select: { status: true } },
      takenBy: { select: { firstName: true, lastName: true } }
    }
  }) : [];
  const sessionByGroup = new Map(sessions.map((session) => {
    const summary = session.records.reduce((counts, record) => {
      counts[record.status] += 1;
      return counts;
    }, { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 });
    const marked = session.records.length;
    return [session.classGroupId, {
      saved: true,
      marked,
      total: marked,
      summary,
      recordedBy: `${session.takenBy.firstName} ${session.takenBy.lastName}`
    }];
  }));
  return assignments.map((assignment) => ({
    ...assignment,
    studentCount: countByGroup.get(assignment.classGroupId) ?? 0,
    attendance: sessionByGroup.get(assignment.classGroupId) || { saved: false, marked: 0, total: 0, summary: { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }, recordedBy: null }
  }));
}

export async function getAttendanceSheet({ termId, classGroupId, date }, user, schoolId) {
  const term = await loadTerm(termId, schoolId);
  const group = await prisma.classGroup.findFirst({
    where: { id: classGroupId, schoolId },
    include: { classLevel: { select: { id: true, name: true, levelOrder: true } } }
  });
  if (!group) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  const assignment = await prisma.formTutorAssignment.findFirst({
    where: { classGroupId, academicYearId: term.academicYearId, schoolId },
    include: { teacher: { select: { id: true, userId: true, firstName: true, lastName: true } } }
  });
  if (!assignment) throw httpError(409, 'FORM_TUTOR_NOT_ASSIGNED', 'This class has no form tutor assigned for the academic year.');
  if (!ADMIN_ROLES.includes(user.role) && assignment.teacherId !== (await prisma.teacher.findFirst({ where: { userId: user.id, schoolId }, select: { id: true } }))?.id) {
    throw httpError(403, 'FORM_TUTOR_REQUIRED', 'Only the currently assigned form tutor can view this attendance sheet.');
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { termId, classGroupId, date: attendanceDate(date), schoolId },
    include: {
      records: {
        include: { enrollment: { include: { student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } } } } },
        orderBy: { enrollment: { student: { lastName: 'asc' } } }
      }
    }
  });
  const enrollments = session
    ? session.records.map((record) => ({ id: record.enrollmentId, student: record.enrollment.student, record }))
    : (await getRoster(prisma, termId, classGroupId, schoolId)).map((enrollment) => ({ ...enrollment, record: null }));
  return {
    term: { id: term.id, name: term.name, status: term.status, academicYear: term.academicYear },
    classGroup: group,
    formTutor: assignment.teacher,
    date,
    saved: Boolean(session),
    canRecord: ADMIN_ROLES.includes(user.role) || assignment.teacher.userId === user.id,
    students: enrollments.map((enrollment) => {
      const mark = enrollment.record;
      return {
        enrollmentId: enrollment.id,
        student: enrollment.student,
        status: mark?.status ?? null,
        note: mark?.note ?? ''
      };
    })
  };
}

export async function saveAttendance({ termId, classGroupId, date, records }, user, schoolId, req) {
  const term = await loadTerm(termId, schoolId);
  if (date > currentSchoolDate()) {
    throw httpError(400, 'FUTURE_ATTENDANCE_DATE', 'Attendance cannot be recorded for a future date.');
  }
  if (!MARKABLE_TERM_STATUSES.includes(term.status)) {
    throw httpError(409, 'TERM_NOT_OPEN', 'Attendance can only be recorded while the term is open.');
  }
  const day = attendanceDate(date);
  if (day < term.startDate || day > term.endDate) {
    throw httpError(400, 'DATE_OUTSIDE_TERM', 'The attendance date must fall within the selected term.');
  }
  return prisma.$transaction(async (tx) => {
    const classAssignment = await tx.formTutorAssignment.findFirst({
      where: { classGroupId, academicYearId: term.academicYearId, schoolId },
      select: { id: true }
    });
    if (!classAssignment) throw httpError(409, 'FORM_TUTOR_NOT_ASSIGNED', 'This class has no form tutor assigned for the academic year.');
    if (!ADMIN_ROLES.includes(user.role)) await requireCurrentFormTutor(tx, classGroupId, term.academicYearId, user.id, schoolId);
    const existingSession = await tx.attendanceSession.findUnique({
      where: { classGroupId_termId_date: { classGroupId, termId, date: day } },
      select: { records: { select: { enrollmentId: true } } }
    });
    const existingRosterIds = existingSession?.records.map(({ enrollmentId }) => enrollmentId);
    const rosterIds = existingRosterIds || (await getRoster(tx, termId, classGroupId, schoolId)).map(({ id }) => id);
    const expectedIds = new Set(rosterIds);
    const submittedIds = new Set(records.map(({ enrollmentId }) => enrollmentId));
    if (expectedIds.size !== submittedIds.size || [...expectedIds].some((id) => !submittedIds.has(id))) {
      throw httpError(400, 'ATTENDANCE_ROSTER_MISMATCH', 'Submit a mark for every active student currently enrolled in this class.');
    }
    const session = await tx.attendanceSession.upsert({
      where: { classGroupId_termId_date: { classGroupId, termId, date: day } },
      create: { classGroupId, termId, date: day, takenById: user.id, schoolId },
      update: { takenById: user.id },
      select: { id: true }
    });
    await tx.attendanceRecord.deleteMany({ where: { attendanceSessionId: session.id } });
    await tx.attendanceRecord.createMany({
      data: records.map((record) => ({
        attendanceSessionId: session.id,
        enrollmentId: record.enrollmentId,
        status: record.status,
        note: record.note || null
      }))
    });
    await tx.auditLog.create({ data: {
      actorId: user.id,
      action: 'CLASS_ATTENDANCE_RECORDED',
      entityType: 'AttendanceSession',
      entityId: session.id,
      newValues: { classGroupId, termId, date, marked: records.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 500),
      schoolId
    } });
    return { id: session.id, date, marked: records.length };
  });
}

export async function resolveAttendanceQr({ termId, classGroupId, code }, user, schoolId) {
  const term = await loadTerm(termId, schoolId);
  const group = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { id: true } });
  if (!group) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  if (!ADMIN_ROLES.includes(user.role)) await requireCurrentFormTutor(prisma, classGroupId, term.academicYearId, user.id, schoolId);
  const enrollment = await prisma.enrollment.findFirst({
    where: { termId, classGroupId, schoolId, status: 'ACTIVE', student: { admissionNumber: code, status: 'ACTIVE' } },
    select: { id: true, student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } } }
  });
  if (!enrollment) throw httpError(404, 'QR_STUDENT_NOT_IN_CLASS', 'This QR code does not belong to an active student in the selected class.');
  return { enrollmentId: enrollment.id, student: enrollment.student };
}

export async function getAttendanceReport({ termId, classGroupId, studentId }, schoolId) {
  const term = await loadTerm(termId, schoolId);
  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId, termId, status: 'ACTIVE',
      ...(classGroupId ? { classGroupId } : {}),
      ...(studentId ? { studentId } : {})
    },
    include: {
      student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } },
      classLevel: { select: { name: true } },
      classGroup: { select: { name: true } },
      attendanceRecords: {
        where: { attendanceSession: { termId, schoolId } },
        select: { status: true }
      }
    },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }]
  });
  if (classGroupId) {
    const group = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { id: true } });
    if (!group) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  }
  if (studentId && !enrollments.length) {
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
    if (!student) throw httpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  }
  const classGroups = await prisma.classGroup.findMany({
    where: { schoolId },
    include: { classLevel: { select: { name: true } } },
    orderBy: [{ classLevel: { levelOrder: 'asc' } }, { name: 'asc' }]
  });
  return {
    term: { id: term.id, name: term.name, academicYear: term.academicYear.name },
    classGroups: classGroups.map((group) => ({ id: group.id, name: group.name, classLevel: group.classLevel.name })),
    rows: enrollments.map((enrollment) => {
      const present = enrollment.attendanceRecords.filter(({ status }) => status === 'PRESENT' || status === 'LATE').length;
      const absent = enrollment.attendanceRecords.filter(({ status }) => status === 'ABSENT').length;
      const total = present + absent;
      return {
        studentId: enrollment.student.id,
        studentName: [enrollment.student.firstName, enrollment.student.middleName, enrollment.student.lastName].filter(Boolean).join(' '),
        admissionNumber: enrollment.student.admissionNumber,
        classLevel: enrollment.classLevel.name,
        classGroup: enrollment.classGroup?.name ?? '',
        term: term.name,
        academicYear: term.academicYear.name,
        totalDaysPresent: present,
        totalDaysAbsent: absent,
        percentageAttendance: total ? Math.round((present / total) * 10000) / 100 : 0
      };
    })
  };
}
