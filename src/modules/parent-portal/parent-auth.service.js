import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { sendEmail } from '../../lib/mailer.js';
import { sendTextBeeSms } from '../../lib/textbee.js';
import { normalizeParentIdentifier } from './contact.js';

const otpLifetimeMs = env.PARENT_PORTAL_OTP_TTL_MINUTES * 60_000;
const maxOtpAttempts = 5;

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function identifierDigest(identifier) {
  return createHmac('sha256', env.JWT_SECRET).update(identifier).digest('hex');
}

function otpDigest(challengeId, code) {
  return createHmac('sha256', env.JWT_SECRET).update(`${challengeId}:${code}`).digest('hex');
}

function digestMatches(expected, actual) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function parentContactWhere(identifier) {
  return identifier.type === 'email'
    ? { email: { equals: identifier.value, mode: 'insensitive' } }
    : { phone: { in: identifier.variants } };
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

async function deliverVerification({ identifier, code }) {
  const message = `${env.APP_NAME}: your parent portal verification code is ${code}. It expires in ${env.PARENT_PORTAL_OTP_TTL_MINUTES} minutes. Do not share this code.`;
  if (identifier.type === 'phone') {
    await sendTextBeeSms({ to: identifier.value, message });
    return;
  }

  const safeMessage = escapeHtml(message);
  await sendEmail({
    to: identifier.value,
    subject: `${env.APP_NAME} parent portal verification`,
    text: message,
    html: `<p>${safeMessage}</p>`,
  });
}

export async function requestParentPortalVerification(rawIdentifier) {
  const identifier = normalizeParentIdentifier(rawIdentifier);
  if (!identifier) {
    throw httpError(400, 'INVALID_PARENT_CONTACT', 'Enter a valid email address or phone number.');
  }

  const challengeId = randomUUID();
  await prisma.parentPortalVerification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const matchingParents = await prisma.parent.findMany({
    where: parentContactWhere(identifier),
    select: { id: true, userId: true, schoolId: true },
  });
  const matchingSchoolIds = new Set(matchingParents.map(({ schoolId }) => schoolId));
  const canRegister = matchingParents.length > 0
    && matchingSchoolIds.size === 1
    && matchingParents.every(({ userId }) => !userId);
  if (!canRegister) {
    return {
      challengeId,
      message: 'If this contact is linked to a student and eligible for setup, a verification code has been sent.',
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.parentPortalVerification.create({
    data: {
      id: challengeId,
      identifierHash: identifierDigest(identifier.value),
      codeHash: otpDigest(challengeId, code),
      expiresAt: new Date(Date.now() + otpLifetimeMs),
    },
  });

  try {
    await deliverVerification({ identifier, code });
  } catch (error) {
    await prisma.parentPortalVerification.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    console.error('Parent portal verification delivery failed:', error.message);
    throw httpError(
      503,
      'PARENT_VERIFICATION_UNAVAILABLE',
      'The verification code could not be sent. Please try again later or contact the school.',
    );
  }

  return {
    challengeId,
    message: 'If this contact is linked to a student and eligible for setup, a verification code has been sent.',
  };
}

export async function createParentPortalAccount({ challengeId, identifier: rawIdentifier, code, password }) {
  const identifier = normalizeParentIdentifier(rawIdentifier);
  if (!identifier) throw httpError(400, 'INVALID_PARENT_CONTACT', 'Enter a valid email address or phone number.');

  const challenge = await prisma.parentPortalVerification.findUnique({
    where: { id: challengeId },
  });
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= new Date() ||
    challenge.attempts >= maxOtpAttempts ||
    !digestMatches(challenge.identifierHash, identifierDigest(identifier.value))
  ) {
    throw httpError(400, 'INVALID_PARENT_VERIFICATION', 'The verification code is invalid or expired. Request a new code.');
  }

  if (!digestMatches(challenge.codeHash, otpDigest(challengeId, code))) {
    await prisma.parentPortalVerification.updateMany({
      where: { id: challengeId, consumedAt: null, attempts: { lt: maxOtpAttempts } },
      data: { attempts: { increment: 1 } },
    });
    throw httpError(400, 'INVALID_PARENT_VERIFICATION', 'The verification code is invalid or expired. Request a new code.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    return await prisma.$transaction(async (tx) => {
      const lockedChallenge = await tx.parentPortalVerification.findUnique({
        where: { id: challengeId },
      });
      if (
        !lockedChallenge ||
        lockedChallenge.consumedAt ||
        lockedChallenge.expiresAt <= new Date() ||
        lockedChallenge.attempts >= maxOtpAttempts ||
        !digestMatches(lockedChallenge.identifierHash, identifierDigest(identifier.value)) ||
        !digestMatches(lockedChallenge.codeHash, otpDigest(challengeId, code))
      ) {
        throw httpError(400, 'INVALID_PARENT_VERIFICATION', 'The verification code is invalid or expired. Request a new code.');
      }

      const parents = await tx.parent.findMany({
        where: parentContactWhere(identifier),
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          userId: true,
          schoolId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
      if (!parents.length) {
        throw httpError(400, 'PARENT_CONTACT_NOT_LINKED', 'This contact is not available for parent portal setup. Contact the school.');
      }
      if (parents.some(({ userId }) => userId)) {
        throw httpError(409, 'PARENT_ACCOUNT_EXISTS', 'An account already uses this contact. Sign in or contact the school for help.');
      }

      const schoolIds = [...new Set(parents.map(({ schoolId }) => schoolId))];
      if (schoolIds.length !== 1) {
        throw httpError(409, 'PARENT_CONTACT_AMBIGUOUS', 'This contact is linked in multiple schools. Contact the school to set up portal access.');
      }

      const schoolId = schoolIds[0];
      const schoolParents = parents.filter((parent) => parent.schoolId === schoolId);
      let email = identifier.type === 'email' ? identifier.value : schoolParents.find(({ email: value }) => value)?.email ?? null;
      if (email) {
        const existingEmail = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (existingEmail && identifier.type === 'email') {
          throw httpError(409, 'PARENT_ACCOUNT_EXISTS', 'An account already uses this email. Sign in or contact the school for help.');
        }
        if (existingEmail) email = null;
      }

      const account = await tx.user.create({
        data: {
          email,
          firstName: schoolParents[0].firstName || 'Parent',
          lastName: schoolParents[0].lastName || 'Guardian',
          passwordHash,
          role: 'PARENT',
          status: 'ACTIVE',
          schoolId,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          schoolId: true,
          school: { select: { id: true, name: true, slug: true } },
        },
      });

      const linkedParents = await tx.parent.updateMany({
        where: {
          ...parentContactWhere(identifier),
          schoolId,
          userId: null,
        },
        data: { userId: account.id },
      });
      if (linkedParents.count !== schoolParents.length) {
        throw httpError(409, 'PARENT_ACCOUNT_EXISTS', 'This contact has already been linked to a parent portal account. Sign in or contact the school for help.');
      }
      await tx.parentPortalVerification.update({
        where: { id: challengeId },
        data: { consumedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: account.id,
          action: 'PARENT_PORTAL_ACCOUNT_CREATED',
          entityType: 'User',
          entityId: account.id,
          schoolId,
          newValues: { role: 'PARENT', identifierType: identifier.type },
        },
      });

      const accessToken = jwt.sign(
        { sub: account.id },
        env.JWT_SECRET,
        {
          expiresIn: env.JWT_EXPIRES_IN,
          issuer: 'school-reporting-api',
          audience: 'school-reporting-client',
        },
      );

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: env.JWT_EXPIRES_IN,
        user: account,
      };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(409, 'PARENT_ACCOUNT_EXISTS', 'An account already uses this contact. Sign in or contact the school for help.');
    }
    throw error;
  }
}
