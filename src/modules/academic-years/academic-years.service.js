
import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function auditData(actorId, action, entityId, oldValues, newValues, req) {
  return {
    actorId,
    action,
    entityType: 'AcademicYear',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500)
  };
}

async function ensureYearDatesContainTerms(tx, yearId, startDate, endDate) {
  const outsideTerm = await tx.term.findFirst({
    where: {
      academicYearId: yearId,
      OR: [
        { startDate: { lt: toDate(startDate) } },
        { endDate: { gt: toDate(endDate) } }
      ]
    },
    select: { id: true, name: true }
  });

  if (outsideTerm) {
    throw httpError(
      400,
      'TERM_OUTSIDE_ACADEMIC_YEAR',
      `The updated dates would place term "${outsideTerm.name}" outside its academic year.`
    );
  }
}

export async function createAcademicYear(data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (data.gradeScaleId) {
        const gradeScale = await tx.gradeScale.findUnique({ where: { id: data.gradeScaleId }, select: { id: true } });
        if (!gradeScale) throw httpError(404, 'GRADE_SCALE_NOT_FOUND', 'The selected grade scale was not found.');
      }
      if (data.isCurrent) {
        await tx.academicYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false }
        });
      }

      const year = await tx.academicYear.create({
        data: {
          name: data.name,
          startDate: toDate(data.startDate),
          endDate: toDate(data.endDate),
          isCurrent: data.isCurrent,
          ...(data.gradeScaleId !== undefined ? { gradeScaleId: data.gradeScaleId } : {})
        },
        include: {
          terms: { orderBy: { sequence: 'asc' } },
          gradeScale: { include: { boundaries: { orderBy: { minPercent: 'asc' } } } }
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'ACADEMIC_YEAR_CREATED',
          year.id,
          null,
          {
            name: year.name,
            startDate: data.startDate,
            endDate: data.endDate,
            isCurrent: year.isCurrent
          },
          req
        )
      });

      return year;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(
        409,
        'DUPLICATE_ACADEMIC_YEAR',
        'An academic year with this name already exists.'
      );
    }
    throw error;
  }
}

export async function listAcademicYears(filters) {
  const { page, limit } = filters;

  const [years, total] = await prisma.$transaction([
    prisma.academicYear.findMany({
      include: {
        terms: { orderBy: { sequence: 'asc' } },
        gradeScale: { include: { boundaries: { orderBy: { minPercent: 'asc' } } } },
        _count: { select: { annualResults: true } }
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.academicYear.count()
  ]);

  return {
    data: years,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getAcademicYearById(id) {
  const year = await prisma.academicYear.findUnique({
    where: { id },
    include: {
      terms: {
        orderBy: { sequence: 'asc' },
        include: {
          _count: { select: { enrollments: true, assignments: true, assessments: true } }
        }
      },
      gradeScale: { include: { boundaries: { orderBy: { minPercent: 'asc' } } } }
    }
  });

  if (!year) {
    throw httpError(404, 'ACADEMIC_YEAR_NOT_FOUND', 'Academic year not found.');
  }

  return year;
}

export async function updateAcademicYear(id, data, actorId, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.academicYear.findUnique({
        where: { id },
        include: { terms: true }
      });

      if (!current) {
        throw httpError(404, 'ACADEMIC_YEAR_NOT_FOUND', 'Academic year not found.');
      }

      if (data.gradeScaleId !== undefined && data.gradeScaleId !== current.gradeScaleId) {
        const termIds = current.terms.map((term) => term.id);
        const calculatedResults = termIds.length
          ? await tx.termSubjectResult.count({
              where: { enrollment: { is: { termId: { in: termIds } } } },
            })
          : 0;
        if (calculatedResults > 0) {
          throw httpError(
            409,
            'ACADEMIC_YEAR_GRADE_SCALE_LOCKED',
            'The grading scale cannot be changed after results have been calculated for this academic year.',
          );
        }
      }

      const startDate = data.startDate ?? current.startDate.toISOString().slice(0, 10);
      const endDate = data.endDate ?? current.endDate.toISOString().slice(0, 10);

      if (startDate >= endDate) {
        throw httpError(400, 'INVALID_DATE_RANGE', 'The end date must be after the start date.');
      }

      const datesChanged =
        data.startDate !== undefined || data.endDate !== undefined;

      if (datesChanged) {
        const protectedTerm = current.terms.find((term) =>
          ['FINALIZED', 'PUBLISHED', 'CLOSED'].includes(term.status)
        );

        if (protectedTerm) {
          throw httpError(
            409,
            'ACADEMIC_YEAR_CALENDAR_LOCKED',
            'Academic-year dates cannot be changed because a term is finalized, published, or closed.'
          );
        }

        await ensureYearDatesContainTerms(tx, id, startDate, endDate);
      }

      if (data.isCurrent === true) {
        await tx.academicYear.updateMany({
          where: { isCurrent: true, id: { not: id } },
          data: { isCurrent: false }
        });
      }

      if (data.gradeScaleId) {
        const gradeScale = await tx.gradeScale.findUnique({
          where: { id: data.gradeScaleId },
          select: { id: true },
        });
        if (!gradeScale) {
          throw httpError(404, 'GRADE_SCALE_NOT_FOUND', 'The selected grade scale was not found.');
        }
      }

      const updated = await tx.academicYear.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.startDate !== undefined ? { startDate: toDate(data.startDate) } : {}),
          ...(data.endDate !== undefined ? { endDate: toDate(data.endDate) } : {}),
          ...(data.isCurrent !== undefined ? { isCurrent: data.isCurrent } : {}),
          ...(data.gradeScaleId !== undefined ? { gradeScaleId: data.gradeScaleId } : {})
        },
        include: {
          terms: { orderBy: { sequence: 'asc' } },
          gradeScale: { include: { boundaries: { orderBy: { minPercent: 'asc' } } } }
        }
      });

      await tx.auditLog.create({
        data: auditData(
          actorId,
          'ACADEMIC_YEAR_UPDATED',
          id,
          {
            name: current.name,
            startDate: current.startDate.toISOString().slice(0, 10),
            endDate: current.endDate.toISOString().slice(0, 10),
            isCurrent: current.isCurrent,
            gradeScaleId: current.gradeScaleId
          },
          {
            name: updated.name,
            startDate: updated.startDate.toISOString().slice(0, 10),
            endDate: updated.endDate.toISOString().slice(0, 10),
            isCurrent: updated.isCurrent,
            gradeScaleId: updated.gradeScaleId
          },
          req
        )
      });

      return updated;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(409, 'DUPLICATE_ACADEMIC_YEAR', 'An academic year with this name already exists.');
    }
    throw error;
  }
}
