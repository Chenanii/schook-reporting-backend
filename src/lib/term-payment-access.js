import { prisma } from './prisma.js';

const billableStatuses = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PENDING_PAYMENT', 'EXPIRED'];

export async function getTermPaymentAccess(schoolId, termId) {
  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId },
    select: { status: true },
  });
  if (!term) return { termStatus: null, paymentRequired: false };
  if (term.status !== 'FINALIZED') return { termStatus: term.status, paymentRequired: false };

  const [paidPayment, unpaidSubscription] = await Promise.all([
    prisma.subscriptionPayment.findFirst({
      where: { schoolId, status: 'SUCCESS', subscription: { billingTermId: termId } },
      select: { id: true },
    }),
    prisma.schoolSubscription.findFirst({
      where: {
        schoolId,
        status: { in: billableStatuses },
        plan: { priceMinor: { gt: 0 } },
        OR: [{ billingTermId: termId }, { billingTermId: null }],
      },
      select: { id: true },
    }),
  ]);

  return {
    termStatus: term.status,
    paymentRequired: Boolean(unpaidSubscription && !paidPayment),
  };
}

export async function assertTermSubscriptionPaid(schoolId, termId) {
  const access = await getTermPaymentAccess(schoolId, termId);
  if (!access.termStatus) {
    const error = new Error('Term not found.');
    error.statusCode = 404;
    error.code = 'TERM_NOT_FOUND';
    throw error;
  }
  if (access.paymentRequired) {
    const error = new Error('Subscription payment has not been confirmed for this finalized term. Please make payment before publishing results.');
    error.statusCode = 403;
    error.code = 'SUBSCRIPTION_PAYMENT_REQUIRED';
    throw error;
  }
  return access;
}
