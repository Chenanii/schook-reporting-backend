import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import {
  reconcilePendingSubscriptionPayments,
  sendWeeklyTermExpiryReminders
} from './modules/subscriptions/subscriptions.service.js';

const server = app.listen(env.PORT, () => {
  console.log(`School Reporting API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Verify unfinished payments and process trial expirations at startup and once per hour.
void reconcilePendingSubscriptionPayments();
const paymentReconciliationTimer = setInterval(() => {
  void reconcilePendingSubscriptionPayments();
}, 60 * 60 * 1000);
paymentReconciliationTimer.unref();

// Run daily; the database timestamp ensures each school gets at most one email per week.
void sendWeeklyTermExpiryReminders();
const termReminderTimer = setInterval(() => {
  void sendWeeklyTermExpiryReminders();
}, 24 * 60 * 60 * 1000);
termReminderTimer.unref();

async function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
