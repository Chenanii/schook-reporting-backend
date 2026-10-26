import {
  createTermSchema,
  updateTermSchema,
  listTermsSchema,
  updateTermStatusSchema
} from './terms.validation.js';

import {
  createTerm,
  listTerms,
  getTermById,
  updateTerm,
  updateTermStatus
} from './terms.service.js';

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the submitted details.',
      details: error.issues
    }
  });
}

export async function createTermController(req, res) {
  const parsed = createTermSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const data = await createTerm(parsed.data, req.user.id, req);

  return res.status(201).json({ success: true, data });
}

export async function listTermsController(req, res) {
  const parsed = listTermsSchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await listTerms(parsed.data);

  return res.json({
    success: true,
    ...result
  });
}

export async function getTermController(req, res) {
  const data = await getTermById(req.params.id);

  return res.json({ success: true, data });
}

export async function updateTermController(req, res) {
  const parsed = updateTermSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const data = await updateTerm(
    req.params.id,
    parsed.data,
    req.user.id,
    req
  );

  return res.json({ success: true, data });
}

export async function updateTermStatusController(req, res) {
  const parsed = updateTermStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  if (parsed.data.status === 'FINALIZED' && req.user.role !== 'HEADTEACHER') {
    return res.status(403).json({ success: false, error: { code: 'TERM_APPROVAL_FORBIDDEN', message: 'Only the headteacher can approve and finalize term results.' } });
  }

  const data = await updateTermStatus(
    req.params.id,
    parsed.data.status,
    req.user.id,
    req
  );

  return res.json({ success: true, data });
}
