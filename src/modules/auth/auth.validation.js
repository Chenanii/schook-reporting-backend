import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(1).max(128)
}).refine((data) => data.identifier || data.email, {
  message: 'Enter your email address or phone number.',
  path: ['identifier']
}).transform(({ identifier, email, password }) => ({
  identifier: identifier ?? email,
  password
}));

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128)
}).refine(
  (data) => data.currentPassword !== data.newPassword,
  {
    message: 'Your new password must differ from your current password.',
    path: ['newPassword']
  }
);