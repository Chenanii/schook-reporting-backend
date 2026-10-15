import {
  loginSchema,
  changePasswordSchema
} from './auth.validation.js';

import {
  login,
  getCurrentUser,
  changePassword
} from './auth.service.js';

function validate(schema, body, res) {
  const result = schema.safeParse(body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted fields.',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }
    });

    return null;
  }

  return result.data;
}

export async function loginController(req, res, next) {
  try {
    const input = validate(loginSchema, req.body, res);
    if (!input) return;

    const data = await login(input);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function meController(req, res, next) {
  try {
    const data = await getCurrentUser(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function changePasswordController(req, res, next) {
  try {
    const input = validate(changePasswordSchema, req.body, res);
    if (!input) return;

    const data = await changePassword({
      userId: req.user.id,
      ...input
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}