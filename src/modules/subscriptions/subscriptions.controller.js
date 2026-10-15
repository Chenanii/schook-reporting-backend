import {
  createPlanSchema, updatePlanSchema, schoolSignupSchema,
  changePlanSchema, updateSubscriptionStatusSchema, updateSchoolStatusSchema,
  updateSchoolProfileSchema
} from './subscriptions.validation.js';
import {
  listPublicPlans, listPlans, createPlan, updatePlan,
  registerSchool, getCurrentSubscription, updateSubscriptionStatus,
  listSchools, updateSchoolStatus, listSubscriptions, requestPlanChange,
  getSchoolProfile, updateSchoolProfile
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

export async function currentSubscriptionController(req, res, next) {
  try { return res.json({ success: true, data: await getCurrentSubscription(req.schoolId) }); }
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
