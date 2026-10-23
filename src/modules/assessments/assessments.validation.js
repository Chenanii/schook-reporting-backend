import { z } from 'zod';

const assessmentTypes = [
  'COURSEWORK',
  'MID_TERM_EXAM',
  'FINAL_EXAM',
];
const assessmentDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Assessment date is invalid.');
const examTypes = ['MID_TERM_EXAM', 'FINAL_EXAM'];

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(2).max(150),
  assessmentType: z.enum(assessmentTypes),
  assessmentDate: assessmentDateSchema.nullable().optional(),
  termId: z.string().trim().min(1),
  teachingAssignmentId: z.string().trim().min(1),
}).refine((data) => !examTypes.includes(data.assessmentType) || Boolean(data.assessmentDate), {
  message: 'An exam date is required for mid-term and final exams.',
  path: ['assessmentDate'],
});

export const updateAssessmentSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  assessmentType: z.enum(assessmentTypes).optional(),
  assessmentDate: assessmentDateSchema.nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' },
);

export const listAssessmentsSchema = z.object({
  termId: z.string().trim().min(1).optional(),
  subjectId: z.string().trim().min(1).optional(),
  teachingAssignmentId: z.string().trim().min(1).optional(),
  status: z.enum([
    'DRAFT',
    'OPEN',
    'SUBMITTED',
    'APPROVED',
    'LOCKED',
  ]).optional(),
  assessmentType: z.enum(assessmentTypes).optional(),
});
