import { prisma } from '../lib/prisma.js';
import { getSchoolSetupStatus } from '../modules/schools/school-setup.service.js';

const setupPrefixes = new Set([
  '/academic-years', '/grade-scales', '/terms', '/class-levels',
  '/class-groups', '/subjects', '/class-subjects', '/teachers', '/students'
]);

function isSetupRoute(req) {
  const base = req.baseUrl || '';
  return [...setupPrefixes].some((prefix) => base === `/api/v1${prefix}` || base.endsWith(prefix));
}

export async function requireActiveSubscription(req, res, next) {
  try {
    if (req.user?.role === 'SUPER_ADMIN') {
      if (!req.schoolId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SCHOOL_CONTEXT_REQUIRED',
            message: 'Set the X-School-ID header before accessing school data.'
          }
        });
      }
      return next();
    }

    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SCHOOL_MEMBERSHIP_REQUIRED',
          message: 'This account is not linked to a school.'
        }
      });
    }

    const now = new Date();
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { status: true }
    });
    if (!school || school.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: { code: 'SCHOOL_UNAVAILABLE', message: 'This school account is unavailable.' }
      });
    }

    const subscription = await prisma.schoolSubscription.findFirst({
      where: {
        schoolId,
        OR: [
          { status: 'TRIALING', trialEndsAt: { gt: now } },
          { status: 'ACTIVE', currentPeriodStart: { lte: now }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
          { status: 'CANCELED', currentPeriodStart: { lte: now }, currentPeriodEnd: { gt: now } }
        ]
      },
      select: { id: true }
    });

    const setupOnlyAccess = !subscription && isSetupRoute(req)
      ? await prisma.schoolSubscription.findFirst({
          where: { schoolId, status: 'PENDING_PAYMENT' },
          select: { id: true }
        })
      : null;

    if (!subscription && !setupOnlyAccess) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'An active subscription is required to use school features.'
        }
      });
    }

    const setup = await getSchoolSetupStatus(schoolId);
    if (!setup.complete && !isSetupRoute(req)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SCHOOL_SETUP_REQUIRED',
          message: 'Complete the guided school setup before using other school features.',
          details: setup.steps
        }
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requirePlanCapacity(resource) {
  return async function enforcePlanCapacity(req, res, next) {
    try {
      if (req.user?.role === 'SUPER_ADMIN' || !req.schoolId) return next();
      const now = new Date();
      const subscription = await prisma.schoolSubscription.findFirst({
        where: {
          schoolId: req.schoolId,
          OR: [
            { status: 'TRIALING', trialEndsAt: { gt: now } },
            { status: 'ACTIVE', currentPeriodStart: { lte: now }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
            { status: 'CANCELED', currentPeriodStart: { lte: now }, currentPeriodEnd: { gt: now } }
          ]
        },
        include: { plan: { select: { maxStudents: true, maxStaff: true } } },
        orderBy: { createdAt: 'desc' }
      });
      const limit = resource === 'students'
        ? subscription?.plan.maxStudents
        : subscription?.plan.maxStaff;
      if (limit == null) return next();

      const count = resource === 'students'
        ? await prisma.student.count({ where: { status: 'ACTIVE' } })
        : await (async () => {
            const [teachers, otherStaff] = await Promise.all([
              prisma.teacher.count(),
              prisma.user.count({
                where: { role: { in: ['SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'] } }
              })
            ]);
            return teachers + otherStaff;
          })();

      if (count >= limit) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'PLAN_LIMIT_REACHED',
            message: `Your current plan allows up to ${limit} ${resource}. Upgrade your plan to add more.`
          }
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// Keep report generation available through most of the paid term, then block it during the final 21 days.
export async function requireReportsBeforeTermEnd(req, res, next) {
  try {
    const schoolId = req.schoolId || req.user?.schoolId;
    if (!schoolId) return next();
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const term = await prisma.term.findFirst({
      where: {
        schoolId, startDate: { lte: now }, endDate: { gte: today },
        status: { notIn: ['DRAFT', 'CLOSED'] }
      },
      orderBy: { startDate: 'desc' }
    });
    if (!term) return next();

    // Schools that already paid for this term keep report access through term end.
    const paid = await prisma.subscriptionPayment.findFirst({
      where: { schoolId, status: 'SUCCESS', subscription: { billingTermId: term.id } },
      select: { id: true }
    });
    if (paid) return next();

    const unpaidPlan = await prisma.schoolSubscription.findFirst({
      where: {
        schoolId,
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PENDING_PAYMENT'] },
        plan: { priceMinor: { gt: 0 } },
        OR: [{ billingTermId: term.id }, { billingTermId: null }]
      },
      select: { id: true }
    });
    if (!unpaidPlan) return next();

    const termEnd = term.endDate;
    const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const endDate = new Date(termEnd);
    const endOfTermDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    const daysRemaining = Math.ceil((endOfTermDay - startOfToday) / (24 * 60 * 60 * 1000));
    if (daysRemaining > 0 && daysRemaining <= 21) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'REPORTS_RESTRICTED_NEAR_TERM_END',
          message: 'Mid-term and end-of-term reports are restricted during the final three weeks of the subscription term.',
          details: { daysRemaining, termEndDate: termEnd }
        }
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
