
import { env } from '../src/config/env.js';
import { sendEmail, verifyMailConnection } from '../src/lib/mailer.js';

try {
  console.log('Checking Gmail SMTP connection...');

  await verifyMailConnection();
  console.log('SMTP connection verified.');

  const result = await sendEmail({
    to: env.MAIL_USER,
    subject: `${env.APP_NAME} - Email Test`,
    text: 'Your school reporting system can now send emails through Gmail.',
    html: `<h2>${env.APP_NAME}</h2><p>Your Gmail SMTP configuration is working.</p>`,
  });

  console.log('Test email accepted by Gmail.');
  console.log('Message ID:', result.messageId);
} catch (error) {
  console.error('Email test failed:', error.message);
  process.exitCode = 1;
}
