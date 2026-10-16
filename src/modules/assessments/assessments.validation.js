import { z } from 'zod';

const assessmentTypes = [
  'COURSEWORK',
  'MID_TERM_EXAM',
  'FINAL_EXAM',
];

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(2).max(150),
  assessmentType: z.enum(assessmentTypes),
  maxMark: z.coerce.number().positive().max(100),
  weightPercent: z.coerce.number().min(0).max(60),
  termId: z.string().trim().min(1),
  teachingAssignmentId: z.string().trim().min(1),
}).refine((data) => data.assessmentType === 'FINAL_EXAM'
  ? data.weightPercent === 60
  : data.weightPercent <= 40, {
  message: 'Coursework and mid-term weights must be from 0 to 40%. Final exams have a fixed 60% weight.',
  path: ['weightPercent'],
});

export const updateAssessmentSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  assessmentType: z.enum(assessmentTypes).optional(),
  maxMark: z.coerce.number().positive().max(100).optional(),
  weightPercent: z.coerce.number().min(0).max(60).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' },
).refine((data) => {
  if (data.assessmentType === 'FINAL_EXAM') return data.weightPercent === undefined || data.weightPercent === 60;
  if (data.assessmentType && data.assessmentType !== 'FINAL_EXAM') return data.weightPercent === undefined || data.weightPercent <= 40;
  return true;
}, {
  message: 'Coursework and mid-term weights must be from 0 to 40%. Final exams have a fixed 60% weight.',
  path: ['weightPercent'],
});

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
