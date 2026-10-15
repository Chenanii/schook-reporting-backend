
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../../lib/mailer.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function auditData(actorId, action, entityId, oldValues, newValues, req) {
  return {
    actorId: actorId ?? undefined,
    action,
    entityType: 'Teacher',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')?.slice(0, 500),
  };
}

const teacherInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
    },
  },
  _count: { select: { assignments: true } },
  invitations: {
    select: {
      id: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
};

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeInvitation() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + env.TEACHER_INVITATION_TTL_HOURS * 60 * 60 * 1000
  );

  return { token, tokenHash: hashToken(token), expiresAt };
}

function invitationUrl(token) {
  const url = new URL(env.TEACHER_INVITATION_BASE_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function emailInvitation(teacher, token) {
  const url = invitationUrl(token);
  const name = `${teacher.firstName} ${teacher.lastName}`;
  const safeName = escapeHtml(name);
  const safeAppName = escapeHtml(env.APP_NAME);
  const expiry = env.TEACHER_INVITATION_TTL_HOURS;

  await sendEmail({
    to: teacher.email,
    subject: `${env.APP_NAME} - Set up your teacher account`,
    text:
      `Hello ${name},\n\n` +
      `You have been invited to create your teacher account for ${env.APP_NAME}.\n\n` +
      `Use this link to set your password: ${url}\n\n` +
      `This link expires in ${expiry} hours and can only be used once.\n` +
      `If you were not expecting this invitation, please contact your school administrator.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6">
        <h2>${safeAppName}</h2>
        <p>Hello ${safeName},</p>
        <p>You have been invited to create your teacher account.</p>
        <p>
          <a href="${escapeHtml(url)}"
             style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:5px">
            Set up your account
          </a>
        </p>
        <p>This link expires in ${expiry} hours and can only be used once.</p>
        <p>If you were not expecting this invitation, contact your school administrator.</p>
      </div>
    `,
  });
}

async function createInvitationForTeacher(teacherId, actorId, req) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: { select: { id: true } } },
  });

  if (!teacher) {
    throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher record not found.');
  }

  if (teacher.userId || teacher.user) {
    throw httpError(
      409,
      'TEACHER_ALREADY_ACTIVATED',
      'This teacher already has an account.'
    );
  }

  const invitation = makeInvitation();

  await prisma.$transaction(async (tx) => {
    await tx.teacherInvitation.updateMany({
      where: {
        teacherId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    await tx.teacherInvitation.create({
      data: {
        teacherId,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
        createdById: actorId ?? null,
      },
    });

    await tx.auditLog.create({
      data: auditData(
        actorId,
        'TEACHER_INVITATION_CREATED',
        teacherId,
        null,
        { email: teacher.email, expiresAt: invitation.expiresAt },
        req
      ),
    });
  });

  try {
    await emailInvitation(teacher, invitation.token);
    return { sent: true };
  } catch (error) {
    // Never leave an invitation active when email delivery failed.
    await prisma.teacherInvitation.updateMany({
      where: {
        tokenHash: invitation.tokenHash,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    console.error('Teacher invitation email delivery failed:', error.message);
    return { sent: false };
  }
}

export async function createTeacher(data, actorId, req) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existingUser) {
    throw httpError(
      409,
      'EMAIL_ALREADY_IN_USE',
      'This email address already belongs to a user account.'
    );
  }

  try {
    const teacher = await prisma.$transaction(async (tx) => {
      const created = await tx.teacher.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          staffNumber: data.staffNumber ?? null,
        },
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TEACHER_CREATED',
          created.id,
          null,
          {
            firstName: created.firstName,
            lastName: created.lastName,
            email: created.email,
            staffNumber: created.staffNumber,
          },
          req
        ),
      });

      return created;
    });

    const invitation = await createInvitationForTeacher(teacher.id, actorId, req);

    const result = await prisma.teacher.findUnique({
      where: { id: teacher.id },
      include: teacherInclude,
    });

    return {
      teacher: result,
      invitationEmailSent: invitation.sent,
    };
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_TEACHER',
        'A teacher with that email address or staff number already exists.'
      );
    }
    throw error;
  }
}

export async function listTeachers(filters) {
  const { search, status, page, limit } = filters;

  const where = {
    ...(status ? { user: { is: { status } } } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { staffNumber: { contains: search, mode: 'insensitive' } },
            {
              user: {
                is: {
                  email: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.teacher.findMany({
      where,
      include: teacherInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.teacher.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTeacherById(id) {
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: teacherInclude,
  });

  if (!teacher) {
    throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher record not found.');
  }

  return teacher;
}

export async function updateTeacher(id, data, actorId, req) {
  const existing = await prisma.teacher.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!existing) {
    throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher record not found.');
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.teacher.update({
        where: { id },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.staffNumber !== undefined ? { staffNumber: data.staffNumber } : {}),
        },
      });

      if (existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
            ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          },
        });
      }

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TEACHER_UPDATED',
          id,
          {
            firstName: existing.firstName,
            lastName: existing.lastName,
            staffNumber: existing.staffNumber,
          },
          data,
          req
        ),
      });
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_STAFF_NUMBER',
        'That staff number is already assigned to another teacher.'
      );
    }
    throw error;
  }

  return getTeacherById(id);
}

export async function resendTeacherInvitation(id, actorId, req) {
  const result = await createInvitationForTeacher(id, actorId, req);
  return { invitationEmailSent: result.sent };
}

export async function revokeTeacherInvitation(id, actorId, req) {
  const teacher = await prisma.teacher.findUnique({ where: { id } });

  if (!teacher) {
    throw httpError(404, 'TEACHER_NOT_FOUND', 'Teacher record not found.');
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const revoked = await tx.teacherInvitation.updateMany({
      where: {
        teacherId: id,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    await tx.auditLog.create({
      data: auditData(
        actorId,
        'TEACHER_INVITATION_REVOKED',
        id,
        null,
        { revokedCount: revoked.count },
        req
      ),
    });

    return revoked.count;
  });

  return { revokedCount: result };
}

export async function acceptTeacherInvitation({ token, password }, req) {
  const tokenHash = hashToken(token);
  const invitation = await prisma.teacherInvitation.findUnique({
    where: { tokenHash },
    include: { teacher: true },
  });

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date()
  ) {
    throw httpError(
      400,
      'INVALID_OR_EXPIRED_INVITATION',
      'This invitation is invalid, expired, revoked or already used. Ask your administrator for a new invitation.'
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      // Conditional update prevents a second request from reusing the token.
      const claimed = await tx.teacherInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });

      if (claimed.count !== 1) {
        throw httpError(
          400,
          'INVALID_OR_EXPIRED_INVITATION',
          'This invitation is no longer valid. Ask your administrator for a new invitation.'
        );
      }

      const teacher = await tx.teacher.findUnique({
        where: { id: invitation.teacherId },
      });

      if (!teacher || teacher.userId) {
        throw httpError(
          409,
          'TEACHER_ALREADY_ACTIVATED',
          'This teacher already has an account or the teacher record no longer exists.'
        );
      }

      const user = await tx.user.create({
        data: {
          email: teacher.email,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          passwordHash,
          role: 'TEACHER',
          status: 'ACTIVE',
        },
      });

      await tx.teacher.update({
        where: { id: teacher.id },
        data: { userId: user.id },
      });

      await tx.auditLog.create({
        data: auditData(
          user.id,
          'TEACHER_INVITATION_ACCEPTED',
          teacher.id,
          null,
          { email: teacher.email },
          req
        ),
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      };
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'ACCOUNT_ALREADY_EXISTS',
        'An account already exists for this email address. Contact your administrator.'
      );
    }
    throw error;
  }
}
