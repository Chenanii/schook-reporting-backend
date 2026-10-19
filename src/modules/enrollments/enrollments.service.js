// import { prisma } from "../../lib/prisma.js";

// function httpError(statusCode, code, message) {
//   const error = new Error(message);
//   error.statusCode = statusCode;
//   error.code = code;
//   return error;
// }

// function auditData(actorId, action, entityId, oldValues, newValues, req) {
//   return {
//     actorId,
//     action,
//     entityType: "Enrollment",
//     entityId,
//     oldValues: oldValues ?? undefined,
//     newValues: newValues ?? undefined,
//     ipAddress: req.ip,
//     userAgent: req.get("user-agent")?.slice(0, 500),
//   };
// }

// function snapshot(enrollment) {
//   return {
//     studentId: enrollment.studentId,
//     termId: enrollment.termId,
//     classLevelId: enrollment.classLevelId,
//     classGroupId: enrollment.classGroupId,
//     status: enrollment.status,
//     previousEnrollmentId: enrollment.previousEnrollmentId,
//   };
// }

// function handleDatabaseError(error) {
//   if (error.code === "P2002") {
//     throw httpError(
//       409,
//       "ENROLLMENT_ALREADY_EXISTS",
//       "This student already has an enrolment for the selected term, or the previous enrolment is already linked.",
//     );
//   }

//   throw error;
// }

// const enrollmentIncludes = {
//   _count: { select: { results: true } },
//   student: {
//     select: {
//       id: true,
//       admissionNumber: true,
//       firstName: true,
//       middleName: true,
//       lastName: true,
//       status: true,
//     },
//   },
//   term: {
//     select: {
//       id: true,
//       name: true,
//       sequence: true,
//       status: true,
//       startDate: true,
//       endDate: true,
//       academicYear: {
//         select: {
//           id: true,
//           name: true,
//           startDate: true,
//           endDate: true,
//         },
//       },
//     },
//   },
//   classGroup: {
//     select: {
//       id: true,
//       name: true,
//       classLevel: {
//         select: {
//           id: true,
//           name: true,
//           levelOrder: true,
//         },
//       },
//     },
//   },
//   classLevel: { select: { id: true, name: true, levelOrder: true } },
//   previousEnrollment: {
//     select: {
//       id: true,
//       termId: true,
//       classGroupId: true,
//       status: true,
//     },
//   },
// };

// function isEarlierTerm(previous, current) {
//   const previousYearStart = previous.term.academicYear.startDate;
//   const currentYearStart = current.academicYear.startDate;

//   if (previousYearStart < currentYearStart) return true;
//   if (previousYearStart > currentYearStart) return false;

//   return previous.term.sequence < current.sequence;
// }

// export async function createEnrollment(data, actorId, req, schoolId) {
//   try {
//     return await prisma.$transaction(async (tx) => {
//       const student = await tx.student.findUnique({
//         where: { id: data.studentId },
//         select: {
//           id: true,
//           status: true,
//           schoolId: true,
//         },
//       });

//       if (!student) {
//         throw httpError(404, "STUDENT_NOT_FOUND", "Student not found.");
//       }
//       if (student.schoolId !== schoolId)
//         throw httpError(
//           404,
//           "STUDENT_NOT_FOUND",
//           "Student not found for this school.",
//         );

//       if (student.status !== "ACTIVE") {
//         throw httpError(
//           409,
//           "STUDENT_NOT_ACTIVE",
//           "Only active students can be enrolled.",
//         );
//       }

//       const classLevel = await tx.classLevel.findFirst({
//         where: { id: data.classLevelId, schoolId },
//         select: { id: true },
//       });
//       if (!classLevel)
//         throw httpError(
//           404,
//           "CLASS_LEVEL_NOT_FOUND",
//           "Class level not found for this school.",
//         );

//       const term = await tx.term.findFirst({
//         where: { id: data.termId, schoolId },
//         include: {
//           academicYear: {
//             select: {
//               id: true,
//               startDate: true,
//               endDate: true,
//             },
//           },
//         },
//       });

//       if (!term) {
//         throw httpError(404, "TERM_NOT_FOUND", "Academic term not found.");
//       }

//       if (!["DRAFT", "OPEN"].includes(term.status)) {
//         throw httpError(
//           409,
//           "TERM_NOT_ACCEPTING_ENROLLMENTS",
//           "Enrolments can only be created for terms in DRAFT or OPEN status.",
//         );
//       }

//       const classGroup = data.classGroupId
//         ? await tx.classGroup.findFirst({
//             where: { id: data.classGroupId, schoolId },
//             select: {
//               id: true,
//               classLevelId: true,
//             },
//           })
//         : null;

//       if (data.classGroupId && !classGroup) {
//         throw httpError(404, "CLASS_GROUP_NOT_FOUND", "Class group not found.");
//       }
//       if (classGroup && classGroup.classLevelId !== classLevel.id) {
//         throw httpError(
//           400,
//           "CLASS_LEVEL_MISMATCH",
//           "The class group must belong to the selected class level.",
//         );
//       }

//       let previousEnrollmentId = null;

//       if (data.previousEnrollmentId) {
//         const previous = await tx.enrollment.findUnique({
//           where: { id: data.previousEnrollmentId },
//           include: {
//             term: {
//               include: {
//                 academicYear: {
//                   select: {
//                     startDate: true,
//                   },
//                 },
//               },
//             },
//             nextEnrollment: {
//               select: { id: true },
//             },
//           },
//         });

//         if (!previous) {
//           throw httpError(
//             404,
//             "PREVIOUS_ENROLLMENT_NOT_FOUND",
//             "Previous enrolment not found.",
//           );
//         }

//         if (previous.studentId !== student.id) {
//           throw httpError(
//             400,
//             "ENROLLMENT_STUDENT_MISMATCH",
//             "The previous enrolment belongs to a different student.",
//           );
//         }

//         if (previous.nextEnrollment) {
//           throw httpError(
//             409,
//             "PREVIOUS_ENROLLMENT_ALREADY_LINKED",
//             "The previous enrolment already has a subsequent enrolment.",
//           );
//         }

//         if (!isEarlierTerm(previous, term)) {
//           throw httpError(
//             400,
//             "INVALID_ENROLLMENT_SEQUENCE",
//             "The previous enrolment must belong to an earlier academic term.",
//           );
//         }

//         if (
//           !["ACTIVE", "COMPLETED", "PROMOTED", "REPEATING"].includes(
//             previous.status,
//           )
//         ) {
//           throw httpError(
//             409,
//             "PREVIOUS_ENROLLMENT_STATUS_INVALID",
//             "The previous enrolment status does not allow progression.",
//           );
//         }

//         previousEnrollmentId = previous.id;
//       }

//       const enrollment = await tx.enrollment.create({
//         data: {
//           studentId: student.id,
//           termId: term.id,
//           classLevelId: classLevel.id,
//           classGroupId: classGroup?.id ?? null,
//           schoolId,
//           ...(previousEnrollmentId ? { previousEnrollmentId } : {}),
//         },
//         include: enrollmentIncludes,
//       });

//       await tx.auditLog.create({
//         data: auditData(
//           actorId,
//           "ENROLLMENT_CREATED",
//           enrollment.id,
//           null,
//           snapshot(enrollment),
//           req,
//         ),
//       });

//       return enrollment;
//     });
//   } catch (error) {
//     handleDatabaseError(error);
//   }
// }

// export async function listEnrollments(filters) {
//   // const { page, limit, studentId, termId, classGroupId, status, search } = filters;
//   const {
//     page,
//     limit,
//     studentId,
//     termId,
//     classGroupId,
//     classLevelId,
//     unassigned,
//     status,
//     search,
//   } = filters;

//   // const where = {
//   const where = {
//     ...(classLevelId ? { classLevelId } : {}),
//     ...(unassigned ? { classGroupId: null } : {}),
//     ...(studentId ? { studentId } : {}),
//     ...(termId ? { termId } : {}),
//     ...(classGroupId ? { classGroupId } : {}),
//     ...(status ? { status } : {}),
//     ...(search
//       ? {
//           student: {
//             is: {
//               OR: [
//                 {
//                   admissionNumber: {
//                     contains: search,
//                     mode: "insensitive",
//                   },
//                 },
//                 {
//                   firstName: {
//                     contains: search,
//                     mode: "insensitive",
//                   },
//                 },
//                 {
//                   middleName: {
//                     contains: search,
//                     mode: "insensitive",
//                   },
//                 },
//                 {
//                   lastName: {
//                     contains: search,
//                     mode: "insensitive",
//                   },
//                 },
//               ],
//             },
//           },
//         }
//       : {}),
//   };

//   const [enrollments, total] = await prisma.$transaction([
//     prisma.enrollment.findMany({
//       where,
//       skip: (page - 1) * limit,
//       take: limit,
//       orderBy: [{ createdAt: "desc" }, { id: "asc" }],
//       include: {
//         ...enrollmentIncludes,
//         nextEnrollment: { select: { id: true } },
//       },
//     }),
//     prisma.enrollment.count({ where }),
//   ]);

//   return {
//     data: enrollments,
//     pagination: {
//       page,
//       limit,
//       total,
//       totalPages: Math.ceil(total / limit),
//     },
//   };
// }

// export async function getEnrollmentById(id) {
//   const enrollment = await prisma.enrollment.findUnique({
//     where: { id },
//     include: {
//       ...enrollmentIncludes,
//       nextEnrollment: {
//         select: {
//           id: true,
//           termId: true,
//           classGroupId: true,
//           status: true,
//           createdAt: true,
//         },
//       },
//     },
//   });

//   if (!enrollment) {
//     throw httpError(404, "ENROLLMENT_NOT_FOUND", "Enrolment not found.");
//   }

//   return enrollment;
// }

// export async function updateEnrollmentStatus(id, status, actorId, req) {
//   return prisma.$transaction(async (tx) => {
//     const existing = await tx.enrollment.findUnique({
//       where: { id },
//     });

//     if (!existing) {
//       throw httpError(404, "ENROLLMENT_NOT_FOUND", "Enrolment not found.");
//     }

//     if (existing.status === status) {
//       return tx.enrollment.findUnique({
//         where: { id },
//         include: enrollmentIncludes,
//       });
//     }

//     const updated = await tx.enrollment.update({
//       where: { id },
//       data: { status },
//       include: enrollmentIncludes,
//     });

//     await tx.auditLog.create({
//       data: auditData(
//         actorId,
//         "ENROLLMENT_STATUS_UPDATED",
//         id,
//         snapshot(existing),
//         snapshot(updated),
//         req,
//       ),
//     });

//     return updated;
//   });
// }

// // export async function updateEnrollmentClassGroup(id, classGroupId, actorId, req) {
// //   return prisma.$transaction(async (tx) => {
// //     const existing = await tx.enrollment.findUnique({
// //       where: { id },
// //       include: {
// //         term: { select: { status: true } },
// //         classLevelId: true,
// //         _count: { select: { results: true } },
// //       },
// //     });
// //     if (!existing) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Enrolment not found.');
// //     const destination = await tx.classGroup.findUnique({
// //       where: { id: classGroupId },
// //       select: { id: true, classLevelId: true },
// //     });
// //     if (!destination) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
// //     if (existing.classGroupId === destination.id) {
// //       return tx.enrollment.findUnique({ where: { id }, include: enrollmentIncludes });
// //     }
// //     if (existing.status !== 'ACTIVE' || !['DRAFT', 'OPEN'].includes(existing.term.status) || existing._count.results > 0) {
// //       throw httpError(409, 'ENROLLMENT_STREAM_LOCKED', 'Only active enrollments in an open term without assessment results can be moved to another stream.');
// //     }
// //     if (existing.classLevelId !== destination.classLevelId) {
// //       throw httpError(400, 'CLASS_LEVEL_MISMATCH', 'A student can only be moved to another class group at the same class level.');
// //     }
// //     const updated = await tx.enrollment.update({
// //       where: { id },
// //       data: { classGroupId: destination.id },
// //       include: enrollmentIncludes,
// //     });
// //     await tx.auditLog.create({
// //       data: auditData(actorId, 'ENROLLMENT_CLASS_GROUP_UPDATED', id, snapshot(existing), snapshot(updated), req),
// //     });
// //     return updated;
// //   });
// // }

// export async function updateEnrollmentClassGroup(
//   id,
//   classGroupId,
//   actorId,
//   req,
//   schoolId,
// ) {
//   return prisma.$transaction(async (tx) => {
//     const existing = await tx.enrollment.findFirst({
//       where: { id, schoolId },
//       include: {
//         term: { select: { status: true } },
//         _count: { select: { results: true } }, // classLevelId is already a scalar on existing
//       },
//     });
//     if (!existing)
//       throw httpError(404, "ENROLLMENT_NOT_FOUND", "Enrolment not found.");

//     const destination = await tx.classGroup.findFirst({
//       where: { id: classGroupId, schoolId },
//       select: { id: true, classLevelId: true },
//     });
//     if (!destination)
//       throw httpError(404, "CLASS_GROUP_NOT_FOUND", "Class group not found.");

//     if (existing.classGroupId === destination.id) {
//       return tx.enrollment.findUnique({
//         where: { id },
//         include: enrollmentIncludes,
//       });
//     }
//     if (
//       existing.status !== "ACTIVE" ||
//       !["DRAFT", "OPEN"].includes(existing.term.status) ||
//       existing._count.results > 0
//     ) {
//       throw httpError(
//         409,
//         "ENROLLMENT_STREAM_LOCKED",
//         "Only active enrollments in an open term without assessment results can be moved.",
//       );
//     }
//     if (existing.classLevelId !== destination.classLevelId) {
//       throw httpError(
//         400,
//         "CLASS_LEVEL_MISMATCH",
//         "A student can only be moved to a class group at the same class level.",
//       );
//     }
//     const updated = await tx.enrollment.update({
//       where: { id },
//       data: { classGroupId: destination.id },
//       include: enrollmentIncludes,
//     });
//     await tx.auditLog.create({
//       data: {
//         ...auditData(
//           actorId,
//           "ENROLLMENT_CLASS_GROUP_UPDATED",
//           id,
//           snapshot(existing),
//           snapshot(updated),
//           req,
//         ),
//         schoolId,
//       },
//     });
//     return updated;
//   });
// }

// export async function assignClassGroupBulk(
//   { termId, classGroupId, enrollmentIds },
//   actorId,
//   req,
//   schoolId,
// ) {
//   return prisma.$transaction(async (tx) => {
//     const [term, group] = await Promise.all([
//       tx.term.findFirst({
//         where: { id: termId, schoolId },
//         select: { id: true, status: true },
//       }),
//       tx.classGroup.findFirst({
//         where: { id: classGroupId, schoolId },
//         select: { id: true, name: true, classLevelId: true },
//       }),
//     ]);
//     if (!term)
//       throw httpError(404, "TERM_NOT_FOUND", "Academic term not found.");
//     if (!group)
//       throw httpError(404, "CLASS_GROUP_NOT_FOUND", "Class group not found.");
//     if (!["DRAFT", "OPEN"].includes(term.status)) {
//       throw httpError(
//         409,
//         "TERM_NOT_ACCEPTING_ENROLLMENTS",
//         "Class groups can only be assigned while the term is DRAFT or OPEN.",
//       );
//     }

//     const enrollments = await tx.enrollment.findMany({
//       where: { id: { in: enrollmentIds }, schoolId, termId },
//       include: { _count: { select: { results: true } } },
//     });
//     const found = new Map(enrollments.map((e) => [e.id, e]));
//     const toUpdate = [];
//     const skipped = [];

//     for (const id of enrollmentIds) {
//       const e = found.get(id);
//       let reason = null;
//       if (!e) reason = "ENROLLMENT_NOT_FOUND";
//       else if (e.status !== "ACTIVE") reason = "ENROLLMENT_NOT_ACTIVE";
//       else if (e.classLevelId !== group.classLevelId)
//         reason = "CLASS_LEVEL_MISMATCH";
//       else if (e.classGroupId === group.id) reason = "ALREADY_IN_GROUP";
//       else if (e._count.results > 0) reason = "HAS_RESULTS";
//       if (reason) skipped.push({ enrollmentId: id, reason });
//       else toUpdate.push(e);
//     }
//     if (!toUpdate.length)
//       throw httpError(
//         409,
//         "NO_ELIGIBLE_ENROLLMENTS",
//         "None of the selected students can be assigned to this class group.",
//       );

//     await tx.enrollment.updateMany({
//       where: { id: { in: toUpdate.map((e) => e.id) } },
//       data: { classGroupId: group.id },
//     });
//     await tx.auditLog.createMany({
//       data: toUpdate.map((e) => ({
//         ...auditData(
//           actorId,
//           "ENROLLMENT_CLASS_GROUP_UPDATED",
//           e.id,
//           { classGroupId: e.classGroupId },
//           { classGroupId: group.id },
//           req,
//         ),
//         schoolId,
//       })),
//     });
//     return {
//       summary: { assigned: toUpdate.length, skipped: skipped.length },
//       skipped,
//     };
//   });
// }

// const bulkEligibleStatuses = ["ACTIVE", "COMPLETED", "PROMOTED", "REPEATING"];

// function termComesBefore(sourceTerm, targetTerm) {
//   const sourceYearStart = sourceTerm.academicYear.startDate.getTime();
//   const targetYearStart = targetTerm.academicYear.startDate.getTime();

//   if (sourceYearStart < targetYearStart) return true;
//   if (sourceYearStart > targetYearStart) return false;

//   return sourceTerm.sequence < targetTerm.sequence;
// }

// async function buildBulkEnrollmentPlan(db, data) {
//   const [sourceTerm, targetTerm, sourceClass, targetClass] = await Promise.all([
//     db.term.findUnique({
//       where: { id: data.sourceTermId },
//       include: {
//         academicYear: {
//           select: { id: true, name: true, startDate: true },
//         },
//       },
//     }),
//     db.term.findUnique({
//       where: { id: data.targetTermId },
//       include: {
//         academicYear: {
//           select: { id: true, name: true, startDate: true },
//         },
//       },
//     }),
//     db.classGroup.findUnique({
//       where: { id: data.sourceClassGroupId },
//       include: {
//         classLevel: {
//           select: { id: true, name: true, levelOrder: true },
//         },
//       },
//     }),
//     db.classGroup.findUnique({
//       where: { id: data.targetClassGroupId },
//       include: {
//         classLevel: {
//           select: { id: true, name: true, levelOrder: true },
//         },
//       },
//     }),
//   ]);

//   if (!sourceTerm) {
//     throw httpError(404, "SOURCE_TERM_NOT_FOUND", "Source term not found.");
//   }

//   if (!targetTerm) {
//     throw httpError(
//       404,
//       "TARGET_TERM_NOT_FOUND",
//       "Destination term not found.",
//     );
//   }

//   if (!sourceClass) {
//     throw httpError(
//       404,
//       "SOURCE_CLASS_NOT_FOUND",
//       "Source class group not found.",
//     );
//   }

//   if (!targetClass) {
//     throw httpError(
//       404,
//       "TARGET_CLASS_NOT_FOUND",
//       "Destination class group not found.",
//     );
//   }

//   if (sourceTerm.status === "DRAFT") {
//     throw httpError(
//       409,
//       "SOURCE_TERM_NOT_READY",
//       "The source term is still in draft status.",
//     );
//   }

//   if (!["DRAFT", "OPEN"].includes(targetTerm.status)) {
//     throw httpError(
//       409,
//       "TARGET_TERM_NOT_ACCEPTING_ENROLLMENTS",
//       "The destination term must be in DRAFT or OPEN status.",
//     );
//   }

//   if (!termComesBefore(sourceTerm, targetTerm)) {
//     throw httpError(
//       400,
//       "INVALID_TERM_SEQUENCE",
//       "The destination term must come after the source term.",
//     );
//   }

//   const sourceEnrollments = await db.enrollment.findMany({
//     where: {
//       termId: sourceTerm.id,
//       classGroupId: sourceClass.id,
//     },
//     include: {
//       student: {
//         select: {
//           id: true,
//           admissionNumber: true,
//           firstName: true,
//           middleName: true,
//           lastName: true,
//           status: true,
//         },
//       },
//       nextEnrollment: {
//         select: { id: true },
//       },
//     },
//     orderBy: [
//       { student: { lastName: "asc" } },
//       { student: { firstName: "asc" } },
//     ],
//   });

//   const studentIds = sourceEnrollments.map(
//     (enrollment) => enrollment.studentId,
//   );

//   const existingTargetEnrollments = studentIds.length
//     ? await db.enrollment.findMany({
//         where: {
//           termId: targetTerm.id,
//           studentId: { in: studentIds },
//         },
//         select: { studentId: true },
//       })
//     : [];

//   const targetStudentIds = new Set(
//     existingTargetEnrollments.map((enrollment) => enrollment.studentId),
//   );

//   const eligible = [];
//   const skipped = [];

//   for (const enrollment of sourceEnrollments) {
//     let reason = null;

//     if (!bulkEligibleStatuses.includes(enrollment.status)) {
//       reason = "SOURCE_ENROLLMENT_STATUS";
//     } else if (enrollment.student.status !== "ACTIVE") {
//       reason = "STUDENT_NOT_ACTIVE";
//     } else if (enrollment.nextEnrollment) {
//       reason = "ALREADY_PROGRESSED";
//     } else if (targetStudentIds.has(enrollment.studentId)) {
//       reason = "ALREADY_ENROLLED_IN_TARGET_TERM";
//     }

//     const student = {
//       studentId: enrollment.studentId,
//       admissionNumber: enrollment.student.admissionNumber,
//       firstName: enrollment.student.firstName,
//       middleName: enrollment.student.middleName,
//       lastName: enrollment.student.lastName,
//       previousEnrollmentId: enrollment.id,
//     };

//     if (reason) {
//       skipped.push({
//         ...student,
//         reason,
//       });
//     } else {
//       eligible.push(student);
//     }
//   }

//   return {
//     sourceTerm,
//     targetTerm,
//     sourceClass,
//     targetClass,
//     eligible,
//     skipped,
//   };
// }

// function formatBulkPlan(plan) {
//   return {
//     source: {
//       termId: plan.sourceTerm.id,
//       termName: plan.sourceTerm.name,
//       academicYear: plan.sourceTerm.academicYear.name,
//       classGroupId: plan.sourceClass.id,
//       classGroupName: plan.sourceClass.name,
//       classLevel: plan.sourceClass.classLevel.name,
//     },
//     destination: {
//       termId: plan.targetTerm.id,
//       termName: plan.targetTerm.name,
//       academicYear: plan.targetTerm.academicYear.name,
//       classGroupId: plan.targetClass.id,
//       classGroupName: plan.targetClass.name,
//       classLevel: plan.targetClass.classLevel.name,
//     },
//     summary: {
//       sourceStudents: plan.eligible.length + plan.skipped.length,
//       eligible: plan.eligible.length,
//       skipped: plan.skipped.length,
//     },
//     eligible: plan.eligible,
//     skipped: plan.skipped,
//   };
// }

// export async function previewBulkEnrollment(data) {
//   const plan = await buildBulkEnrollmentPlan(prisma, data);
//   return formatBulkPlan(plan);
// }

// export async function createBulkEnrollments(data, actorId, req) {
//   try {
//     return await prisma.$transaction(
//       async (tx) => {
//         // Recalculate eligibility inside the transaction. Never rely on
//         // an earlier preview as proof that the data is still unchanged.
//         const plan = await buildBulkEnrollmentPlan(tx, data);

//         if (plan.eligible.length === 0) {
//           throw httpError(
//             409,
//             "NO_ELIGIBLE_STUDENTS",
//             "There are no eligible students to enrol.",
//           );
//         }

//         const created = [];

//         for (const candidate of plan.eligible) {
//           const enrollment = await tx.enrollment.create({
//             data: {
//               studentId: candidate.studentId,
//               termId: plan.targetTerm.id,
//               classLevelId: plan.targetClass.classLevelId,
//               classGroupId: plan.targetClass.id,
//               previousEnrollmentId: candidate.previousEnrollmentId,
//             },
//             include: enrollmentIncludes,
//           });

//           await tx.auditLog.create({
//             data: auditData(
//               actorId,
//               "ENROLLMENT_CREATED",
//               enrollment.id,
//               null,
//               snapshot(enrollment),
//               req,
//             ),
//           });

//           created.push(enrollment);
//         }

//         await tx.auditLog.create({
//           data: {
//             actorId,
//             action: "BULK_ENROLLMENT_COMPLETED",
//             entityType: "EnrollmentBulk",
//             entityId: plan.targetTerm.id,
//             oldValues: undefined,
//             newValues: {
//               sourceTermId: plan.sourceTerm.id,
//               sourceClassGroupId: plan.sourceClass.id,
//               targetTermId: plan.targetTerm.id,
//               targetClassGroupId: plan.targetClass.id,
//               createdCount: created.length,
//               skippedCount: plan.skipped.length,
//             },
//             ipAddress: req.ip,
//             userAgent: req.get("user-agent")?.slice(0, 500),
//           },
//         });

//         return {
//           message: "Bulk enrolment completed successfully.",
//           summary: {
//             created: created.length,
//             skipped: plan.skipped.length,
//           },
//           data: created,
//           skipped: plan.skipped,
//         };
//       },
//       {
//         maxWait: 5000,
//         timeout: 20000,
//       },
//     );
//   } catch (error) {
//     handleDatabaseError(error);
//   }
// }

// async function buildSelectedEnrollmentPlan(db, data) {
//   const [targetTerm, targetClass] = await Promise.all([
//     db.term.findUnique({
//       where: { id: data.targetTermId },
//       include: { academicYear: { select: { id: true, name: true } } },
//     }),
//     db.classGroup.findUnique({
//       where: { id: data.targetClassGroupId },
//       include: { classLevel: { select: { id: true, name: true } } },
//     }),
//   ]);

//   if (!targetTerm)
//     throw httpError(
//       404,
//       "TARGET_TERM_NOT_FOUND",
//       "Destination term not found.",
//     );
//   if (!targetClass)
//     throw httpError(
//       404,
//       "TARGET_CLASS_NOT_FOUND",
//       "Destination class group not found.",
//     );
//   if (!["DRAFT", "OPEN"].includes(targetTerm.status)) {
//     throw httpError(
//       409,
//       "TARGET_TERM_NOT_ACCEPTING_ENROLLMENTS",
//       "The destination term must be in DRAFT or OPEN status.",
//     );
//   }

//   const students = await db.student.findMany({
//     where: { id: { in: data.studentIds } },
//     select: {
//       id: true,
//       admissionNumber: true,
//       firstName: true,
//       middleName: true,
//       lastName: true,
//       status: true,
//       enrollments: { where: { termId: targetTerm.id }, select: { id: true } },
//     },
//   });
//   const priorEnrollments = data.studentIds.length
//     ? await db.enrollment.findMany({
//         where: {
//           studentId: { in: data.studentIds },
//           status: { in: bulkEligibleStatuses },
//         },
//         include: {
//           term: { include: { academicYear: { select: { startDate: true } } } },
//           nextEnrollment: { select: { id: true } },
//         },
//       })
//     : [];
//   const byId = new Map(students.map((student) => [student.id, student]));
//   const priorByStudent = new Map();
//   for (const previous of priorEnrollments) {
//     if (previous.nextEnrollment || !isEarlierTerm(previous, targetTerm))
//       continue;
//     const current = priorByStudent.get(previous.studentId);
//     const previousYear = previous.term.academicYear.startDate.getTime();
//     const currentYear =
//       current?.term.academicYear.startDate.getTime() ?? -Infinity;
//     if (
//       !current ||
//       previousYear > currentYear ||
//       (previousYear === currentYear &&
//         previous.term.sequence > current.term.sequence)
//     ) {
//       priorByStudent.set(previous.studentId, previous);
//     }
//   }
//   const eligible = [];
//   const skipped = [];

//   for (const studentId of data.studentIds) {
//     const student = byId.get(studentId);
//     if (!student) {
//       skipped.push({ studentId, reason: "STUDENT_NOT_FOUND" });
//       continue;
//     }
//     const row = {
//       studentId: student.id,
//       admissionNumber: student.admissionNumber,
//       firstName: student.firstName,
//       middleName: student.middleName,
//       lastName: student.lastName,
//       ...(priorByStudent.has(student.id)
//         ? { previousEnrollmentId: priorByStudent.get(student.id).id }
//         : {}),
//     };
//     const reason =
//       student.status !== "ACTIVE"
//         ? "STUDENT_NOT_ACTIVE"
//         : student.enrollments.length
//           ? "ALREADY_ENROLLED_IN_TARGET_TERM"
//           : null;
//     if (reason) skipped.push({ ...row, reason });
//     else eligible.push(row);
//   }

//   return { targetTerm, targetClass, eligible, skipped };
// }

// function formatSelectedEnrollmentPlan(plan) {
//   return {
//     destination: {
//       termId: plan.targetTerm.id,
//       termName: plan.targetTerm.name,
//       academicYear: plan.targetTerm.academicYear.name,
//       classGroupId: plan.targetClass.id,
//       classGroupName: plan.targetClass.name,
//       classLevel: plan.targetClass.classLevel.name,
//     },
//     summary: {
//       selected: plan.eligible.length + plan.skipped.length,
//       eligible: plan.eligible.length,
//       skipped: plan.skipped.length,
//     },
//     eligible: plan.eligible,
//     skipped: plan.skipped,
//   };
// }

// export async function previewSelectedBulkEnrollment(data) {
//   return formatSelectedEnrollmentPlan(
//     await buildSelectedEnrollmentPlan(prisma, data),
//   );
// }

// export async function createSelectedBulkEnrollments(data, actorId, req) {
//   try {
//     return await prisma.$transaction(
//       async (tx) => {
//         const plan = await buildSelectedEnrollmentPlan(tx, data);
//         if (!plan.eligible.length) {
//           throw httpError(
//             409,
//             "NO_ELIGIBLE_STUDENTS",
//             "There are no eligible students to enrol.",
//           );
//         }
//         const created = [];
//         for (const candidate of plan.eligible) {
//           const enrollment = await tx.enrollment.create({
//             data: {
//               studentId: candidate.studentId,
//               termId: plan.targetTerm.id,
//               classLevelId: plan.targetClass.classLevelId,
//               classGroupId: plan.targetClass.id,
//               ...(candidate.previousEnrollmentId
//                 ? { previousEnrollmentId: candidate.previousEnrollmentId }
//                 : {}),
//             },
//             include: enrollmentIncludes,
//           });
//           await tx.auditLog.create({
//             data: auditData(
//               actorId,
//               "ENROLLMENT_CREATED",
//               enrollment.id,
//               null,
//               snapshot(enrollment),
//               req,
//             ),
//           });
//           created.push(enrollment);
//         }
//         await tx.auditLog.create({
//           data: {
//             actorId,
//             action: "BULK_ENROLLMENT_COMPLETED",
//             entityType: "EnrollmentBulk",
//             entityId: plan.targetTerm.id,
//             newValues: {
//               targetTermId: plan.targetTerm.id,
//               targetClassGroupId: plan.targetClass.id,
//               createdCount: created.length,
//               skippedCount: plan.skipped.length,
//             },
//             ipAddress: req.ip,
//             userAgent: req.get("user-agent")?.slice(0, 500),
//           },
//         });
//         return {
//           message: "Selected students enrolled successfully.",
//           summary: { created: created.length, skipped: plan.skipped.length },
//           data: created,
//           skipped: plan.skipped,
//         };
//       },
//       { maxWait: 5000, timeout: 20000 },
//     );
//   } catch (error) {
//     handleDatabaseError(error);
//   }
// }



import { prisma } from '../../lib/prisma.js';

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

const OPEN_TERM_STATUSES = ['DRAFT', 'OPEN'];
const PROGRESSION_STATUSES = ['ACTIVE', 'COMPLETED', 'PROMOTED', 'REPEATING'];
const BULK_TX_OPTIONS = { maxWait: 5000, timeout: 20000 };

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function auditData(actorId, action, entityId, oldValues, newValues, req, schoolId) {
  return {
    actorId,
    action,
    entityType: 'Enrollment',
    entityId,
    oldValues: oldValues ?? undefined,
    newValues: newValues ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
    schoolId
  };
}

function snapshot(enrollment) {
  return {
    studentId: enrollment.studentId,
    termId: enrollment.termId,
    classLevelId: enrollment.classLevelId,
    classGroupId: enrollment.classGroupId,
    status: enrollment.status,
    previousEnrollmentId: enrollment.previousEnrollmentId
  };
}

function handleDatabaseError(error) {
  if (error.code === 'P2002') {
    throw httpError(
      409,
      'ENROLLMENT_ALREADY_EXISTS',
      'This student already has an enrolment for the selected term, or the previous enrolment is already linked.'
    );
  }
  throw error;
}

const studentSelect = {
  id: true,
  admissionNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  status: true
};

const enrollmentIncludes = {
  _count: { select: { results: true } },
  student: { select: studentSelect },
  term: {
    select: {
      id: true,
      name: true,
      sequence: true,
      status: true,
      startDate: true,
      endDate: true,
      academicYear: { select: { id: true, name: true, startDate: true, endDate: true } }
    }
  },
  classGroup: {
    select: {
      id: true,
      name: true,
      classLevelId: true,
      classLevel: { select: { id: true, name: true, levelOrder: true } }
    }
  },
  classLevel: { select: { id: true, name: true, levelOrder: true } },
  previousEnrollment: { select: { id: true, termId: true, classGroupId: true, status: true } }
};

/** True when `earlier` (a term with academicYear.startDate) comes before `later`. */
function isEarlierTerm(earlier, later) {
  const earlierYear = earlier.academicYear.startDate.getTime();
  const laterYear = later.academicYear.startDate.getTime();
  if (earlierYear !== laterYear) return earlierYear < laterYear;
  return earlier.sequence < later.sequence;
}

function auditBulk(actorId, schoolId, req, entityId, newValues) {
  return {
    actorId,
    action: 'BULK_ENROLLMENT_COMPLETED',
    entityType: 'EnrollmentBulk',
    entityId,
    newValues,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
    schoolId
  };
}

// ---------------------------------------------------------------------------
// Single enrollment
// ---------------------------------------------------------------------------

export async function createEnrollment(data, actorId, req, schoolId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: data.studentId, schoolId },
        select: { id: true, status: true }
      });
      if (!student) throw httpError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
      if (student.status !== 'ACTIVE') {
        throw httpError(409, 'STUDENT_NOT_ACTIVE', 'Only active students can be enrolled.');
      }

      const classLevel = await tx.classLevel.findFirst({
        where: { id: data.classLevelId, schoolId },
        select: { id: true }
      });
      if (!classLevel) throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found for this school.');

      const term = await tx.term.findFirst({
        where: { id: data.termId, schoolId },
        include: { academicYear: { select: { id: true, startDate: true, endDate: true } } }
      });
      if (!term) throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
      if (!OPEN_TERM_STATUSES.includes(term.status)) {
        throw httpError(409, 'TERM_NOT_ACCEPTING_ENROLLMENTS', 'Enrolments can only be created for terms in DRAFT or OPEN status.');
      }

      let classGroup = null;
      if (data.classGroupId) {
        classGroup = await tx.classGroup.findFirst({
          where: { id: data.classGroupId, schoolId },
          select: { id: true, classLevelId: true }
        });
        if (!classGroup) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
        if (classGroup.classLevelId !== classLevel.id) {
          throw httpError(400, 'CLASS_LEVEL_MISMATCH', 'The class group must belong to the selected class level.');
        }
      }

      let previousEnrollmentId = null;
      if (data.previousEnrollmentId) {
        const previous = await tx.enrollment.findFirst({
          where: { id: data.previousEnrollmentId, schoolId },
          include: {
            term: { include: { academicYear: { select: { startDate: true } } } },
            nextEnrollment: { select: { id: true } }
          }
        });
        if (!previous) throw httpError(404, 'PREVIOUS_ENROLLMENT_NOT_FOUND', 'Previous enrolment not found.');
        if (previous.studentId !== student.id) {
          throw httpError(400, 'ENROLLMENT_STUDENT_MISMATCH', 'The previous enrolment belongs to a different student.');
        }
        if (previous.nextEnrollment) {
          throw httpError(409, 'PREVIOUS_ENROLLMENT_ALREADY_LINKED', 'The previous enrolment already has a subsequent enrolment.');
        }
        if (!isEarlierTerm(previous.term, term)) {
          throw httpError(400, 'INVALID_ENROLLMENT_SEQUENCE', 'The previous enrolment must belong to an earlier academic term.');
        }
        if (!PROGRESSION_STATUSES.includes(previous.status)) {
          throw httpError(409, 'PREVIOUS_ENROLLMENT_STATUS_INVALID', 'The previous enrolment status does not allow progression.');
        }
        previousEnrollmentId = previous.id;
      }

      const enrollment = await tx.enrollment.create({
        data: {
          studentId: student.id,
          termId: term.id,
          classLevelId: classLevel.id,
          classGroupId: classGroup?.id ?? null,
          schoolId,
          ...(previousEnrollmentId ? { previousEnrollmentId } : {})
        },
        include: enrollmentIncludes
      });

      await tx.auditLog.create({
        data: auditData(actorId, 'ENROLLMENT_CREATED', enrollment.id, null, snapshot(enrollment), req, schoolId)
      });
      return enrollment;
    });
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function listEnrollments(filters, schoolId) {
  const { page, limit, studentId, termId, classGroupId, classLevelId, unassigned, status, search } = filters;

  // Every word typed must match at least one name field or the admission number.
  const tokens = (search || '').trim().split(/\s+/).filter(Boolean);
  const searchFilter = tokens.length
    ? {
        student: {
          is: {
            AND: tokens.map((token) => ({
              OR: ['admissionNumber', 'firstName', 'middleName', 'lastName'].map((field) => ({
                [field]: { contains: token, mode: 'insensitive' }
              }))
            }))
          }
        }
      }
    : {};

  const where = {
    schoolId,
    ...(studentId ? { studentId } : {}),
    ...(termId ? { termId } : {}),
    ...(classLevelId ? { classLevelId } : {}),
    ...(unassigned ? { classGroupId: null } : classGroupId ? { classGroupId } : {}),
    ...(status ? { status } : {}),
    ...searchFilter
  };

  const [enrollments, total] = await prisma.$transaction([
    prisma.enrollment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: { ...enrollmentIncludes, nextEnrollment: { select: { id: true } } }
    }),
    prisma.enrollment.count({ where })
  ]);

  return {
    data: enrollments,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function getEnrollmentById(id, schoolId) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id, schoolId },
    include: {
      ...enrollmentIncludes,
      nextEnrollment: { select: { id: true, termId: true, classGroupId: true, status: true, createdAt: true } }
    }
  });
  if (!enrollment) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Enrolment not found.');
  return enrollment;
}

export async function updateEnrollmentStatus(id, status, actorId, req, schoolId) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enrollment.findFirst({ where: { id, schoolId } });
    if (!existing) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Enrolment not found.');

    if (existing.status === status) {
      return tx.enrollment.findUnique({ where: { id }, include: enrollmentIncludes });
    }

    const updated = await tx.enrollment.update({ where: { id }, data: { status }, include: enrollmentIncludes });
    await tx.auditLog.create({
      data: auditData(actorId, 'ENROLLMENT_STATUS_UPDATED', id, snapshot(existing), snapshot(updated), req, schoolId)
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Class group assignment (single and bulk)
// ---------------------------------------------------------------------------

export async function updateEnrollmentClassGroup(id, classGroupId, actorId, req, schoolId) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enrollment.findFirst({
      where: { id, schoolId },
      include: {
        term: { select: { status: true } },
        _count: { select: { results: true } }
      }
    });
    if (!existing) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Enrolment not found.');

    const destination = await tx.classGroup.findFirst({
      where: { id: classGroupId, schoolId },
      select: { id: true, classLevelId: true }
    });
    if (!destination) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');

    if (existing.classGroupId === destination.id) {
      return tx.enrollment.findUnique({ where: { id }, include: enrollmentIncludes });
    }
    if (
      existing.status !== 'ACTIVE' ||
      !OPEN_TERM_STATUSES.includes(existing.term.status) ||
      existing._count.results > 0
    ) {
      throw httpError(
        409,
        'ENROLLMENT_STREAM_LOCKED',
        'Only active enrollments in an open term without assessment results can be moved to another class group.'
      );
    }
    if (existing.classLevelId !== destination.classLevelId) {
      throw httpError(400, 'CLASS_LEVEL_MISMATCH', 'A student can only be placed in a class group at their class level.');
    }

    const updated = await tx.enrollment.update({
      where: { id },
      data: { classGroupId: destination.id },
      include: enrollmentIncludes
    });
    await tx.auditLog.create({
      data: auditData(actorId, 'ENROLLMENT_CLASS_GROUP_UPDATED', id, snapshot(existing), snapshot(updated), req, schoolId)
    });
    return updated;
  });
}

/**
 * Place many existing enrollments (one term) into a single class group.
 * Ineligible enrollments are skipped and reported rather than failing the batch.
 */
export async function assignClassGroupBulk({ termId, classGroupId, enrollmentIds }, actorId, req, schoolId) {
  const uniqueIds = [...new Set(enrollmentIds)];

  return prisma.$transaction(async (tx) => {
    const [term, group] = await Promise.all([
      tx.term.findFirst({ where: { id: termId, schoolId }, select: { id: true, status: true } }),
      tx.classGroup.findFirst({ where: { id: classGroupId, schoolId }, select: { id: true, classLevelId: true } })
    ]);
    if (!term) throw httpError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
    if (!group) throw httpError(404, 'CLASS_GROUP_NOT_FOUND', 'Class group not found.');
    if (!OPEN_TERM_STATUSES.includes(term.status)) {
      throw httpError(409, 'TERM_NOT_ACCEPTING_ENROLLMENTS', 'Class groups can only be assigned while the term is DRAFT or OPEN.');
    }

    const enrollments = await tx.enrollment.findMany({
      where: { id: { in: uniqueIds }, schoolId, termId },
      include: { _count: { select: { results: true } } }
    });
    const byId = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));

    const eligible = [];
    const skipped = [];
    for (const id of uniqueIds) {
      const enrollment = byId.get(id);
      let reason = null;
      if (!enrollment) reason = 'ENROLLMENT_NOT_FOUND';
      else if (enrollment.status !== 'ACTIVE') reason = 'ENROLLMENT_NOT_ACTIVE';
      else if (enrollment.classLevelId !== group.classLevelId) reason = 'CLASS_LEVEL_MISMATCH';
      else if (enrollment.classGroupId === group.id) reason = 'ALREADY_IN_GROUP';
      else if (enrollment._count.results > 0) reason = 'HAS_RESULTS';

      if (reason) skipped.push({ enrollmentId: id, reason });
      else eligible.push(enrollment);
    }

    if (!eligible.length) {
      throw httpError(409, 'NO_ELIGIBLE_ENROLLMENTS', 'None of the selected students can be assigned to this class group.');
    }

    await tx.enrollment.updateMany({
      where: { id: { in: eligible.map((enrollment) => enrollment.id) }, schoolId },
      data: { classGroupId: group.id }
    });
    await tx.auditLog.createMany({
      data: eligible.map((enrollment) =>
        auditData(
          actorId,
          'ENROLLMENT_CLASS_GROUP_UPDATED',
          enrollment.id,
          { classGroupId: enrollment.classGroupId },
          { classGroupId: group.id },
          req,
          schoolId
        )
      )
    });
    await tx.auditLog.create({
      data: auditBulk(actorId, schoolId, req, term.id, {
        action: 'BULK_CLASS_GROUP_ASSIGNMENT',
        termId: term.id,
        classGroupId: group.id,
        assignedCount: eligible.length,
        skippedCount: skipped.length
      })
    });

    return {
      message: 'Class group assigned successfully.',
      summary: { assigned: eligible.length, skipped: skipped.length },
      skipped
    };
  }, BULK_TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Shared bulk creation
// ---------------------------------------------------------------------------

async function createEnrollmentsFromPlan(tx, plan, actorId, req, schoolId, bulkValues) {
  if (!plan.eligible.length) {
    throw httpError(409, 'NO_ELIGIBLE_STUDENTS', 'There are no eligible students to enrol.');
  }

  const created = [];
  for (const candidate of plan.eligible) {
    const enrollment = await tx.enrollment.create({
      data: {
        studentId: candidate.studentId,
        termId: plan.targetTerm.id,
        classLevelId: plan.targetClass.classLevelId,
        classGroupId: plan.targetClass.id,
        schoolId,
        ...(candidate.previousEnrollmentId ? { previousEnrollmentId: candidate.previousEnrollmentId } : {})
      },
      include: enrollmentIncludes
    });
    await tx.auditLog.create({
      data: auditData(actorId, 'ENROLLMENT_CREATED', enrollment.id, null, snapshot(enrollment), req, schoolId)
    });
    created.push(enrollment);
  }

  await tx.auditLog.create({
    data: auditBulk(actorId, schoolId, req, plan.targetTerm.id, {
      ...bulkValues,
      targetTermId: plan.targetTerm.id,
      targetClassGroupId: plan.targetClass.id,
      createdCount: created.length,
      skippedCount: plan.skipped.length
    })
  });
  return created;
}

async function loadTermAndGroup(db, termId, classGroupId, schoolId, labels) {
  const [term, group] = await Promise.all([
    db.term.findFirst({
      where: { id: termId, schoolId },
      include: { academicYear: { select: { id: true, name: true, startDate: true } } }
    }),
    db.classGroup.findFirst({
      where: { id: classGroupId, schoolId },
      include: { classLevel: { select: { id: true, name: true, levelOrder: true } } }
    })
  ]);
  if (!term) throw httpError(404, labels.termCode, labels.termMessage);
  if (!group) throw httpError(404, labels.classCode, labels.classMessage);
  return { term, group };
}

function destinationSummary(term, group) {
  return {
    termId: term.id,
    termName: term.name,
    academicYear: term.academicYear.name,
    classGroupId: group.id,
    classGroupName: group.name,
    classLevel: group.classLevel.name
  };
}

// ---------------------------------------------------------------------------
// Bulk progression: whole class, term to term
// ---------------------------------------------------------------------------

async function buildBulkEnrollmentPlan(db, data, schoolId) {
  const [source, target] = await Promise.all([
    loadTermAndGroup(db, data.sourceTermId, data.sourceClassGroupId, schoolId, {
      termCode: 'SOURCE_TERM_NOT_FOUND',
      termMessage: 'Source term not found.',
      classCode: 'SOURCE_CLASS_NOT_FOUND',
      classMessage: 'Source class group not found.'
    }),
    loadTermAndGroup(db, data.targetTermId, data.targetClassGroupId, schoolId, {
      termCode: 'TARGET_TERM_NOT_FOUND',
      termMessage: 'Destination term not found.',
      classCode: 'TARGET_CLASS_NOT_FOUND',
      classMessage: 'Destination class group not found.'
    })
  ]);
  const { term: sourceTerm, group: sourceClass } = source;
  const { term: targetTerm, group: targetClass } = target;

  if (sourceTerm.status === 'DRAFT') {
    throw httpError(409, 'SOURCE_TERM_NOT_READY', 'The source term is still in draft status.');
  }
  if (!OPEN_TERM_STATUSES.includes(targetTerm.status)) {
    throw httpError(409, 'TARGET_TERM_NOT_ACCEPTING_ENROLLMENTS', 'The destination term must be in DRAFT or OPEN status.');
  }
  if (!isEarlierTerm(sourceTerm, targetTerm)) {
    throw httpError(400, 'INVALID_TERM_SEQUENCE', 'The destination term must come after the source term.');
  }

  const sourceEnrollments = await db.enrollment.findMany({
    where: { schoolId, termId: sourceTerm.id, classGroupId: sourceClass.id },
    include: {
      student: { select: studentSelect },
      nextEnrollment: { select: { id: true } }
    },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }]
  });

  const studentIds = sourceEnrollments.map((enrollment) => enrollment.studentId);
  const existingTarget = studentIds.length
    ? await db.enrollment.findMany({
        where: { schoolId, termId: targetTerm.id, studentId: { in: studentIds } },
        select: { studentId: true }
      })
    : [];
  const alreadyInTarget = new Set(existingTarget.map((enrollment) => enrollment.studentId));

  const eligible = [];
  const skipped = [];
  for (const enrollment of sourceEnrollments) {
    let reason = null;
    if (!PROGRESSION_STATUSES.includes(enrollment.status)) reason = 'SOURCE_ENROLLMENT_STATUS';
    else if (enrollment.student.status !== 'ACTIVE') reason = 'STUDENT_NOT_ACTIVE';
    else if (enrollment.nextEnrollment) reason = 'ALREADY_PROGRESSED';
    else if (alreadyInTarget.has(enrollment.studentId)) reason = 'ALREADY_ENROLLED_IN_TARGET_TERM';

    const row = {
      studentId: enrollment.studentId,
      admissionNumber: enrollment.student.admissionNumber,
      firstName: enrollment.student.firstName,
      middleName: enrollment.student.middleName,
      lastName: enrollment.student.lastName,
      previousEnrollmentId: enrollment.id
    };
    if (reason) skipped.push({ ...row, reason });
    else eligible.push(row);
  }

  return { sourceTerm, targetTerm, sourceClass, targetClass, eligible, skipped };
}

function formatBulkPlan(plan) {
  return {
    source: destinationSummary(plan.sourceTerm, plan.sourceClass),
    destination: destinationSummary(plan.targetTerm, plan.targetClass),
    summary: {
      sourceStudents: plan.eligible.length + plan.skipped.length,
      eligible: plan.eligible.length,
      skipped: plan.skipped.length
    },
    eligible: plan.eligible,
    skipped: plan.skipped
  };
}

export async function previewBulkEnrollment(data, schoolId) {
  return formatBulkPlan(await buildBulkEnrollmentPlan(prisma, data, schoolId));
}

export async function createBulkEnrollments(data, actorId, req, schoolId) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Recalculate inside the transaction; never trust an earlier preview.
      const plan = await buildBulkEnrollmentPlan(tx, data, schoolId);
      const created = await createEnrollmentsFromPlan(tx, plan, actorId, req, schoolId, {
        sourceTermId: plan.sourceTerm.id,
        sourceClassGroupId: plan.sourceClass.id
      });
      return {
        message: 'Bulk enrolment completed successfully.',
        summary: { created: created.length, skipped: plan.skipped.length },
        data: created,
        skipped: plan.skipped
      };
    }, BULK_TX_OPTIONS);
  } catch (error) {
    handleDatabaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Selected students: enroll hand-picked students who are not yet in the term
// ---------------------------------------------------------------------------

async function buildSelectedEnrollmentPlan(db, data, schoolId) {
  const studentIds = [...new Set(data.studentIds)];
  const { term: targetTerm, group: targetClass } = await loadTermAndGroup(db, data.targetTermId, data.targetClassGroupId, schoolId, {
    termCode: 'TARGET_TERM_NOT_FOUND',
    termMessage: 'Destination term not found.',
    classCode: 'TARGET_CLASS_NOT_FOUND',
    classMessage: 'Destination class group not found.'
  });
  if (!OPEN_TERM_STATUSES.includes(targetTerm.status)) {
    throw httpError(409, 'TARGET_TERM_NOT_ACCEPTING_ENROLLMENTS', 'The destination term must be in DRAFT or OPEN status.');
  }

  const [students, priorEnrollments] = await Promise.all([
    db.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { ...studentSelect, enrollments: { where: { termId: targetTerm.id }, select: { id: true } } }
    }),
    db.enrollment.findMany({
      where: { schoolId, studentId: { in: studentIds }, status: { in: PROGRESSION_STATUSES } },
      include: {
        term: { include: { academicYear: { select: { startDate: true } } } },
        nextEnrollment: { select: { id: true } }
      }
    })
  ]);

  const studentsById = new Map(students.map((student) => [student.id, student]));

  // Latest earlier enrolment per student that has not progressed yet.
  const priorByStudent = new Map();
  for (const previous of priorEnrollments) {
    if (previous.nextEnrollment || !isEarlierTerm(previous.term, targetTerm)) continue;
    const current = priorByStudent.get(previous.studentId);
    if (!current || isEarlierTerm(current.term, previous.term)) priorByStudent.set(previous.studentId, previous);
  }

  const eligible = [];
  const skipped = [];
  for (const studentId of studentIds) {
    const student = studentsById.get(studentId);
    if (!student) {
      skipped.push({ studentId, reason: 'STUDENT_NOT_FOUND' });
      continue;
    }
    const row = {
      studentId: student.id,
      admissionNumber: student.admissionNumber,
      firstName: student.firstName,
      middleName: student.middleName,
      lastName: student.lastName,
      ...(priorByStudent.has(student.id) ? { previousEnrollmentId: priorByStudent.get(student.id).id } : {})
    };
    const reason =
      student.status !== 'ACTIVE'
        ? 'STUDENT_NOT_ACTIVE'
        : student.enrollments.length
          ? 'ALREADY_ENROLLED_IN_TARGET_TERM'
          : null;
    if (reason) skipped.push({ ...row, reason });
    else eligible.push(row);
  }

  return { targetTerm, targetClass, eligible, skipped };
}

function formatSelectedEnrollmentPlan(plan) {
  return {
    destination: destinationSummary(plan.targetTerm, plan.targetClass),
    summary: {
      selected: plan.eligible.length + plan.skipped.length,
      eligible: plan.eligible.length,
      skipped: plan.skipped.length
    },
    eligible: plan.eligible,
    skipped: plan.skipped
  };
}

export async function previewSelectedBulkEnrollment(data, schoolId) {
  return formatSelectedEnrollmentPlan(await buildSelectedEnrollmentPlan(prisma, data, schoolId));
}

export async function createSelectedBulkEnrollments(data, actorId, req, schoolId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const plan = await buildSelectedEnrollmentPlan(tx, data, schoolId);
      const created = await createEnrollmentsFromPlan(tx, plan, actorId, req, schoolId, { mode: 'SELECTED' });
      return {
        message: 'Selected students enrolled successfully.',
        summary: { created: created.length, skipped: plan.skipped.length },
        data: created,
        skipped: plan.skipped
      };
    }, BULK_TX_OPTIONS);
  } catch (error) {
    handleDatabaseError(error);
  }
}