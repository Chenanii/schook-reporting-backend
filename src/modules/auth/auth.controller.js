import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema
} from './auth.validation.js';

import {
  login,
  getCurrentUser,
  changePassword,
  requestPasswordReset,
  resetPassword,
  getUserProfile,
  updateUserProfile
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

export async function profileController(req, res, next) {
  try {
    const data = await getUserProfile(req.user.id);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function updateProfileController(req, res, next) {
  try {
    const input = validate(updateProfileSchema, req.body, res);
    if (!input) return;
    const data = await updateUserProfile(req.user.id, input, req);
    return res.json({ success: true, message: 'Your profile was updated.', data });
  } catch (error) {
    return next(error);
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

export async function forgotPasswordController(req, res, next) {
  try {
    const input = validate(forgotPasswordSchema, req.body, res);
    if (!input) return;
    const data = await requestPasswordReset(input.email);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function resetPasswordController(req, res, next) {
  try {
    const input = validate(resetPasswordSchema, req.body, res);
    if (!input) return;
    const data = await resetPassword(input);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}
