
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_NAME: z.string().default('School Reporting System'),

  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z.enum(['true', 'false']).default('false'),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),

  TEXTBEE_API_KEY: z.string().optional(),
  TEXTBEE_DEVICE_ID: z.string().optional(),
  TEXTBEE_API_BASE_URL: z.string().url().default('https://api.textbee.dev/api/v1'),
  TEXTBEE_DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,3}$/).default('265'),
  PARENT_PORTAL_OTP_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),

  TEACHER_INVITATION_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:5173/accept-invitation'),
  TEACHER_INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(48),
  PASSWORD_RESET_BASE_URL: z.string().url().default('http://localhost:5173/reset-password'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment configuration:',
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  MAIL_SECURE: parsed.data.MAIL_SECURE === 'true',
  corsOrigins: parsed.data.CORS_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
