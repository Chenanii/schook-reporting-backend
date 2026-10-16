import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

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
    school: user.school ? { id: user.school.id, name: user.school.name } : null
  };
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { school: { select: { id: true, name: true } } }
  });

  // Use the same error for an unknown email and a wrong password.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
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
    include: { school: { select: { id: true, name: true } } }
  });

  if (!user || user.status !== 'ACTIVE') {
    throw httpError(401, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
  }

  return publicUser(user);
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
