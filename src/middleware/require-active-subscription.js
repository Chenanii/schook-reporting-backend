import { prisma } from '../lib/prisma.js';

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
          { status: 'ACTIVE', OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
          { status: 'CANCELED', currentPeriodEnd: { gt: now } }
        ]
      },
      select: { id: true }
    });

    if (!subscription) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'An active subscription is required to use school features.'
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
            { status: 'ACTIVE', OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
            { status: 'CANCELED', currentPeriodEnd: { gt: now } }
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
