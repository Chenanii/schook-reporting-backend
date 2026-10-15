
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const isConfigured = Boolean(
  env.MAIL_HOST &&
  env.MAIL_USER &&
  env.MAIL_PASSWORD &&
  env.MAIL_FROM
);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_SECURE,
      auth: {
        user: env.MAIL_USER,
        pass: env.MAIL_PASSWORD,
      },
    })
  : null;

export async function verifyMailConnection() {
  if (!transporter) {
    throw new Error(
      'Email is not configured. Check MAIL_HOST, MAIL_USER, MAIL_PASSWORD and MAIL_FROM in .env.'
    );
  }

  await transporter.verify();
  return true;
}

export async function sendEmail({ to, subject, text, html }) {
  if (!transporter) {
    throw new Error(
      'Email is not configured. Check your Gmail SMTP settings in .env.'
    );
  }

  return transporter.sendMail({
    from: {
      name: env.APP_NAME,
      address: env.MAIL_FROM,
    },
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}
