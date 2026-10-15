import { prisma } from '../../lib/prisma.js';

const protectedStatuses = ['FINALIZED', 'PUBLISHED', 'CLOSED'];

const allowedTransitions = {
  DRAFT: ['OPEN'],
  OPEN: ['MARKS_REVIEW'],
  MARKS_REVIEW: ['OPEN', 'FINALIZED'],
  FINALIZED: ['PUBLISHED'],
  PUBLISHED: ['CLOSED'],
  CLOSED: []
};

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value) {
  return value.toISOString().slice(0, 10);
}

function auditData(actorId, action, entityId, oldValues, newValues, req) {
  return {
    actorId,
    action,
    entityType: 'Term',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

function termSnapshot(term) {
  return {
    name: term.name,
    sequence: term.sequence,
    academicYearId: term.academicYearId,
    startDate: dateString(term.startDate),
    endDate: dateString(term.endDate),
    annualWeightPercent:
      term.annualWeightPercent == null
        ? null
        : Number(term.annualWeightPercent),
    status: term.status
  };
}

async function getAcademicYearOrThrow(tx, academicYearId) {
  const year = await tx.academicYear.findUnique({
    where: { id: academicYearId }
  });

  if (!year) {
    throw httpError(
      404,
      'ACADEMIC_YEAR_NOT_FOUND',
      'The selected academic year does not exist.'
    );
  }

  return year;
}

function ensureDatesWithinYear(startDate, endDate, year) {
  const start = toDate(startDate);
  const end = toDate(endDate);

  if (
    start < year.startDate ||
    end > year.endDate
  ) {
    throw httpError(
      400,
      'TERM_OUTSIDE_ACADEMIC_YEAR',
      'The term dates must fall within the selected academic year.'
    );
  }
}

async function ensureNoOverlap(
  tx,
  academicYearId,
  startDate,
  endDate,
  excludeTermId
) {
  const overlap = await tx.term.findFirst({
    where: {
      academicYearId,
      ...(excludeTermId ? { id: { not: excludeTermId } } : {}),
      startDate: { lte: toDate(endDate) },
      endDate: { gte: toDate(startDate) }
    },
    select: {
      id: true,
      name: true,
      sequence: true
    }
  });

  if (overlap) {
    throw httpError(
      409,
      'TERM_DATE_OVERLAP',
      `The selected dates overlap with ${overlap.name}.`
    );
  }
}

function mapDatabaseError(error) {
  if (error.code === 'P2002') {
    return httpError(
      409,
      'DUPLICATE_TERM',
      'A term with this name or sequence already exists in this academic year.'
    );
  }

  if (error.code === 'P2003') {
    return httpError(
      400,
      'INVALID_REFERENCE',
      'The selected academic year reference is invalid.'
    );
  }

  if (error.code === 'P2034') {
    return httpError(
      409,
      'CONCURRENT_MODIFICATION',
      'Another calendar change occurred at the same time. Please retry.'
    );
  }

  return error;
}

export async function createTerm(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const year = await getAcademicYearOrThrow(
        tx,
        data.academicYearId
      );

      ensureDatesWithinYear(data.startDate, data.endDate, year);

      await ensureNoOverlap(
        tx,
        data.academicYearId,
        data.startDate,
        data.endDate
      );

      const term = await tx.term.create({
        data: {
          name: data.name,
          sequence: data.sequence,
          academicYearId: data.academicYearId,
          startDate: toDate(data.startDate),
          endDate: toDate(data.endDate),
          ...(data.annualWeightPercent !== undefined
            ? { annualWeightPercent: data.annualWeightPercent }
            : {}),
          status: 'DRAFT'
        },
        include: {
          academicYear: true
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TERM_CREATED',
          term.id,
          null,
          termSnapshot(term),
          req
        )
      });

      return term;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function listTerms(filters) {
  const { page, limit, academicYearId, status } = filters;

  const where = {
    ...(academicYearId ? { academicYearId } : {}),
    ...(status ? { status } : {})
  };

  const [terms, total] = await prisma.$transaction([
    prisma.term.findMany({
      where,
      include: {
        academicYear: true,
        _count: {
          select: {
            enrollments: true,
            assignments: true,
            assessments: true
          }
        }
      },
      orderBy: [
        { academicYear: { startDate: 'desc' } },
        { sequence: 'asc' }
      ],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.term.count({ where })
  ]);

  return {
    data: terms,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getTermById(id) {
  const term = await prisma.term.findUnique({
    where: { id },
    include: {
      academicYear: true,
      _count: {
        select: {
          enrollments: true,
          assignments: true,
          assessments: true
        }
      }
    }
  });

  if (!term) {
    throw httpError(404, 'TERM_NOT_FOUND', 'Term not found.');
  }

  return term;
}

export async function updateTerm(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.term.findUnique({
        where: { id },
        include: { academicYear: true }
      });

      if (!current) {
        throw httpError(404, 'TERM_NOT_FOUND', 'Term not found.');
      }

      if (protectedStatuses.includes(current.status)) {
        throw httpError(
          409,
          'TERM_LOCKED',
          'This term is finalized, published, or closed. Its details cannot be edited.'
        );
      }

      const startDate =
        data.startDate ?? dateString(current.startDate);

      const endDate =
        data.endDate ?? dateString(current.endDate);

      if (startDate >= endDate) {
        throw httpError(
          400,
          'INVALID_DATE_RANGE',
          'The end date must be after the start date.'
        );
      }

      ensureDatesWithinYear(
        startDate,
        endDate,
        current.academicYear
      );

      await ensureNoOverlap(
        tx,
        current.academicYearId,
        startDate,
        endDate,
        id
      );

      const updated = await tx.term.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.sequence !== undefined
            ? { sequence: data.sequence }
            : {}),
          ...(data.startDate !== undefined
            ? { startDate: toDate(data.startDate) }
            : {}),
          ...(data.endDate !== undefined
            ? { endDate: toDate(data.endDate) }
            : {}),
          ...(data.annualWeightPercent !== undefined
            ? { annualWeightPercent: data.annualWeightPercent }
            : {})
        },
        include: {
          academicYear: true
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'TERM_UPDATED',
          id,
          termSnapshot(current),
          termSnapshot(updated),
          req
        )
      });

      return updated;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateTermStatus(id, nextStatus, actorId, req) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.term.findUnique({
      where: { id }
    });

    if (!current) {
      throw httpError(404, 'TERM_NOT_FOUND', 'Term not found.');
    }

    const allowed = allowedTransitions[current.status] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw httpError(
        409,
        'INVALID_TERM_TRANSITION',
        `Cannot change a term from ${current.status} to ${nextStatus}.`
      );
    }

    const updated = await tx.term.update({
      where: { id },
      data: { status: nextStatus },
      include: { academicYear: true }
    });

    await tx.auditLog.create({
      data: auditData(
        actorId,
        'TERM_STATUS_CHANGED',
        id,
        { status: current.status },
        { status: updated.status },
        req
      )
    });

    return updated;
  });
}
