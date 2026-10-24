import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { normalizeParentIdentifier } from '../parent-portal/contact.js';
import { sendEmail } from '../../lib/mailer.js';

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
    schoolId: user.schoolId ?? null,
    school: user.school ? { id: user.school.id, name: user.school.name, slug: user.school.slug } : null
  };
}

export async function login({ identifier, password }) {
  const normalized = normalizeParentIdentifier(identifier);
  let user = null;
  if (normalized?.type === 'email') {
    user = await prisma.user.findUnique({
      where: { email: normalized.value },
      include: { school: { select: { id: true, name: true, slug: true } } }
    });
  } else if (normalized?.type === 'phone') {
    const matchingUsers = await prisma.user.findMany({
      where: {
        role: 'PARENT',
        parents: { some: { phone: { in: normalized.variants } } }
      },
      include: { school: { select: { id: true, name: true, slug: true } } },
      take: 2
    });
    if (matchingUsers.length === 1) [user] = matchingUsers;
  }

  // Keep unknown identifiers and incorrect passwords indistinguishable.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email/phone number or password.');
  }

  if (user.status !== 'ACTIVE') {
    throw httpError(403, 'ACCOUNT_INACTIVE', 'This account is not active.');
  }

  const accessToken = jwt.sign(
    { sub: user.id },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: 'school-reporting-api',
      audience: 'school-reporting-client'
    }
  );

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_EXPIRES_IN,
    user: publicUser(user)
  };
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { school: { select: { id: true, name: true, slug: true } } }
  });

  if (!user || user.status !== 'ACTIVE') {
    throw httpError(401, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
  }

  return publicUser(user);
}

function validateSignatureDataUrl(value) {
  if (value == null) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw httpError(400, 'INVALID_SIGNATURE_IMAGE', 'Upload a PNG, JPEG, or WebP signature image.');
  const [, type, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 500 * 1024) throw httpError(413, 'SIGNATURE_IMAGE_TOO_LARGE', 'The signature image must be 500 KB or smaller.');
  if (bytes.toString('base64') !== encoded) throw httpError(400, 'INVALID_SIGNATURE_IMAGE', 'The signature image is not valid base64 data.');

  const validImage = type === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === 'jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!validImage) throw httpError(400, 'INVALID_SIGNATURE_IMAGE', 'The uploaded file does not match its image type.');
  return value;
}

export async function getUserProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { teacher: { select: { staffNumber: true } } }
  });
  if (!user || user.status !== 'ACTIVE') throw httpError(401, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
  return { ...publicUser(user), signatureDataUrl: user.signatureDataUrl, staffNumber: user.teacher?.staffNumber || null };
}

export async function updateUserProfile(userId, data, req) {
  const signatureDataUrl = validateSignatureDataUrl(data.signatureDataUrl);
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId },
        include: { teacher: { select: { id: true } }, parents: { select: { id: true } } }
      });
      if (!current || current.status !== 'ACTIVE') throw httpError(401, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
      if (current.teacher && !data.email) throw httpError(400, 'TEACHER_EMAIL_REQUIRED', 'A teacher account must have an email address.');
      if (current.role === 'PARENT' && data.email?.toLowerCase() !== current.email?.toLowerCase()) {
        throw httpError(400, 'PARENT_EMAIL_UPDATE_UNAVAILABLE', 'Parent email changes must be verified through parent account setup.');
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          signatureDataUrl
        },
        include: { teacher: { select: { staffNumber: true } } }
      });
      if (current.teacher) {
        await tx.teacher.updateMany({ where: { userId }, data: { firstName: data.firstName, lastName: data.lastName, email: data.email } });
      }
      if (current.parents.length) {
        await tx.parent.updateMany({ where: { userId }, data: { firstName: data.firstName, lastName: data.lastName } });
      }
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'USER_PROFILE_UPDATED',
          entityType: 'User',
          entityId: userId,
          oldValues: { firstName: current.firstName, lastName: current.lastName, email: current.email, hasSignature: Boolean(current.signatureDataUrl) },
          newValues: { firstName: updated.firstName, lastName: updated.lastName, email: updated.email, hasSignature: Boolean(updated.signatureDataUrl) },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 500),
          schoolId: req.schoolId || null
        }
      });
      return { ...publicUser(updated), signatureDataUrl: updated.signatureDataUrl, staffNumber: updated.teacher?.staffNumber || null };
    });
  } catch (error) {
    if (error.code === 'P2002') throw httpError(409, 'DUPLICATE_VALUE', 'That email address is already in use.');
    throw error;
  }
}

export async function changePassword({
  userId,
  currentPassword,
  newPassword
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || user.status !== 'ACTIVE') {
    throw httpError(401, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!matches) {
    throw httpError(
      400,
      'CURRENT_PASSWORD_INCORRECT',
      'Your current password is incorrect.'
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  return { message: 'Password changed successfully.' };
}

const passwordResetMessage = 'If an active account uses that email, password reset instructions will be sent shortly.';

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requestPasswordReset(email) {
  const user = await prisma.user.findFirst({
    where: { email, status: 'ACTIVE' },
    select: { id: true, email: true }
  });
  if (!user) return { message: passwordResetMessage };

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt } });

  const resetUrl = new URL(env.PASSWORD_RESET_BASE_URL);
  resetUrl.searchParams.set('token', token);
  try {
    await sendEmail({
      to: user.email,
      subject: `Reset your ${env.APP_NAME} password`,
      text: `Use this link within one hour to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link within one hour to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
    });
    return { message: passwordResetMessage };
  } catch {
    console.error('Password reset email could not be sent.');
    if (env.NODE_ENV === 'development') return { message: passwordResetMessage, resetUrl: resetUrl.toString() };
    return { message: passwordResetMessage };
  }
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = hashResetToken(token);
  const reset = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() }, user: { is: { status: { in: ['ACTIVE', 'INACTIVE'] } } } },
    select: { id: true, userId: true, user: { select: { status: true } } }
  });
  if (!reset) throw httpError(400, 'PASSWORD_RESET_LINK_INVALID', 'This password reset link is invalid or has expired. Request a new one.');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });
  if (claimed.count !== 1) throw httpError(400, 'PASSWORD_RESET_LINK_INVALID', 'This password reset link is invalid or has expired. Request a new one.');
  await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash, status: 'ACTIVE' } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
  return {
    message: reset.user.status === 'INACTIVE'
      ? 'Your account is active. You can now sign in with your new password.'
      : 'Your password has been reset. You can now sign in with your new password.'
  };
}
