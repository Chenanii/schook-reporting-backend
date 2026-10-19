import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requireSchoolId(schoolId) {
  if (!schoolId) {
    throw httpError(
      400,
      'SCHOOL_CONTEXT_REQUIRED',
      'Select a school before accessing its theme.'
    );
  }
}

export async function getSchoolTheme(schoolId) {
  requireSchoolId(schoolId);

  return prisma.schoolTheme.upsert({
    where: { schoolId },
    create: { schoolId },
    update: {}
  });
}

export async function updateSchoolTheme(schoolId, data, actor, request) {
  requireSchoolId(schoolId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.schoolTheme.findUnique({
      where: { schoolId }
    });

    const oldValues = existing
      ? Object.fromEntries(
          Object.keys(data).map((key) => [key, existing[key]])
        )
      : null;

    const theme = await tx.schoolTheme.upsert({
      where: { schoolId },
      create: {
        schoolId,
        ...data
      },
      update: data
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        schoolId,
        action: 'SCHOOL_THEME_UPDATED',
        entityType: 'SchoolTheme',
        entityId: theme.id,
        ...(oldValues !== null ? { oldValues } : {}),        newValues: Object.fromEntries(
          Object.keys(data).map((key) => [key, theme[key]])
        ),
        ipAddress: request.ip,
        userAgent: request.get('user-agent')?.slice(0, 500)
      }
    });

    return theme;
  });
}