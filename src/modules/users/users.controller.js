
import {
  createStaffSchema,
  updateStaffSchema,
  listStaffSchema
} from './users.validation.js';

import {
  createStaff,
  listStaff,
  getStaffById,
  updateStaff
} from './users.service.js';

function validate(schema, input, res) {
  const result = schema.safeParse(input);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the supplied data.',
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

export async function createStaffController(req, res, next) {
  try {
    const data = validate(createStaffSchema, req.body, res);
    if (!data) return;

    const user = await createStaff(data, req.user.id, req);

    res.status(201).json({
      success: true,
      message: 'Staff account created successfully.',
      data: user
    });
  } catch (error) {
    next(error);
  }
}

export async function listStaffController(req, res, next) {
  try {
    const filters = validate(listStaffSchema, req.query, res);
    if (!filters) return;

    const result = await listStaff(filters);

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getStaffController(req, res, next) {
  try {
    const user = await getStaffById(req.params.id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateStaffController(req, res, next) {
  try {
    const data = validate(updateStaffSchema, req.body, res);
    if (!data) return;

    const user = await updateStaff(req.params.id, data, req.user.id, req);

    res.json({
      success: true,
      message: 'User account updated successfully.',
      data: user
    });
  } catch (error) {
    next(error);
  }
}
