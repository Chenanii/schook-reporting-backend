import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default("/api/v1"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
  JWT_EXPIRES_IN: z.string().default("8h"),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  APP_NAME: z.string().default("School Reporting System"),

  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z.enum(["true", "false"]).default("false"),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),

  TEXTBEE_API_KEY: z.string().optional(),
  TEXTBEE_DEVICE_ID: z.string().optional(),
  TEXTBEE_API_BASE_URL: z
    .string()
    .url()
    .default("https://api.textbee.dev/api/v1"),
  TEXTBEE_DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,3}$/)
    .default("265"),
  PARENT_PORTAL_OTP_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(30)
    .default(10),

  TEACHER_INVITATION_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:5173/accept-invitation"),
  TEACHER_INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(48),
  PASSWORD_RESET_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:5173/reset-password"),
  PAYCHANGU_MODE: z.enum(["test", "live"]).default("test"),
  // These values come from the backend .env file; never hardcode credentials here.
  PAYCHANGU_SECRET_KEY: z.string().optional(),
  PAYCHANGU_WEBHOOK_SECRET: z.string().optional(),
  PAYCHANGU_CALLBACK_URL: z
    .string()
    .url()
    .default("http://localhost:4000/api/v1/subscriptions/paychangu/callback"),
  PAYCHANGU_RETURN_URL: z
    .string()
    .url()
    .default("http://localhost:5173/subscriptions"),
}).superRefine((config, context) => {
  if (config.NODE_ENV !== 'production') return;
  for (const key of ['PAYCHANGU_CALLBACK_URL', 'PAYCHANGU_RETURN_URL']) {
    const url = new URL(config[key]);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      context.addIssue({
        code: 'custom', path: [key],
        message: 'Use a publicly reachable HTTPS URL in production.'
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  MAIL_SECURE: parsed.data.MAIL_SECURE === "true",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
