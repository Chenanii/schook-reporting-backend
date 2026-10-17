import { z } from 'zod';

const identifierSchema = z.string().trim().min(3).max(254).refine(
  (value) => value.includes('@')
    ? z.string().email().safeParse(value).success
    : value.replace(/\D/g, '').length >= 7,
  'Enter a valid email address or phone number.',
);

export const requestParentPortalVerificationSchema = z.object({
  identifier: identifierSchema,
});

export const createParentPortalAccountSchema = z.object({
  challengeId: z.string().uuid(),
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
  password: z.string().min(12).max(128),
});
