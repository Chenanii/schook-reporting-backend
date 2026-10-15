
import {
  createClassGroupSchema,
  updateClassGroupSchema,
  listClassGroupsSchema
} from './class-groups.validation.js';

import {
  createClassGroup,
  listClassGroups,
  getClassGroupById,
  updateClassGroup
} from './class-groups.service.js';

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: error.issues
    }
  });
}

export async function createClassGroupController(req, res, next) {
  try {
    const parsed = createClassGroupSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const group = await createClassGroup(
      parsed.data,
      req.user.id,
      req
    );

    return res.status(201).json({
      success: true,
      message: 'Class group created successfully.',
      data: group
    });
  } catch (error) {
    next(error);
  }
}

export async function listClassGroupsController(req, res, next) {
  try {
    const parsed = listClassGroupsSchema.safeParse(req.query);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listClassGroups(parsed.data);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getClassGroupController(req, res, next) {
  try {
    const group = await getClassGroupById(req.params.id);

    return res.status(200).json({
      success: true,
      data: group
    });
  } catch (error) {
    next(error);
  }
}

export async function updateClassGroupController(req, res, next) {
  try {
    const parsed = updateClassGroupSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const group = await updateClassGroup(
      req.params.id,
      parsed.data,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Class group updated successfully.',
      data: group
    });
  } catch (error) {
    next(error);
  }
}
