import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const behaviorKeys = ['classroomConduct', 'respectResponsibility', 'participation'];
const activityKeys = ['sports', 'arts', 'clubsOther'];
const comments = (keys) => z.object(Object.fromEntries(keys.map((key) => [key, z.string().trim().max(500).optional()]))).strict().optional();

export const reportCardDetailsSchema = z.object({
  behaviorComments: comments(behaviorKeys),
  coCurricularComments: comments(activityKeys),
  promotedTo: z.string().trim().max(120).nullable().optional(),
  promotionRemarks: z.string().trim().max(1000).nullable().optional(),
}).strict();

export async function saveReportCardDetails({ enrollmentId, schoolId, reportType, userId, role, data }) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, schoolId },
    select: { id: true, classGroupId: true, term: { select: { academicYearId: true } } },
  });
  if (!enrollment) {
    const error = new Error('Student enrollment not found.');
    error.statusCode = 404; error.code = 'ENROLLMENT_NOT_FOUND'; throw error;
  }
  if (['TEACHER', 'FORM_TUTOR'].includes(role)) {
    const assignment = enrollment.classGroupId && await prisma.formTutorAssignment.findFirst({
      where: { classGroupId: enrollment.classGroupId, academicYearId: enrollment.term.academicYearId, schoolId, teacher: { userId } },
      select: { id: true },
    });
    if (!assignment) {
      const error = new Error('Only the assigned form tutor can enter these report details.');
      error.statusCode = 403; error.code = 'REPORT_DETAILS_FORBIDDEN'; throw error;
    }
  }
  const parsed = reportCardDetailsSchema.safeParse(data);
  if (!parsed.success) {
    const error = new Error('Enter valid report details.');
    error.statusCode = 400; error.code = 'VALIDATION_ERROR'; error.details = parsed.error.issues; throw error;
  }
  const payload = {
    behaviorComments: parsed.data.behaviorComments || {},
    coCurricularComments: parsed.data.coCurricularComments || {},
    promotedTo: parsed.data.promotedTo || null,
    promotionRemarks: parsed.data.promotionRemarks || null,
  };
  return prisma.reportCardDetails.upsert({
    where: { enrollmentId_reportType: { enrollmentId, reportType } },
    create: { enrollmentId, schoolId, reportType, ...payload },
    update: payload,
    select: { behaviorComments: true, coCurricularComments: true, promotedTo: true, promotionRemarks: true },
  });
}

export function getReportCardDetails(enrollmentIds, reportType) {
  if (!enrollmentIds.length) return Promise.resolve([]);
  return prisma.reportCardDetails.findMany({
    where: { enrollmentId: { in: enrollmentIds }, reportType },
    select: { enrollmentId: true, behaviorComments: true, coCurricularComments: true, promotedTo: true, promotionRemarks: true },
  });
}
