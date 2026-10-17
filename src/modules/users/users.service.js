
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';

const staffRoles = [
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'ACADEMIC_ADMIN',
  'EXAMS_OFFICER',
  'TEACHER',
  'FORM_TUTOR'
];
const manageableRoles = [...staffRoles, 'PARENT'];

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    teacher: user.teacher
      ? { id: user.teacher.id, staffNumber: user.teacher.staffNumber }
      : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function audit(actorId, action, entityId, oldValues, newValues, req) {
  return prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType: 'User',
      entityId,
      oldValues: oldValues ?? undefined,
      newValues: newValues ?? undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 500)
    }
  });
}

export async function createStaff(data, actorId, req) {
  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          passwordHash,
          role: data.role,
          status: 'ACTIVE',
          ...(data.role === 'TEACHER' || data.role === 'FORM_TUTOR'
            ? {
                teacher: {
                  create: { staffNumber: data.staffNumber ?? null }
                }
              }
            : {})
        },
        include: { teacher: true }
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'STAFF_CREATED',
          entityType: 'User',
          entityId: created.id,
          newValues: {
            email: created.email,
            firstName: created.firstName,
            lastName: created.lastName,
            role: created.role,
            status: created.status
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500)
        }
      });

      return created;
    });

    return publicUser(user);
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_VALUE',
        'The email address or staff number is already in use.'
      );
    }
    throw error;
  }
}

export async function listStaff(filters) {
  const { page, limit, search, role, status } = filters;

  const where = {
    role: { in: manageableRoles },
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { teacher: { is: { staffNumber: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: { teacher: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.user.count({ where })
  ]);

  return {
    data: users.map(publicUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getStaffById(id) {
  const user = await prisma.user.findFirst({
    where: { id, role: { in: manageableRoles } },
    include: { teacher: true }
  });

  if (!user) {
    throw httpError(404, 'STAFF_NOT_FOUND', 'Staff account not found.');
  }

  return publicUser(user);
}

export async function updateStaff(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id },
        include: { teacher: true }
      });

      if (!current || !manageableRoles.includes(current.role)) {
        throw httpError(404, 'STAFF_NOT_FOUND', 'Staff account not found.');
      }

      if (id === actorId && data.status === 'INACTIVE') {
        throw httpError(
          400,
          'SELF_DEACTIVATION',
          'You cannot deactivate your own account.'
        );
      }

      // Do not allow removal or deactivation of the last active super admin.
      // Super admins cannot be targeted by this staff endpoint.
      const nextRole = data.role ?? current.role;
      if (nextRole === 'PARENT' && current.role !== 'PARENT') {
        throw httpError(400, 'PARENT_VERIFICATION_REQUIRED', 'Parents must create their account using a verified email address or phone number linked to a student.');
      }
      if (current.role === 'PARENT' && data.email !== undefined && data.email.toLowerCase() !== current.email?.toLowerCase()) {
        throw httpError(400, 'PARENT_EMAIL_UPDATE_UNAVAILABLE', 'Parent email changes must be verified through parent account setup.');
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.status !== undefined ? { status: data.status } : {})
        },
        include: { teacher: true }
      });

      if (current.role === 'PARENT' && (data.firstName !== undefined || data.lastName !== undefined)) {
        await tx.parent.updateMany({
          where: { userId: id },
          data: {
            ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
            ...(data.lastName !== undefined ? { lastName: data.lastName } : {})
          }
        });
      }
      if (current.role === 'PARENT' && nextRole !== 'PARENT') {
        await tx.parent.updateMany({
          where: { userId: id },
          data: { userId: null }
        });
      }

      const teacherRole = nextRole === 'TEACHER' || nextRole === 'FORM_TUTOR';

      if (teacherRole && !updated.teacher) {
        await tx.teacher.create({
          data: {
            userId: id,
            staffNumber: data.staffNumber ?? null
          }
        });
      } else if (updated.teacher && data.staffNumber !== undefined) {
        await tx.teacher.update({
          where: { userId: id },
          data: { staffNumber: data.staffNumber }
        });
      }

      // Refresh the profile after any teacher-profile changes.
      const result = await tx.user.findUnique({
        where: { id },
        include: { teacher: true }
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: current.role === 'PARENT' ? 'PARENT_ACCOUNT_UPDATED' : 'STAFF_UPDATED',
          entityType: 'User',
          entityId: id,
          oldValues: {
            email: current.email,
            firstName: current.firstName,
            lastName: current.lastName,
            role: current.role,
            status: current.status,
            staffNumber: current.teacher?.staffNumber ?? null
          },
          newValues: {
            email: result.email,
            firstName: result.firstName,
            lastName: result.lastName,
            role: result.role,
            status: result.status,
            staffNumber: result.teacher?.staffNumber ?? null
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500)
        }
      });

      return publicUser(result);
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_VALUE',
        'The email address or staff number is already in use.'
      );
    }
    throw error;
  }
}
