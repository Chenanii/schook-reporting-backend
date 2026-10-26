import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import {
  createPlanSchema, updatePlanSchema, schoolSignupSchema,
  changePlanSchema, updateSubscriptionStatusSchema, updateSchoolStatusSchema,
  updateSchoolProfileSchema
} from './subscriptions.validation.js';
import {
  listPublicPlans, listPlans, createPlan, updatePlan,
  registerSchool, getCurrentSubscription, updateSubscriptionStatus,
  listSchools, updateSchoolStatus, listSubscriptions, requestPlanChange,
  getSchoolProfile, updateSchoolProfile, startSubscriptionCheckout,
  verifySubscriptionPayment, listSchoolPayments, listAllSubscriptionPayments,
  getTermExpiryReminder, checkSchoolNameAvailability
} from './subscriptions.service.js';

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the submitted fields.',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'), message: issue.message
      }))
    }
  });
}

export async function listPublicPlansController(req, res, next) {
  try { return res.json({ success: true, data: await listPublicPlans() }); }
  catch (error) { return next(error); }
}

export async function listPlansController(req, res, next) {
  try { return res.json({ success: true, data: await listPlans() }); }
  catch (error) { return next(error); }
}

export async function createPlanController(req, res, next) {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try { return res.status(201).json({ success: true, data: await createPlan(parsed.data) }); }
  catch (error) { return next(error); }
}

export async function updatePlanController(req, res, next) {
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try { return res.json({ success: true, data: await updatePlan(req.params.id, parsed.data) }); }
  catch (error) { return next(error); }
}

export async function registerSchoolController(req, res, next) {
  const parsed = schoolSignupSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try { return res.status(201).json({ success: true, data: await registerSchool(parsed.data) }); }
  catch (error) { return next(error); }
}

export async function checkSchoolNameAvailabilityController(req, res, next) {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (name.length < 2 || name.length > 160) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_SCHOOL_NAME', message: 'Enter a school name between 2 and 160 characters.' } });
  }
  try { return res.json({ success: true, data: await checkSchoolNameAvailability(name) }); }
  catch (error) { return next(error); }
}

export async function currentSubscriptionController(req, res, next) {
  try { return res.json({ success: true, data: await getCurrentSubscription(req.schoolId) }); }
  catch (error) { return next(error); }
}

export async function termExpiryReminderController(req, res, next) {
  try { return res.json({ success: true, data: await getTermExpiryReminder(req.schoolId) }); }
  catch (error) { return next(error); }
}

export async function changePlanController(req, res, next) {
  const parsed = changePlanSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    return res.status(202).json({
      success: true,
      data: await requestPlanChange(req.schoolId, parsed.data.planId, req.user.id)
    });
  } catch (error) { return next(error); }
}

export async function startCheckoutController(req, res, next) {
  try {
    const result = await startSubscriptionCheckout(req.schoolId, req.params.id);
    return res.status(201).json({ success: true, data: result });
  } catch (error) { return next(error); }
}

export async function schoolPaymentsController(req, res, next) {
  try { return res.json({ success: true, data: await listSchoolPayments(req.schoolId) }); }
  catch (error) { return next(error); }
}

export async function allPaymentsController(req, res, next) {
  try { return res.json({ success: true, data: await listAllSubscriptionPayments() }); }
  catch (error) { return next(error); }
}

// This is PayChangu's browser return endpoint; never trust the returned status without re-verifying.
export async function payChanguCallbackController(req, res) {
  const txRef = req.query.tx_ref || req.body?.tx_ref;
  let paymentStatus = 'pending';
  if (typeof txRef === 'string') {
    try {
      const payment = await verifySubscriptionPayment(txRef);
      paymentStatus = payment.status.toLowerCase();
    } catch (error) {
      if (error.statusCode === 404) paymentStatus = 'unknown';
    }
  }
  const returnUrl = new URL(env.PAYCHANGU_RETURN_URL);
  if (typeof txRef === 'string') returnUrl.searchParams.set('tx_ref', txRef);
  returnUrl.searchParams.set('payment_status', paymentStatus);
  return res.redirect(303, returnUrl.toString());
}

// PayChangu expects a 200 acknowledgement. Signed event details are hints only; verification is authoritative.
export async function payChanguWebhookController(req, res) {
  if (!env.PAYCHANGU_WEBHOOK_SECRET || !req.rawBody) return res.sendStatus(503);
  const signature = req.get('signature');
  const expected = createHmac('sha256', env.PAYCHANGU_WEBHOOK_SECRET).update(req.rawBody).digest();
  let provided;
  try { provided = Buffer.from(signature || '', 'hex'); } catch { return res.sendStatus(401); }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return res.sendStatus(401);
  const txRef = req.body?.tx_ref || req.body?.data?.tx_ref;
  if (typeof txRef === 'string') {
    try { await verifySubscriptionPayment(txRef); }
    catch (error) { if (error.statusCode !== 404) return res.sendStatus(503); }
  }
  return res.sendStatus(200);
}

export async function updateSubscriptionStatusController(req, res, next) {
  const parsed = updateSubscriptionStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    const data = await updateSubscriptionStatus(
      req.params.id,
      parsed.data.status,
      parsed.data.currentPeriodEnd,
      parsed.data.notes,
      req.user.id
    );
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
}

export async function listSchoolsController(req, res, next) {
  try { return res.json({ success: true, data: await listSchools() }); }
  catch (error) { return next(error); }
}

export async function listSubscriptionsController(req, res, next) {
  try { return res.json({ success: true, data: await listSubscriptions() }); }
  catch (error) { return next(error); }
}

export async function updateSchoolStatusController(req, res, next) {
  const parsed = updateSchoolStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try { return res.json({ success: true, data: await updateSchoolStatus(req.params.id, parsed.data.status, req.user.id) }); }
  catch (error) { return next(error); }
}

export async function currentSchoolController(req, res, next) {
  try { return res.json({ success: true, data: await getSchoolProfile(req.schoolId) }); }
  catch (error) { return next(error); }
}

export async function updateCurrentSchoolController(req, res, next) {
  const parsed = updateSchoolProfileSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    return res.json({
      success: true,
      data: await updateSchoolProfile(req.schoolId, parsed.data, req.user.id)
    });
  } catch (error) { return next(error); }
}
