import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../../lib/mailer.js';

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const planSelect = {
  id: true, code: true, name: true, description: true, interval: true,
  priceMinor: true, currency: true, trialDays: true,
  maxStudents: true, maxStaff: true
};

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export async function checkSchoolNameAvailability(name) {
  const slug = slugify(name.trim());
  if (!slug) return { available: false, slug: '', message: 'Enter a school name that can form a workspace URL.' };
  const existing = await prisma.school.findUnique({ where: { slug }, select: { id: true } });
  return {
    available: !existing,
    slug,
    message: existing ? 'This school name is already in use. Try a different name.' : 'This school name is available.'
  };
}

export async function listPublicPlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    select: planSelect,
    orderBy: [{ priceMinor: 'asc' }, { name: 'asc' }]
  });
}

export async function listPlans() {
  return prisma.subscriptionPlan.findMany({
    orderBy: [{ isActive: 'desc' }, { priceMinor: 'asc' }, { name: 'asc' }]
  });
}

export async function listSubscriptions() {
  return prisma.schoolSubscription.findMany({
    include: {
      school: { select: { id: true, name: true, slug: true, email: true, status: true } },
      plan: { select: planSelect }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createPlan(data) {
  return prisma.subscriptionPlan.create({ data });
}

export async function updatePlan(id, data) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'Subscription plan not found.');
  return prisma.subscriptionPlan.update({ where: { id }, data });
}

export async function registerSchool(data) {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: data.planId, isActive: true },
    select: { id: true, trialDays: true, priceMinor: true }
  });
  if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'An active subscription plan is required.');

  const slug = data.schoolSlug || slugify(data.schoolName);
  if (!slug) throw httpError(400, 'INVALID_SCHOOL_NAME', 'Enter a school name that can form a web address.');

  const existing = await prisma.school.findFirst({ where: { slug }, select: { id: true } });
  if (existing) throw httpError(409, 'SCHOOL_SLUG_UNAVAILABLE', 'That school URL is already in use.');

  const existingUser = await prisma.user.findUnique({
    where: { email: data.adminEmail }, select: { id: true }
  });
  if (existingUser) throw httpError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');

  const now = new Date();
  const trialEndsAt = plan.trialDays > 0
    ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
    : null;
  const passwordHash = await bcrypt.hash(data.adminPassword, 12);

  return prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name: data.schoolName,
        slug,
        email: data.schoolEmail,
        status: 'ACTIVE'
      }
    });

    const user = await tx.user.create({
      data: {
        schoolId: school.id,
        email: data.adminEmail,
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
        passwordHash,
        role: 'SCHOOL_ADMIN',
        status: 'ACTIVE'
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true }
    });

    const subscription = await tx.schoolSubscription.create({
      data: {
        schoolId: school.id,
        planId: plan.id,
        status: plan.priceMinor === 0 ? 'ACTIVE' : trialEndsAt ? 'TRIALING' : 'PENDING_PAYMENT',
        currentPeriodStart: now,
        trialEndsAt: plan.priceMinor === 0 ? null : trialEndsAt
      },
      include: { plan: { select: planSelect } }
    });

    await tx.auditLog.create({
      data: {
        schoolId: school.id,
        actorId: user.id,
        action: 'SCHOOL_REGISTERED',
        entityType: 'School',
        entityId: school.id,
        newValues: { name: school.name, slug: school.slug, planId: plan.id, subscriptionStatus: subscription.status }
      }
    });

    return { school, user, subscription };
  });
}

async function findBillableTerm(schoolId, afterDate = new Date()) {
  return prisma.term.findFirst({
    where: { schoolId, endDate: { gte: afterDate }, ...(afterDate ? { startDate: { gt: afterDate } } : {}) },
    orderBy: { startDate: 'asc' },
    select: { id: true, name: true, startDate: true, endDate: true }
  });
}

async function currentOrUpcomingTerm(schoolId) {
  const now = new Date();
  const current = await prisma.term.findFirst({
    where: { schoolId, startDate: { lte: now }, endDate: { gte: now } },
    orderBy: { endDate: 'asc' },
    select: { id: true, name: true, startDate: true, endDate: true }
  });
  return current ?? findBillableTerm(schoolId, new Date(now.getTime() - 1));
}

function termPeriodEnd(term) {
  const end = new Date(term.endDate);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function calendarDaysUntil(dateValue) {
  const today = new Date();
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const endDate = new Date(dateValue);
  const endDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.ceil((endDay - startOfToday) / (24 * 60 * 60 * 1000));
}

export async function getCurrentSubscription(schoolId) {
  if (!schoolId) throw httpError(404, 'SCHOOL_NOT_FOUND', 'No school is linked to this account.');
  const subscriptions = await prisma.schoolSubscription.findMany({
    where: { schoolId },
    include: { plan: { select: planSelect }, billingTerm: { select: { id: true, name: true, startDate: true, endDate: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  const now = new Date();
  const current = subscriptions.find((item) =>
    (item.status === 'TRIALING' && item.trialEndsAt > now) ||
    (['ACTIVE', 'CANCELED'].includes(item.status) &&
      item.currentPeriodStart <= now && (!item.currentPeriodEnd || item.currentPeriodEnd > now))
  ) ?? null;
  const pendingChange = subscriptions.find((item) => item.status === 'PENDING_PAYMENT') ?? null;
  const upcoming = subscriptions.find((item) => item.status === 'ACTIVE' && item.currentPeriodStart > now) ?? null;
  return { current, pendingChange, upcoming, recent: subscriptions };
}

export async function getTermExpiryReminder(schoolId) {
  if (!schoolId) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const term = await prisma.term.findFirst({
    where: {
      schoolId, startDate: { lte: now }, endDate: { gte: today },
      status: { notIn: ['DRAFT', 'CLOSED'] }
    },
    orderBy: { startDate: 'desc' }
  });
  if (!term) return null;

  // A confirmed payment for this academic term means no renewal reminder is needed.
  const paid = await prisma.subscriptionPayment.findFirst({
    where: { schoolId, status: 'SUCCESS', subscription: { billingTermId: term.id } },
    select: { id: true }
  });
  if (paid) return null;

  const subscription = await prisma.schoolSubscription.findFirst({
    where: {
      schoolId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PENDING_PAYMENT'] },
      plan: { priceMinor: { gt: 0 } },
      OR: [{ billingTermId: term.id }, { billingTermId: null }]
    },
    include: {
      plan: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  if (!subscription) return null;
  const termEndDate = term.endDate;
  const daysRemaining = calendarDaysUntil(termEndDate);
  return {
    termName: term.name,
    planName: subscription.plan.name,
    termEndDate,
    daysRemaining,
    showReminder: daysRemaining <= 28 && daysRemaining > 0,
    reportsRestricted: daysRemaining <= 21 && daysRemaining > 0
  };
}

export async function requestPlanChange(schoolId, planId, actorId) {
  if (!schoolId) throw httpError(404, 'SCHOOL_NOT_FOUND', 'No school is linked to this account.');
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { status: true } });
  if (!school || school.status !== 'ACTIVE') {
    throw httpError(403, 'SCHOOL_UNAVAILABLE', 'This school account is unavailable.');
  }
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, isActive: true },
    select: { id: true, priceMinor: true, interval: true }
  });
  if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'An active subscription plan is required.');

  const subscriptions = await prisma.schoolSubscription.findMany({
    where: { schoolId },
    include: { billingTerm: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  const existingRequest = subscriptions.find((item) => item.status === 'PENDING_PAYMENT');
  if (existingRequest?.planId === planId) {
    throw httpError(409, 'PLAN_REQUEST_ALREADY_PENDING', 'This plan is already awaiting payment confirmation.');
  }
  const now = new Date();
  const current = subscriptions.find((item) =>
    (item.status === 'TRIALING' && item.trialEndsAt > now) ||
    (['ACTIVE', 'CANCELED'].includes(item.status) && item.currentPeriodStart <= now && (!item.currentPeriodEnd || item.currentPeriodEnd > now))
  );
  const currentTermEnd = current?.currentPeriodEnd ?? current?.trialEndsAt;
  const renewalWindow = currentTermEnd && currentTermEnd > now && currentTermEnd.getTime() - now.getTime() <= 28 * 24 * 60 * 60 * 1000;
  const renewSamePlan = current?.planId === planId && renewalWindow;
  if (current?.planId === planId && !renewSamePlan) {
    throw httpError(409, 'PLAN_ALREADY_CURRENT', 'This school already has this plan.');
  }

  let billingTerm = null;
  if (plan.priceMinor > 0) {
    billingTerm = renewSamePlan && current.billingTerm
      ? await findBillableTerm(schoolId, current.billingTerm.endDate)
      : current?.billingTerm ?? await currentOrUpcomingTerm(schoolId);
    if (!billingTerm) {
      throw httpError(409, 'ACADEMIC_TERM_REQUIRED', 'Create the current or next academic term before requesting a paid subscription.');
    }
  }

  return prisma.$transaction(async (tx) => {
    if (existingRequest) {
      const openPayment = await tx.subscriptionPayment.findFirst({
        where: { subscriptionId: existingRequest.id, status: 'PENDING' },
        select: { id: true }
      });
      // Do not expire a plan while its hosted checkout can still take payment.
      if (openPayment) {
        throw httpError(409, 'CHECKOUT_PAYMENT_STILL_OPEN', 'Complete or verify the pending checkout before requesting another plan.');
      }
      await tx.schoolSubscription.update({
        where: { id: existingRequest.id },
        data: { status: 'EXPIRED' }
      });
    }
    if (plan.priceMinor === 0) {
      await tx.schoolSubscription.updateMany({
        where: { schoolId, status: { in: ['ACTIVE', 'TRIALING', 'CANCELED'] } },
        data: { status: 'EXPIRED' }
      });
    }
    const requested = await tx.schoolSubscription.create({
      data: {
        schoolId,
        planId,
        ...(billingTerm ? { billingTermId: billingTerm.id, currentPeriodStart: billingTerm.startDate, currentPeriodEnd: termPeriodEnd(billingTerm) } : {}),
        status: plan.priceMinor === 0 ? 'ACTIVE' : 'PENDING_PAYMENT',
        ...(plan.priceMinor === 0 ? { currentPeriodStart: new Date() } : {})
      },
      include: { plan: { select: planSelect } }
    });
    await tx.auditLog.create({
      data: {
        schoolId,
        actorId,
        action: 'SUBSCRIPTION_PLAN_CHANGE_REQUESTED',
        entityType: 'SchoolSubscription',
        entityId: requested.id,
        newValues: { planId, status: requested.status }
      }
    });
    return requested;
  });
}

const paymentSelect = {
  id: true, subscriptionId: true, txRef: true, providerReference: true, status: true, amount: true,
  currency: true, checkoutUrl: true, providerStatus: true, verifiedAt: true,
  createdAt: true, updatedAt: true
};

// Create a PayChangu hosted checkout and persist its unique reference before returning the link.
export async function startSubscriptionCheckout(schoolId, subscriptionId) {
  if (!env.PAYCHANGU_SECRET_KEY) {
    throw httpError(503, 'PAYMENTS_NOT_CONFIGURED', 'PayChangu payments are not configured.');
  }
  const subscription = await prisma.schoolSubscription.findFirst({
    where: { id: subscriptionId, schoolId },
    include: { plan: true, billingTerm: true, school: { select: { name: true, email: true } } }
  });
  if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
  if (subscription.status !== 'PENDING_PAYMENT') {
    throw httpError(409, 'SUBSCRIPTION_NOT_AWAITING_PAYMENT', 'This subscription is not awaiting payment.');
  }
  if (subscription.plan.priceMinor <= 0) {
    throw httpError(400, 'FREE_PLAN_CHECKOUT_UNAVAILABLE', 'Free plans do not require checkout.');
  }

  let billingTerm = subscription.billingTerm;
  if (!billingTerm) {
    billingTerm = await currentOrUpcomingTerm(schoolId);
    if (!billingTerm) {
      throw httpError(409, 'ACADEMIC_TERM_REQUIRED', 'Create the current or next academic term before starting payment.');
    }
    await prisma.schoolSubscription.update({
      where: { id: subscriptionId },
      data: { billingTermId: billingTerm.id, currentPeriodStart: billingTerm.startDate, currentPeriodEnd: termPeriodEnd(billingTerm) }
    });
  }

  const existingPayment = await prisma.subscriptionPayment.findFirst({
    where: { subscriptionId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' }, select: paymentSelect
  });
  if (existingPayment) {
    if (existingPayment.checkoutUrl) return { payment: existingPayment, checkoutUrl: existingPayment.checkoutUrl };
    throw httpError(409, 'CHECKOUT_ALREADY_STARTING', 'This payment checkout is already being prepared. Try again shortly.');
  }

  const txRef = `school-${subscription.schoolId}-${randomUUID()}`;
  // priceMinor uses the same two-decimal convention as the billing UI.
  const amount = subscription.plan.priceMinor / 100;
  const payment = await prisma.subscriptionPayment.create({
    data: {
      subscriptionId, schoolId, planId: subscription.planId, txRef,
      amount: subscription.plan.priceMinor, currency: subscription.plan.currency
    }
  });

  try {
    const response = await fetch('https://api.paychangu.com/payment', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`
      },
      body: JSON.stringify({
        amount: String(amount), currency: subscription.plan.currency, tx_ref: txRef,
        email: subscription.school.email || undefined,
        first_name: subscription.school.name.slice(0, 100),
        callback_url: env.PAYCHANGU_CALLBACK_URL,
        return_url: env.PAYCHANGU_RETURN_URL,
        customization: {
          title: `${subscription.plan.name} subscription`,
          description: `Subscription payment for ${subscription.school.name}`
        },
        meta: { schoolId, subscriptionId, paymentId: payment.id }
      })
    });
    const payload = await response.json();
    const checkoutUrl = payload?.data?.checkout_url;
    if (!response.ok || payload?.status !== 'success' || !checkoutUrl) {
      throw new Error(payload?.message || 'PayChangu could not create a checkout session.');
    }
    const updated = await prisma.subscriptionPayment.update({
      where: { id: payment.id }, data: { checkoutUrl }, select: paymentSelect
    });
    return { payment: updated, checkoutUrl };
  } catch (error) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', providerStatus: 'checkout_creation_failed' }
    });
    throw httpError(502, 'PAYMENT_CHECKOUT_FAILED', error.message || 'Could not start payment checkout.');
  }
}

// PayChangu redirects and webhooks are only hints: confirm every attempt against its API.
export async function verifySubscriptionPayment(txRef) {
  if (!env.PAYCHANGU_SECRET_KEY) throw httpError(503, 'PAYMENTS_NOT_CONFIGURED', 'PayChangu payments are not configured.');
  const payment = await prisma.subscriptionPayment.findUnique({
    where: { txRef }, include: { subscription: { include: { billingTerm: true } }, plan: true }
  });
  if (!payment) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Payment reference was not found.');
  if (payment.status === 'SUCCESS') return payment;

  const response = await fetch(`https://api.paychangu.com/verify-payment/${encodeURIComponent(txRef)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}` }
  });
  const result = await response.json();
  if (!response.ok || result?.status !== 'success' || !result?.data) {
    throw httpError(502, 'PAYMENT_VERIFICATION_FAILED', 'PayChangu could not verify this payment yet.');
  }
  const data = result.data;
  const paidAmountMinor = Math.round(Number(data.amount) * 100);
  const expectedMode = env.PAYCHANGU_MODE === 'test' ? ['test', 'sandbox'] : ['live'];
  const isPaid = String(data.tx_ref) === txRef && String(data.status).toLowerCase() === 'success'
    && data.currency === payment.currency && Number.isFinite(paidAmountMinor)
    && paidAmountMinor >= payment.amount && expectedMode.includes(String(data.mode).toLowerCase());
  const now = new Date();
  const confirmedTerm = isPaid && payment.subscription.status === 'PENDING_PAYMENT'
    ? payment.subscription.billingTerm ?? await currentOrUpcomingTerm(payment.schoolId)
    : null;

  return prisma.$transaction(async (tx) => {
    const current = await tx.subscriptionPayment.findUnique({ where: { id: payment.id } });
    if (current.status === 'SUCCESS') return current;
    const updatedPayment = await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: isPaid ? 'SUCCESS' : String(data.status).toLowerCase() === 'failed' ? 'FAILED' : 'PENDING',
        providerStatus: String(data.status), providerReference: data.reference ? String(data.reference) : null,
        verifiedAt: now,
        // Persist only reconciliation fields; the full provider response includes customer/payment details.
        providerPayload: {
          event_type: data.event_type, mode: data.mode, status: data.status,
          tx_ref: data.tx_ref, amount: data.amount, currency: data.currency,
          reference: data.reference, channel: data.authorization?.channel,
          completed_at: data.authorization?.completed_at
        }
      }
    });
    if (isPaid && payment.subscription.status === 'PENDING_PAYMENT') {
      if (!confirmedTerm) {
        throw httpError(409, 'ACADEMIC_TERM_REQUIRED', 'Payment is confirmed but no academic term is available for activation.');
      }
      if (confirmedTerm.startDate <= now) {
        await tx.schoolSubscription.updateMany({
          where: { schoolId: payment.schoolId, id: { not: payment.subscriptionId }, status: { in: ['ACTIVE', 'TRIALING', 'CANCELED', 'PENDING_PAYMENT'] } },
          data: { status: 'EXPIRED' }
        });
      } else {
        await tx.schoolSubscription.updateMany({
          where: { schoolId: payment.schoolId, id: { not: payment.subscriptionId }, status: 'PENDING_PAYMENT' },
          data: { status: 'EXPIRED' }
        });
      }
      await tx.schoolSubscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'ACTIVE', billingTermId: confirmedTerm.id,
          currentPeriodStart: confirmedTerm.startDate, currentPeriodEnd: termPeriodEnd(confirmedTerm)
        }
      });
      await tx.auditLog.create({
        data: {
          schoolId: payment.schoolId, action: 'SUBSCRIPTION_PAYMENT_CONFIRMED',
          entityType: 'SubscriptionPayment', entityId: payment.id,
          newValues: { txRef, amount: payment.amount, currency: payment.currency, termId: confirmedTerm.id, termName: confirmedTerm.name }
        }
      });
    }
    return updatedPayment;
  });
}

export async function listSchoolPayments(schoolId) {
  return prisma.subscriptionPayment.findMany({
    where: { schoolId }, select: { ...paymentSelect, plan: { select: { name: true, interval: true } } },
    orderBy: { createdAt: 'desc' }, take: 50
  });
}

export async function listAllSubscriptionPayments() {
  return prisma.subscriptionPayment.findMany({
    select: {
      ...paymentSelect,
      school: { select: { id: true, name: true, slug: true, email: true } },
      plan: { select: { name: true, interval: true } }
    }, orderBy: { createdAt: 'desc' }, take: 500
  });
}

let reconciliationInProgress = false;

// Recheck unresolved payments and move paid trials into an explicit payment-request state.
export async function reconcilePendingSubscriptionPayments() {
  if (reconciliationInProgress) return;
  reconciliationInProgress = true;
  try {
    const now = new Date();
    const expiredTrials = await prisma.schoolSubscription.findMany({
      where: { status: 'TRIALING', trialEndsAt: { lte: now } },
      include: { plan: { select: { priceMinor: true } } },
      orderBy: { trialEndsAt: 'asc' }, take: 100
    });

    for (const trial of expiredTrials) {
      await prisma.$transaction(async (tx) => {
        const nextStatus = trial.plan.priceMinor === 0 ? 'ACTIVE' : 'PAST_DUE';
        const transitioned = await tx.schoolSubscription.updateMany({
          where: { id: trial.id, status: 'TRIALING', trialEndsAt: { lte: now } },
          data: { status: nextStatus, ...(nextStatus === 'ACTIVE' ? { trialEndsAt: null } : {}) }
        });
        if (transitioned.count === 0 || nextStatus === 'ACTIVE') return;

        const pending = await tx.schoolSubscription.findFirst({
          where: { schoolId: trial.schoolId, status: 'PENDING_PAYMENT' }, select: { id: true }
        });
        const existingAccess = await tx.schoolSubscription.findFirst({
          where: {
            schoolId: trial.schoolId,
            id: { not: trial.id },
            OR: [
              { status: 'TRIALING', trialEndsAt: { gt: now } },
              { status: 'ACTIVE', OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
              { status: 'CANCELED', currentPeriodEnd: { gt: now } }
            ]
          }, select: { id: true }
        });
        if (!pending && !existingAccess) {
          await tx.schoolSubscription.create({
            data: {
              schoolId: trial.schoolId, planId: trial.planId,
              status: 'PENDING_PAYMENT', currentPeriodStart: now
            }
          });
        }
      });
    }

    const checkedBefore = new Date(now.getTime() - 60 * 60 * 1000);
    const payments = env.PAYCHANGU_SECRET_KEY ? await prisma.subscriptionPayment.findMany({
      where: {
        status: 'PENDING',
        OR: [{ verifiedAt: null }, { verifiedAt: { lte: checkedBefore } }]
      },
      orderBy: [{ verifiedAt: 'asc' }, { createdAt: 'asc' }], take: 100,
      select: { id: true, txRef: true, checkoutUrl: true, createdAt: true }
    }) : [];

    // A session without a checkout URL was never returned to the client; it is safe to close after recovery.
    const orphaned = payments.filter((payment) => !payment.checkoutUrl && payment.createdAt < new Date(now.getTime() - 10 * 60 * 1000));
    if (orphaned.length) {
      await prisma.subscriptionPayment.updateMany({
        where: { id: { in: orphaned.map(({ id }) => id) }, status: 'PENDING', checkoutUrl: null },
        data: { status: 'FAILED', providerStatus: 'checkout_creation_interrupted' }
      });
    }

    const toVerify = payments.filter((payment) => payment.checkoutUrl);
    for (let index = 0; index < toVerify.length; index += 5) {
      await Promise.all(toVerify.slice(index, index + 5).map(async (payment) => {
        try { await verifySubscriptionPayment(payment.txRef); }
        catch (error) {
          console.error(`Could not reconcile PayChangu payment ${payment.txRef}:`, error.code || error.message);
        }
      }));
    }
  } catch (error) {
    console.error('Subscription payment reconciliation failed:', error.code || error.message);
  } finally {
    reconciliationInProgress = false;
  }
}

let termReminderRunInProgress = false;

// Remind schools that have not paid for the current academic term, once per week in its final four weeks.
export async function sendWeeklyTermExpiryReminders() {
  if (termReminderRunInProgress) return;
  termReminderRunInProgress = true;
  const now = new Date();
  const fourWeeksFromNow = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const terms = await prisma.term.findMany({
      where: {
        startDate: { lte: now }, endDate: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), lte: fourWeeksFromNow },
        status: { notIn: ['DRAFT', 'CLOSED'] }
      },
      include: { school: { select: { name: true, users: {
        where: { role: 'SCHOOL_ADMIN', status: 'ACTIVE', email: { not: null } },
        select: { email: true }
      } } } },
      orderBy: { endDate: 'asc' }, take: 250
    });

    for (const term of terms) {
      // Skip the whole term once any successful subscription payment is linked to it.
      const paid = await prisma.subscriptionPayment.findFirst({
        where: { schoolId: term.schoolId, status: 'SUCCESS', subscription: { billingTermId: term.id } },
        select: { id: true }
      });
      if (paid) continue;

      const subscription = await prisma.schoolSubscription.findFirst({
        where: {
          schoolId: term.schoolId,
          status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PENDING_PAYMENT'] },
          plan: { priceMinor: { gt: 0 } },
          AND: [
            { OR: [{ billingTermId: term.id }, { billingTermId: null }] },
            { OR: [{ lastTermReminderSentAt: null }, { lastTermReminderSentAt: { lte: oneWeekAgo } }] }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
      if (!subscription) continue;
      const admins = term.school.users.filter((admin) => admin.email);
      if (!admins.length) continue;
      const claimedAt = new Date();
      const claim = await prisma.schoolSubscription.updateMany({
        where: {
          id: subscription.id,
          AND: [
            { OR: [{ billingTermId: term.id }, { billingTermId: null }] },
            { OR: [{ lastTermReminderSentAt: null }, { lastTermReminderSentAt: { lte: oneWeekAgo } }] }
          ]
        },
        data: { lastTermReminderSentAt: claimedAt }
      });
      if (!claim.count) continue;

      const daysRemaining = Math.max(1, calendarDaysUntil(term.endDate));
      const termName = term.name;
      const subject = `${term.school.name}: payment needed for ${termName} (${daysRemaining} days remaining)`;
      const text = `Hello,\n\nWe have no confirmed subscription payment recorded for ${term.school.name} for ${termName}, which ends on ${term.endDate.toLocaleDateString('en-GB', { timeZone: 'UTC' })} (${daysRemaining} days remaining). Please review the subscription and complete payment if it is still due.\n\nThis reminder is sent once a week during the final four weeks of the academic term.`;
      try {
        await sendEmail({ to: admins.map((admin) => admin.email).join(', '), subject, text });
      } catch (error) {
        await prisma.schoolSubscription.updateMany({
          where: { id: subscription.id, lastTermReminderSentAt: claimedAt },
          data: { lastTermReminderSentAt: subscription.lastTermReminderSentAt }
        });
        console.error(`Could not send term-expiry email for school ${subscription.schoolId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Term-expiry reminder job failed:', error.code || error.message);
  } finally {
    termReminderRunInProgress = false;
  }
}

export async function updateSubscriptionStatus(id, status, periodEnd, notes, actorId) {
  const subscription = await prisma.schoolSubscription.findUnique({ where: { id } });
  if (!subscription) throw httpError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
  return prisma.$transaction(async (tx) => {
    if (status === 'ACTIVE') {
      await tx.schoolSubscription.updateMany({
        where: { schoolId: subscription.schoolId, id: { not: id }, status: { in: ['ACTIVE', 'TRIALING', 'PENDING_PAYMENT'] } },
        data: { status: 'EXPIRED' }
      });
    }
    const updated = await tx.schoolSubscription.update({
      where: { id },
      data: {
        status,
        ...(periodEnd !== undefined ? { currentPeriodEnd: periodEnd } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status === 'CANCELED' ? { canceledAt: new Date() } : {})
      }
    });
    await tx.auditLog.create({
      data: {
        schoolId: subscription.schoolId,
        actorId,
        action: 'SUBSCRIPTION_STATUS_UPDATED',
        entityType: 'SchoolSubscription',
        entityId: id,
        oldValues: {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null
        },
        newValues: {
          status: updated.status,
          currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null
        }
      }
    });
    return updated;
  });
}

export async function listSchools() {
  return prisma.school.findMany({
    include: {
      subscriptions: {
        include: { plan: { select: planSelect } },
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      _count: { select: { users: true, students: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function updateSchoolStatus(id, status, actorId) {
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) throw httpError(404, 'SCHOOL_NOT_FOUND', 'School not found.');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.school.update({ where: { id }, data: { status } });
    await tx.auditLog.create({
      data: {
        schoolId: id,
        actorId,
        action: 'SCHOOL_STATUS_UPDATED',
        entityType: 'School',
        entityId: id,
        oldValues: { status: school.status },
        newValues: { status: updated.status }
      }
    });
    return updated;
  });
}

export async function getSchoolProfile(id) {
  return prisma.school.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      address: true,
      phone: true,
      logoDataUrl: true,
      secondaryLogoDataUrl: true,
      classTeacherSignerName: true,
      headteacherSignerName: true,
      reportDesign: true,
      status: true,
      createdAt: true,
    }
  });
}

export async function updateSchoolProfile(id, data, actorId) {
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) throw httpError(404, 'SCHOOL_NOT_FOUND', 'School not found.');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.school.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        schoolId: id,
        actorId,
        action: 'SCHOOL_PROFILE_UPDATED',
        entityType: 'School',
        entityId: id,
        oldValues: {
          name: school.name,
          slug: school.slug,
          email: school.email,
          address: school.address,
          phone: school.phone,
          hasLogo: Boolean(school.logoDataUrl),
          hasSecondaryLogo: Boolean(school.secondaryLogoDataUrl),
          classTeacherSignerName: school.classTeacherSignerName,
          headteacherSignerName: school.headteacherSignerName,
          reportDesign: school.reportDesign,
        },
        newValues: {
          name: updated.name,
          slug: updated.slug,
          email: updated.email,
          address: updated.address,
          phone: updated.phone,
          hasLogo: Boolean(updated.logoDataUrl),
          hasSecondaryLogo: Boolean(updated.secondaryLogoDataUrl),
          classTeacherSignerName: updated.classTeacherSignerName,
          headteacherSignerName: updated.headteacherSignerName,
          reportDesign: updated.reportDesign,
        }
      }
    });
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      email: updated.email,
      address: updated.address,
      phone: updated.phone,
      logoDataUrl: updated.logoDataUrl,
      secondaryLogoDataUrl: updated.secondaryLogoDataUrl,
      classTeacherSignerName: updated.classTeacherSignerName,
      headteacherSignerName: updated.headteacherSignerName,
      reportDesign: updated.reportDesign,
    };
  });
}
