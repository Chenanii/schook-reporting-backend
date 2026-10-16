import { z } from 'zod';

const assessmentTypes = [
  'COURSEWORK',
  'MID_TERM_EXAM',
  'FINAL_EXAM',
];

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(2).max(150),
  assessmentType: z.enum(assessmentTypes),
  termId: z.string().trim().min(1),
  teachingAssignmentId: z.string().trim().min(1),
});

export const updateAssessmentSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  assessmentType: z.enum(assessmentTypes).optional(),
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
