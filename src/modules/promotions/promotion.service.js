
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const OUTCOMES = ['PROMOTE', 'REPEAT', 'GRADUATE'];
const DEFAULT_POLICY = {
  minimumAverage: 50,
  passMark: 50,
  minimumSubjectsPassed: 0,
  requiredSubjectIds: [],
};

function evaluateStudent(enrollment, policy, isFinalLevel, requiredSubjectIds) {
  const marks = enrollment.termResults
    .filter((result) => requiredSubjectIds.includes(result.subjectId))
    .map((result) => ({
      subjectId: result.subjectId,
      mark: result.finalMark == null ? null : Number(result.finalMark),
    }));
  const missingMarkSubjectIds = marks
    .filter(({ mark }) => mark == null || !Number.isFinite(mark))
    .map(({ subjectId }) => subjectId);
  const validMarks = marks.filter(({ mark }) => mark != null && Number.isFinite(mark));
  const passedSubjectIds = validMarks
    .filter(({ mark }) => mark >= policy.passMark)
    .map(({ subjectId }) => subjectId);
  const average = validMarks.length
    ? validMarks.reduce((sum, { mark }) => sum + mark, 0) / validMarks.length
    : null;
  const failedRequiredSubjectIds = policy.requiredSubjectIds.filter((id) => !passedSubjectIds.includes(id));
  const meetsPolicy = average != null &&
    average >= policy.minimumAverage &&
    passedSubjectIds.length >= policy.minimumSubjectsPassed &&
    failedRequiredSubjectIds.length === 0;
  const eligible = missingMarkSubjectIds.length === 0;
  return {
    eligible,
    missingMarkSubjectIds,
    metrics: {
      average: average == null ? null : Number(average.toFixed(2)),
      subjectsPassed: passedSubjectIds.length,
      subjectsAssessed: validMarks.length,
      passedSubjectIds,
      failedRequiredSubjectIds,
    },
    recommendedOutcome: eligible
      ? meetsPolicy
        ? isFinalLevel ? 'GRADUATE' : 'PROMOTE'
        : 'REPEAT'
      : null,
  };
}

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
        select: { subjectId: true, finalMark: true },
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

  const savedPolicy = await db.promotionPolicy.findUnique({
    where: { schoolId_classLevelId: { schoolId: sourceClassGroup.schoolId, classLevelId: sourceClassGroup.classLevelId } },
  });
  const policy = savedPolicy
    ? {
        id: savedPolicy.id,
        minimumAverage: Number(savedPolicy.minimumAverage),
        passMark: Number(savedPolicy.passMark),
        minimumSubjectsPassed: savedPolicy.minimumSubjectsPassed,
        requiredSubjectIds: savedPolicy.requiredSubjectIds,
        isDefault: false,
      }
    : {
        ...DEFAULT_POLICY,
        minimumSubjectsPassed: Math.ceil(requiredSubjectIds.length / 2),
        isDefault: true,
      };
  if (policy.requiredSubjectIds.some((id) => !requiredSubjectIds.includes(id))) {
    throw httpError(409, 'INVALID_PROMOTION_POLICY', 'The promotion policy references subjects no longer assigned to this class level. Update the policy before processing promotions.');
  }

  const completeEnrollments = enrollments.map((enrollment) => {
    const publishedIds = new Set(
      enrollment.termResults.map((result) => result.subjectId),
    );

    const missingSubjectIds = requiredSubjectIds.filter(
      (subjectId) => !publishedIds.has(subjectId),
    );

    return { enrollment, missingSubjectIds };
  });

  const isFinalLevel = sourceClassGroup.classLevel.nextLevelId == null;
  const eligibleEnrollments = completeEnrollments.map(
    ({ enrollment, missingSubjectIds }) => {
    const evaluation = evaluateStudent(enrollment, policy, isFinalLevel, requiredSubjectIds);
    const eligible = evaluation.eligible && missingSubjectIds.length === 0;
    return {
      enrollment,
      ...evaluation,
      eligible,
      recommendedOutcome: eligible ? evaluation.recommendedOutcome : null,
      missingSubjectIds,
    };
    },
  );

  return {
    sourceTerm,
    destinationTerm,
    sourceClassGroup,
    policy,
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

  const { sourceClassGroup, eligibleEnrollments, policy } = context;
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
    policy,
    totalStudents: eligibleEnrollments.length,
    eligibleCount: eligibleEnrollments.filter((item) => item.eligible).length,
    ineligibleCount: eligibleEnrollments.filter((item) => !item.eligible)
      .length,
    students: eligibleEnrollments.map(
      ({ enrollment, eligible, missingSubjectIds, missingMarkSubjectIds, metrics, recommendedOutcome }) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        student: enrollment.student,
        eligible,
        missingSubjectIds,
        missingMarkSubjectIds,
        metrics,
        recommendedOutcome,
        allowedOutcomes: isFinalLevel ? ['REPEAT', 'GRADUATE'] : ['PROMOTE', 'REPEAT'],
      }),
    ),
  };
}

export async function listPromotionPolicies() {
  const classLevels = await prisma.classLevel.findMany({
    orderBy: { levelOrder: 'asc' },
    include: { subjects: { include: { subject: { select: { id: true, name: true, code: true } } } } },
  });
  const savedPolicies = await prisma.promotionPolicy.findMany();
  const byLevel = new Map(savedPolicies.map((policy) => [policy.classLevelId, policy]));
  return classLevels.map((level) => {
    const saved = byLevel.get(level.id);
    return {
      classLevelId: level.id,
      classLevelName: level.name,
      subjects: level.subjects.map(({ subject }) => subject),
      ...(saved ? {
        id: saved.id,
        minimumAverage: Number(saved.minimumAverage),
        passMark: Number(saved.passMark),
        minimumSubjectsPassed: saved.minimumSubjectsPassed,
        requiredSubjectIds: saved.requiredSubjectIds,
        isDefault: false,
      } : {
        ...DEFAULT_POLICY,
        minimumSubjectsPassed: Math.ceil(level.subjects.length / 2),
        isDefault: true,
      }),
    };
  });
}

export async function savePromotionPolicy(classLevelId, data) {
  const classLevel = await prisma.classLevel.findUnique({ where: { id: classLevelId } });
  if (!classLevel) throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found.');
  const subjects = await prisma.classSubject.findMany({
    where: { classLevelId },
    select: { subjectId: true },
  });
  const subjectIds = new Set(subjects.map(({ subjectId }) => subjectId));
  if (data.minimumSubjectsPassed > subjects.length) {
    throw httpError(400, 'INVALID_MINIMUM_SUBJECTS_PASSED', 'Minimum subjects passed cannot exceed the number assigned to this class level.');
  }
  if (data.requiredSubjectIds.some((id) => !subjectIds.has(id))) {
    throw httpError(400, 'INVALID_REQUIRED_SUBJECT', 'Every required pass subject must be assigned to this class level.');
  }
  const existing = await prisma.promotionPolicy.findUnique({
    where: { schoolId_classLevelId: { schoolId: classLevel.schoolId, classLevelId } },
  });
  const values = {
    minimumAverage: data.minimumAverage,
    passMark: data.passMark,
    minimumSubjectsPassed: data.minimumSubjectsPassed,
    requiredSubjectIds: data.requiredSubjectIds,
  };
  return existing
    ? prisma.promotionPolicy.update({ where: { id: existing.id }, data: values })
    : prisma.promotionPolicy.create({ data: { classLevelId, ...values } });
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

        const { sourceClassGroup, eligibleEnrollments, policy } = context;
        const isFinalLevel = sourceClassGroup.classLevel.nextLevelId == null;

        if (!Array.isArray(decisions) || decisions.length === 0) {
          throw httpError(
            400,
            'DECISIONS_REQUIRED',
            'At least one student decision is required.',
          );
        }

        const enrollmentMap = new Map(eligibleEnrollments.map((item) => [item.enrollment.id, item]));

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
              `Enrollment ${decision.enrollmentId} is missing a published subject result or final mark.`,
            );
          }

          if (!OUTCOMES.includes(decision.outcome)) {
            throw httpError(
              400,
              'INVALID_PROMOTION_OUTCOME',
              'Outcome must be PROMOTE, REPEAT, or GRADUATE.',
            );
          }

          if (isFinalLevel && decision.outcome === 'PROMOTE') {
            throw httpError(
              409,
              'FINAL_LEVEL_CANNOT_PROMOTE',
              'Students in the final class level can repeat or graduate, but cannot be promoted.',
            );
          }

          if (decision.outcome !== item.recommendedOutcome && !decision.overrideReason?.trim()) {
            throw httpError(400, 'OVERRIDE_REASON_REQUIRED', `A reason is required to override the recommendation for enrollment ${decision.enrollmentId}.`);
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
            const destinationGroup = await tx.classGroup.findUnique({
              where: { id: decision.destinationClassGroupId },
              select: { classLevelId: true },
            });
            newEnrollment = await tx.enrollment.create({
              data: {
                studentId: enrollment.studentId,
                termId: destinationTermId,
                classLevelId: destinationGroup.classLevelId,
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
          const evaluated = enrollmentMap.get(decision.enrollmentId);
          const created = createdEnrollments.find(
            (item) =>
              item.previousEnrollmentId === decision.enrollmentId,
          );

          return {
            sourceEnrollmentId: decision.enrollmentId,
            outcome: decision.outcome,
            recommendedOutcome: evaluated.recommendedOutcome,
            metrics: evaluated.metrics,
            policySnapshot: policy,
            overrideReason: decision.overrideReason?.trim() || null,
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
