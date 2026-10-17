import {
  createParentPortalAccountSchema,
  requestParentPortalVerificationSchema,
} from './parent-auth.validation.js';
import {
  createParentPortalAccount,
  requestParentPortalVerification,
} from './parent-auth.service.js';

function parse(schema, body, res) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the submitted fields.',
      details: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
  return null;
}

export async function requestParentPortalVerificationController(req, res, next) {
  try {
    const input = parse(requestParentPortalVerificationSchema, req.body, res);
    if (!input) return;
    const data = await requestParentPortalVerification(input.identifier);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function createParentPortalAccountController(req, res, next) {
  try {
    const input = parse(createParentPortalAccountSchema, req.body, res);
    if (!input) return;
    const data = await createParentPortalAccount(input);
    return res.status(201).json({
      success: true,
      message: 'Parent portal account created successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}
