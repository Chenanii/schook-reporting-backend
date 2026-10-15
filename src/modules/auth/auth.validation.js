import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

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