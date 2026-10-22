import { z } from 'zod';

const planFields = {
  code: z.string().trim().min(2).max(50).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  interval: z.enum(['MONTHLY', 'YEARLY']),
  priceMinor: z.number().int().min(0).max(2147483647),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/)),
  trialDays: z.number().int().min(0).max(90).default(14),
  maxStudents: z.number().int().min(1).max(2147483647).nullable().optional(),
  maxStaff: z.number().int().min(1).max(2147483647).nullable().optional(),
  isActive: z.boolean().default(true)
};

const reportSections = z.array(z.enum([
  'studentDetails', 'academicPerformance', 'behaviorDiscipline', 'coCurricular',
  'promotionRemarks', 'gradingKey', 'summary', 'signatures',
])).max(8).refine((items) => new Set(items).size === items.length, 'Report sections must be unique.');
const reportHeaderSections = z.array(z.enum([
  'studentDetails', 'classYear', 'termDates', 'schoolContact',
])).length(3).refine((items) => new Set(items).size === items.length, 'Header sections must be unique.');

export const createPlanSchema = z.object(planFields);
export const updatePlanSchema = z.object(planFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one plan field must be provided.' }
);

export const updateSubscriptionStatusSchema = z.object({
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'PENDING_PAYMENT']),
  currentPeriodEnd: z.union([z.string().datetime().transform((value) => new Date(value)), z.null()]).optional(),
  notes: z.string().trim().max(1000).nullable().optional()
}).refine(
  (data) => data.status !== 'ACTIVE' || (data.currentPeriodEnd instanceof Date && data.currentPeriodEnd > new Date()),
  { message: 'Set a future paid-through date when activating a subscription.', path: ['currentPeriodEnd'] }
);

export const updateSchoolStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'])
});

export const updateSchoolProfileSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).nullable().optional(),
  slug: z.string().trim().toLowerCase().min(2).max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  logoDataUrl: z.string()
    .max(700_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable()
    .optional(),
  secondaryLogoDataUrl: z.string()
    .max(700_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable()
    .optional(),
  classTeacherSignerName: z.string().trim().max(120).nullable().optional(),
  headteacherSignerName: z.string().trim().max(120).nullable().optional(),
  reportDesign: z.object({
    endOfTerm: z.object({
      title: z.string().trim().min(1).max(100),
      showLogo: z.boolean(), showContact: z.boolean(), showSummary: z.boolean(),
      showGradeDescription: z.boolean(), showTeacherComments: z.boolean(), showSignatures: z.boolean(),
      footerText: z.string().trim().max(500),
      sections: reportSections,
      headerSections: reportHeaderSections,
    }).strict(),
    midTerm: z.object({
      title: z.string().trim().min(1).max(100),
      showLogo: z.boolean(), showContact: z.boolean(), showSummary: z.boolean(),
      showGradeDescription: z.boolean(), showSignatures: z.boolean(),
      footerText: z.string().trim().max(500),
      sections: reportSections,
      headerSections: reportHeaderSections,
    }).strict(),
  }).strict().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Provide at least one school field to update.'
});

export const changePlanSchema = z.object({ planId: z.string().min(1) });

export const schoolSignupSchema = z.object({
  schoolName: z.string().trim().min(2).max(160),
  schoolSlug: z.string().trim().toLowerCase().min(2).max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  schoolEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  adminFirstName: z.string().trim().min(1).max(80),
  adminLastName: z.string().trim().min(1).max(80),
  adminEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  adminPassword: z.string().min(12).max(128),
  planId: z.string().min(1)
});
