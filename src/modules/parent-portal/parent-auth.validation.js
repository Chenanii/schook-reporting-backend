import { z } from 'zod';
import { normalizeParentIdentifier } from './contact.js';

const identifierSchema = z.string().trim().min(3).max(254).refine(
  (value) => value.includes('@')
    ? z.string().email().safeParse(value).success
    : /^[+\d\s().-]+$/.test(value) && normalizeParentIdentifier(value)?.type === 'phone',
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
