import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';

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
        status: trialEndsAt ? 'TRIALING' : plan.priceMinor === 0 ? 'ACTIVE' : 'PENDING_PAYMENT',
        currentPeriodStart: now,
        trialEndsAt
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

export async function getCurrentSubscription(schoolId) {
  if (!schoolId) throw httpError(404, 'SCHOOL_NOT_FOUND', 'No school is linked to this account.');
  const subscriptions = await prisma.schoolSubscription.findMany({
    where: { schoolId },
    include: { plan: { select: planSelect } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  const now = new Date();
  const current = subscriptions.find((item) =>
    (item.status === 'TRIALING' && item.trialEndsAt > now) ||
    (['ACTIVE', 'CANCELED'].includes(item.status) &&
      (!item.currentPeriodEnd || item.currentPeriodEnd > now))
  ) ?? null;
  const pendingChange = subscriptions.find((item) => item.status === 'PENDING_PAYMENT') ?? null;
  return { current, pendingChange, recent: subscriptions };
}

export async function requestPlanChange(schoolId, planId, actorId) {
  if (!schoolId) throw httpError(404, 'SCHOOL_NOT_FOUND', 'No school is linked to this account.');
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { status: true } });
  if (!school || school.status !== 'ACTIVE') {
    throw httpError(403, 'SCHOOL_UNAVAILABLE', 'This school account is unavailable.');
  }
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, isActive: true },
    select: { id: true, priceMinor: true }
  });
  if (!plan) throw httpError(404, 'PLAN_NOT_FOUND', 'An active subscription plan is required.');

  const subscriptions = await prisma.schoolSubscription.findMany({
    where: { schoolId },
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
    (['ACTIVE', 'CANCELED'].includes(item.status) && (!item.currentPeriodEnd || item.currentPeriodEnd > now))
  );
  if (current?.planId === planId) {
    throw httpError(409, 'PLAN_ALREADY_CURRENT', 'This school already has this plan.');
  }

  return prisma.$transaction(async (tx) => {
    if (existingRequest) {
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
        status: plan.priceMinor === 0 ? 'ACTIVE' : 'PENDING_PAYMENT',
        currentPeriodStart: new Date()
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
    select: { id: true, name: true, slug: true, email: true, status: true, createdAt: true }
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
        oldValues: { name: school.name, slug: school.slug, email: school.email },
        newValues: { name: updated.name, slug: updated.slug, email: updated.email }
      }
    });
    return { id: updated.id, name: updated.name, slug: updated.slug, email: updated.email };
  });
}
