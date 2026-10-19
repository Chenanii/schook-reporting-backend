import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function listFormTutorAssignments(academicYearId, schoolId) {
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true } });
  if (!year) throw httpError(404, 'ACADEMIC_YEAR_NOT_FOUND', 'Academic year not found.');

  return prisma.classGroup.findMany({
    where: { schoolId },
    include: {
      classLevel: { select: { id: true, name: true, levelOrder: true } },
      formTutorAssignments: {
        where: { academicYearId, schoolId },
        include: { teacher: { select: { id: true, firstName: true, lastName: true, staffNumber: true, userId: true } } }
      }
    },
    orderBy: [{ classLevel: { levelOrder: 'asc' } }, { name: 'asc' }]
  });
}

export async function saveFormTutorAssignment(data, actorId, req, schoolId) {
  const [group, year] = await Promise.all([
    prisma.classGroup.findFirst({ where: { id: data.classGroupId, schoolId }, select: { id: true } }),
    prisma.academicYear.findFirst({ where: { id: data.academicYearId, schoolId }, select: { id: true } })
  ]);
  if (!group) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  if (!year) throw httpError(404, 'ACADEMIC_YEAR_NOT_FOUND', 'Academic year not found.');

  let teacher = null;
  if (data.teacherId) {
    teacher = await prisma.teacher.findFirst({
      where: { id: data.teacherId, schoolId },
      select: { id: true, userId: true, user: { select: { role: true, status: true } } }
    });
    if (!teacher) throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher not found.');
    if (!teacher.userId || !teacher.user || !['TEACHER', 'FORM_TUTOR'].includes(teacher.user.role) || teacher.user.status !== 'ACTIVE') {
      throw httpError(409, 'TEACHER_ACCOUNT_REQUIRED', 'Only teachers with an active teacher account can be assigned as a form tutor.');
    }
  }

  return prisma.$transaction(async (tx) => {
    const where = { classGroupId_academicYearId: { classGroupId: group.id, academicYearId: year.id } };
    const existing = await tx.formTutorAssignment.findUnique({ where, include: { teacher: { select: { id: true, firstName: true, lastName: true } } } });

    if (!teacher) {
      if (!existing) return { removed: false };
      await tx.formTutorAssignment.delete({ where: { id: existing.id } });
      await tx.auditLog.create({ data: {
        actorId, action: 'FORM_TUTOR_UNASSIGNED', entityType: 'FormTutorAssignment', entityId: existing.id,
        oldValues: { teacherId: existing.teacherId, classGroupId: group.id, academicYearId: year.id },
        newValues: { removed: true, classGroupId: group.id, academicYearId: year.id }, ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 500), schoolId
      } });
      return { removed: true };
    }

    const assignment = existing
      ? await tx.formTutorAssignment.update({ where: { id: existing.id }, data: { teacherId: teacher.id }, include: { teacher: { select: { id: true, firstName: true, lastName: true, staffNumber: true, userId: true } } } })
      : await tx.formTutorAssignment.create({ data: { teacherId: teacher.id, classGroupId: group.id, academicYearId: year.id, schoolId }, include: { teacher: { select: { id: true, firstName: true, lastName: true, staffNumber: true, userId: true } } } });

    await tx.auditLog.create({ data: {
      actorId,
      action: existing ? 'FORM_TUTOR_REASSIGNED' : 'FORM_TUTOR_ASSIGNED',
      entityType: 'FormTutorAssignment',
      entityId: assignment.id,
      oldValues: existing ? { teacherId: existing.teacherId, classGroupId: group.id, academicYearId: year.id } : undefined,
      newValues: { teacherId: assignment.teacherId, classGroupId: group.id, academicYearId: year.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 500),
      schoolId
    } });
    return assignment;
  });
}
