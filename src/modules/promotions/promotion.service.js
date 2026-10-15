
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const OUTCOMES = ['PROMOTE', 'REPEAT', 'GRADUATE'];

function auditSnapshot(enrollment) {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    termId: enrollment.termId,
    classGroupId: enrollment.classGroupId,
    status: enrollment.status,
    previousEnrollmentId: enrollment.previousEnrollmentId,
  };
}

function auditMetadata(req) {
  return {
    ipAddress: req?.ip ?? null,
    userAgent: req?.get?.('user-agent')?.slice(0, 500) ?? null,
  };
}

async function loadPromotionContext(
  db,
  { sourceTermId, destinationTermId, classGroupId },
) {
  const [sourceTerm, destinationTerm, sourceClassGroup] =
    await Promise.all([
      db.term.findUnique({
        where: { id: sourceTermId },
        include: {
          academicYear: {
            include: {
              terms: { select: { id: true, sequence: true } },
            },
          },
        },
      }),
      db.term.findUnique({
        where: { id: destinationTermId },
        include: {
          academicYear: {
            include: {
              terms: { select: { id: true, sequence: true } },
            },
          },
        },
      }),
      db.classGroup.findUnique({
        where: { id: classGroupId },
        include: { classLevel: true },
      }),
    ]);

  if (!sourceTerm) {
    throw httpError(404, 'SOURCE_TERM_NOT_FOUND', 'Source term not found.');
  }

  if (!destinationTerm) {
    throw httpError(
      404,
      'DESTINATION_TERM_NOT_FOUND',
      'Destination term not found.',
    );
  }

  if (!sourceClassGroup) {
    throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
  }

  if (sourceTerm.academicYearId === destinationTerm.academicYearId) {
    throw httpError(
      409,
      'SAME_ACADEMIC_YEAR',
      'Promotion must target a different academic year.',
    );
  }

  const sourceYear = sourceTerm.academicYear;
  const destinationYear = destinationTerm.academicYear;

  if (
    new Date(destinationYear.startDate) <=
    new Date(sourceYear.startDate)
  ) {
    throw httpError(
      409,
      'INVALID_ACADEMIC_YEAR_ORDER',
      'The destination academic year must be later than the source year.',
    );
  }

  if (
    sourceYear.terms.length === 0 ||
    destinationYear.terms.length === 0
  ) {
    throw httpError(
      409,
      'ACADEMIC_YEAR_WITHOUT_TERMS',
      'Both academic years must have terms configured.',
    );
  }

  // Only the final source term can be used for promotion.
  const sourceLastSequence = Math.max(
    ...sourceYear.terms.map((term) => term.sequence),
  );

  if (sourceTerm.sequence !== sourceLastSequence) {
    throw httpError(
      409,
      'SOURCE_TERM_NOT_FINAL',
      'Promotion can only be processed from the final term of an academic year.',
    );
  }

  // The destination must be the first term of its academic year.
  const destinationFirstSequence = Math.min(
    ...destinationYear.terms.map((term) => term.sequence),
  );

  if (destinationTerm.sequence !== destinationFirstSequence) {
    throw httpError(
      409,
      'DESTINATION_TERM_NOT_FIRST',
      'The destination must be the first term of the destination academic year.',
    );
  }

  // Require the immediately following academic year, not a later one.
  const nextYears = await db.academicYear.findMany({
    where: { startDate: { gt: sourceYear.startDate } },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    take: 1,
    select: { id: true },
  });

  if (
    nextYears.length === 0 ||
    nextYears[0].id !== destinationYear.id
  ) {
    throw httpError(
      409,
      'DESTINATION_YEAR_NOT_NEXT',
      'The destination must be the next academic year after the source year.',
    );
  }

  const enrollments = await db.enrollment.findMany({
    where: {
      termId: sourceTermId,
      classGroupId,
      status: 'ACTIVE',
    },
    include: {
      student: true,
      termResults: {
        where: { status: 'PUBLISHED' },
        select: { subjectId: true },
      },
    },
    orderBy: { studentId: 'asc' },
  });

  if (enrollments.length === 0) {
    throw httpError(
      409,
      'NO_ACTIVE_ENROLLMENTS',
      'There are no active enrollments in the selected class group and source term.',
    );
  }

  const requiredSubjects = await db.classSubject.findMany({
    where: { classLevelId: sourceClassGroup.classLevelId },
    select: { subjectId: true },
  });

  if (requiredSubjects.length === 0) {
    throw httpError(
      409,
      'NO_SUBJECTS_CONFIGURED',
      'No subjects are assigned to this class level.',
    );
  }

  const requiredSubjectIds = requiredSubjects.map(
    (subject) => subject.subjectId,
  );

  const eligibleEnrollments = enrollments.map((enrollment) => {
    const publishedIds = new Set(
      enrollment.termResults.map((result) => result.subjectId),
    );

    const missingSubjectIds = requiredSubjectIds.filter(
      (subjectId) => !publishedIds.has(subjectId),
    );

    return {
      enrollment,
      eligible: missingSubjectIds.length === 0,
      missingSubjectIds,
    };
  });

  return {
    sourceTerm,
    destinationTerm,
    sourceClassGroup,
    eligibleEnrollments,
  };
}

export async function previewPromotion({
  sourceTermId,
  destinationTermId,
  classGroupId,
}) {
  const context = await loadPromotionContext(prisma, {
    sourceTermId,
    destinationTermId,
    classGroupId,
  });

  const { sourceClassGroup, eligibleEnrollments } = context;
  const isFinalLevel = sourceClassGroup.classLevel.nextLevelId == null;

  return {
    source: {
      termId: context.sourceTerm.id,
      termName: context.sourceTerm.name,
      academicYear: context.sourceTerm.academicYear.name,
      classGroupId: sourceClassGroup.id,
      classLevelId: sourceClassGroup.classLevelId,
      classLevelName: sourceClassGroup.classLevel.name,
    },
    destination: {
      termId: context.destinationTerm.id,
      termName: context.destinationTerm.name,
      academicYear: context.destinationTerm.academicYear.name,
    },
    finalClassLevel: isFinalLevel,
    totalStudents: eligibleEnrollments.length,
    eligibleCount: eligibleEnrollments.filter((item) => item.eligible).length,
    ineligibleCount: eligibleEnrollments.filter((item) => !item.eligible)
      .length,
    students: eligibleEnrollments.map(
      ({ enrollment, eligible, missingSubjectIds }) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        student: enrollment.student,
        eligible,
        missingSubjectIds,
        allowedOutcomes: isFinalLevel
          ? ['GRADUATE']
          : ['PROMOTE', 'REPEAT'],
      }),
    ),
  };
}

export async function approvePromotionBatch({
  sourceTermId,
  destinationTermId,
  classGroupId,
  decisions,
  actorId,
  req,
}) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Check first, so a previously approved batch is reported clearly.
        const existingBatch = await tx.promotionBatch.findFirst({
          where: { sourceTermId, classGroupId },
          select: { id: true, approvedAt: true },
        });

        if (existingBatch) {
          throw httpError(
            409,
            'PROMOTION_BATCH_ALREADY_APPROVED',
            'A promotion batch has already been approved for this source term and class group.',
          );
        }

        const context = await loadPromotionContext(tx, {
          sourceTermId,
          destinationTermId,
          classGroupId,
        });

        const { sourceClassGroup, eligibleEnrollments } = context;
        const isFinalLevel = sourceClassGroup.classLevel.nextLevelId == null;

        if (!Array.isArray(decisions) || decisions.length === 0) {
          throw httpError(
            400,
            'DECISIONS_REQUIRED',
            'At least one student decision is required.',
          );
        }

        const enrollmentMap = new Map(
          eligibleEnrollments.map(({ enrollment, eligible }) => [
            enrollment.id,
            { enrollment, eligible },
          ]),
        );

        const decisionIds = decisions.map(
          (decision) => decision.enrollmentId,
        );

        if (
          decisionIds.some((id) => typeof id !== 'string' || !id.trim())
        ) {
          throw httpError(
            400,
            'INVALID_ENROLLMENT_ID',
            'Every decision must contain a valid enrollment ID.',
          );
        }

        if (new Set(decisionIds).size !== decisionIds.length) {
          throw httpError(
            400,
            'DUPLICATE_DECISIONS',
            'Each enrollment can appear only once in a promotion batch.',
          );
        }

        if (decisionIds.length !== enrollmentMap.size) {
          throw httpError(
            409,
            'DECISIONS_INCOMPLETE',
            'Submit exactly one decision for every active student in the selected class group.',
          );
        }

        for (const decision of decisions) {
          const item = enrollmentMap.get(decision.enrollmentId);

          if (!item) {
            throw httpError(
              409,
              'ENROLLMENT_OUTSIDE_BATCH',
              'A submitted enrollment does not belong to the selected source class and term.',
            );
          }

          if (!item.eligible) {
            throw httpError(
              409,
              'STUDENT_RESULTS_INCOMPLETE',
              `Enrollment ${decision.enrollmentId} has unpublished required subject results.`,
            );
          }

          if (!OUTCOMES.includes(decision.outcome)) {
            throw httpError(
              400,
              'INVALID_PROMOTION_OUTCOME',
              'Outcome must be PROMOTE, REPEAT, or GRADUATE.',
            );
          }

          if (isFinalLevel && decision.outcome !== 'GRADUATE') {
            throw httpError(
              409,
              'FINAL_LEVEL_REQUIRES_GRADUATION',
              'Students in the final class level must be marked GRADUATE.',
            );
          }

          if (!isFinalLevel && decision.outcome === 'GRADUATE') {
            throw httpError(
              409,
              'GRADUATION_NOT_ALLOWED',
              'Only students in the final class level can be marked GRADUATE.',
            );
          }

          if (decision.outcome === 'GRADUATE') {
            if (decision.destinationClassGroupId) {
              throw httpError(
                400,
                'GRADUATION_DESTINATION_NOT_ALLOWED',
                'Graduating students must not have a destination class group.',
              );
            }

            continue;
          }

          if (!decision.destinationClassGroupId) {
            throw httpError(
              400,
              'DESTINATION_CLASS_REQUIRED',
              'A destination class group is required for promotion or repetition.',
            );
          }

          const destinationGroup = await tx.classGroup.findUnique({
            where: { id: decision.destinationClassGroupId },
            select: { id: true, classLevelId: true },
          });

          if (!destinationGroup) {
            throw httpError(
              404,
              'DESTINATION_CLASS_NOT_FOUND',
              'A destination class group was not found.',
            );
          }

          if (
            decision.outcome === 'PROMOTE' &&
            destinationGroup.classLevelId !==
              sourceClassGroup.classLevel.nextLevelId
          ) {
            throw httpError(
              409,
              'INVALID_PROMOTION_DESTINATION',
              'The destination class group must belong to the configured next class level.',
            );
          }

          if (
            decision.outcome === 'REPEAT' &&
            destinationGroup.classLevelId !== sourceClassGroup.classLevelId
          ) {
            throw httpError(
              409,
              'INVALID_REPEAT_DESTINATION',
              'A repeating student must remain at the same class level.',
            );
          }
        }

        // A student must not already have an enrollment in the destination term.
        const studentIds = eligibleEnrollments.map(
          ({ enrollment }) => enrollment.studentId,
        );

        const existingDestinationEnrollments =
          await tx.enrollment.findMany({
            where: {
              termId: destinationTermId,
              studentId: { in: studentIds },
            },
            select: { studentId: true },
          });

        if (existingDestinationEnrollments.length > 0) {
          throw httpError(
            409,
            'DESTINATION_ENROLLMENT_EXISTS',
            'One or more students already have an enrollment in the destination term. Resolve those records before approving this batch.',
          );
        }

        const metadata = auditMetadata(req);
        const createdEnrollments = [];
        const graduatedEnrollments = [];

        for (const decision of decisions) {
          const { enrollment } = enrollmentMap.get(decision.enrollmentId);

          const sourceStatus =
            decision.outcome === 'PROMOTE'
              ? 'PROMOTED'
              : decision.outcome === 'REPEAT'
                ? 'REPEATING'
                : 'GRADUATED';

          // Conditional update prevents processing an enrollment that is no
          // longer active. A failed count aborts the whole transaction.
          const updateResult = await tx.enrollment.updateMany({
            where: { id: enrollment.id, status: 'ACTIVE' },
            data: { status: sourceStatus },
          });

          if (updateResult.count !== 1) {
            throw httpError(
              409,
              'ENROLLMENT_STATUS_CHANGED',
              `Enrollment ${enrollment.id} is no longer active. Refresh the preview and try again.`,
            );
          }

          const updatedSource = await tx.enrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
          });

          let newEnrollment = null;

          if (decision.outcome !== 'GRADUATE') {
            newEnrollment = await tx.enrollment.create({
              data: {
                studentId: enrollment.studentId,
                termId: destinationTermId,
                classGroupId: decision.destinationClassGroupId,
                status: 'ACTIVE',
                previousEnrollmentId: enrollment.id,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              actorId,
              action:
                decision.outcome === 'PROMOTE'
                  ? 'STUDENT_PROMOTED'
                  : decision.outcome === 'REPEAT'
                    ? 'STUDENT_RETAINED'
                    : 'STUDENT_GRADUATED',
              entityType: 'Enrollment',
              entityId: enrollment.id,
              oldValues: auditSnapshot(enrollment),
              newValues: {
                ...auditSnapshot(updatedSource),
                nextEnrollmentId: newEnrollment?.id ?? null,
                destinationTermId:
                  newEnrollment ? destinationTermId : null,
                destinationClassGroupId:
                  newEnrollment ? decision.destinationClassGroupId : null,
              },
              ...metadata,
            },
          });

          if (newEnrollment) {
            createdEnrollments.push({
              outcome: decision.outcome,
              previousEnrollmentId: enrollment.id,
              enrollment: newEnrollment,
            });
          } else {
            graduatedEnrollments.push(updatedSource);
          }
        }

        const decisionSnapshots = decisions.map((decision) => {
          const created = createdEnrollments.find(
            (item) =>
              item.previousEnrollmentId === decision.enrollmentId,
          );

          return {
            sourceEnrollmentId: decision.enrollmentId,
            outcome: decision.outcome,
            destinationClassGroupId:
              decision.destinationClassGroupId ?? null,
            destinationEnrollmentId: created?.enrollment.id ?? null,
          };
        });

        const batch = await tx.promotionBatch.create({
          data: {
            sourceTermId,
            destinationTermId,
            classGroupId,
            status: 'APPROVED',
            decisions: decisionSnapshots,
            createdById: actorId,
            approvedById: actorId,
          },
        });

        return {
          batchId: batch.id,
          status: batch.status,
          approvedAt: batch.approvedAt,
          processedCount: decisions.length,
          promotedOrRepeatingCount: createdEnrollments.length,
          graduatedCount: graduatedEnrollments.length,
          enrollments: createdEnrollments,
          graduatedEnrollments,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error?.code === 'P2034') {
      throw httpError(
        409,
        'PROMOTION_CONFLICT',
        'Another transaction changed the promotion data. Refresh the preview and try again.',
      );
    }

    if (error?.code === 'P2002') {
      throw httpError(
        409,
        'PROMOTION_DUPLICATE_CONFLICT',
        'A duplicate promotion or enrollment was detected. Refresh the preview and inspect the existing records.',
      );
    }

    throw error;
  }
}


export async function listPromotionBatches({
  sourceTermId,
  destinationTermId,
  classGroupId,
  page = 1,
  limit = 20,
}) {
  const where = {
    ...(sourceTermId ? { sourceTermId } : {}),
    ...(destinationTermId ? { destinationTermId } : {}),
    ...(classGroupId ? { classGroupId } : {}),
  };

  const [total, batches] = await prisma.$transaction([
    prisma.promotionBatch.count({ where }),
    prisma.promotionBatch.findMany({
      where,
      orderBy: { approvedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        sourceTerm: {
          select: {
            id: true,
            name: true,
            academicYear: { select: { id: true, name: true } },
          },
        },
        destinationTerm: {
          select: {
            id: true,
            name: true,
            academicYear: { select: { id: true, name: true } },
          },
        },
        classGroup: {
          select: {
            id: true,
            name: true,
            classLevel: { select: { id: true, name: true } },
          },
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    data: batches,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPromotionBatchById(id) {
  const batch = await prisma.promotionBatch.findUnique({
    where: { id },
    include: {
      sourceTerm: {
        select: {
          id: true,
          name: true,
          academicYear: { select: { id: true, name: true } },
        },
      },
      destinationTerm: {
        select: {
          id: true,
          name: true,
          academicYear: { select: { id: true, name: true } },
        },
      },
      classGroup: {
        select: {
          id: true,
          name: true,
          classLevel: { select: { id: true, name: true } },
        },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      approvedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!batch) {
    throw httpError(404, 'PROMOTION_BATCH_NOT_FOUND', 'Promotion batch not found.');
  }

  return batch;
}
