import { prisma } from '../../lib/prisma.js';

function auditData(actorId, action, scale, req) {
  return {
    actorId,
    action,
    entityType: 'GradeScale',
    entityId: scale.id,
    newValues: {
      name: scale.name,
      boundaries: scale.boundaries.map((item) => ({
        grade: item.grade,
        minPercent: item.minPercent.toString(),
        description: item.description,
      })),
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
  };
}

function withDisplayScores(scale) {
  return {
    ...scale,
    boundaries: scale.boundaries.map((boundary) => ({
      ...boundary,
      minScore: Number(boundary.minPercent) * scale.maxScore / 100,
    })),
  };
}

export async function listGradeScales() {
  const scales = await prisma.gradeScale.findMany({
    include: { boundaries: { orderBy: { minPercent: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  return scales.map(withDisplayScores);
}

export async function createGradeScale(data, actorId, req) {
  return prisma.$transaction(async (tx) => {
    const scale = await tx.gradeScale.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        maxScore: data.maxScore,
        boundaries: {
          create: data.boundaries.map((boundary) => ({
            grade: boundary.grade,
            minPercent: boundary.minScore * 100 / data.maxScore,
            description: boundary.description ?? null,
          })),
        },
      },
      include: { boundaries: { orderBy: { minPercent: 'asc' } } },
    });
    await tx.auditLog.create({ data: auditData(actorId, 'GRADE_SCALE_CREATED', scale, req) });
    return withDisplayScores(scale);
  }).catch((error) => {
    if (error.code === 'P2002') {
      const duplicate = new Error('A grade scale with this name or boundary already exists.');
      duplicate.statusCode = 409;
      duplicate.code = 'GRADE_SCALE_ALREADY_EXISTS';
      throw duplicate;
    }
    throw error;
  });
}
