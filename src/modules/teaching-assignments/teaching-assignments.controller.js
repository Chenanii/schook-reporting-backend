
import {
  createTeachingAssignmentSchema,
  updateTeachingAssignmentSchema,
  listTeachingAssignmentsSchema,
  teachingAssignmentIdSchema
} from './teaching-assignments.validation.js';

import {
  createTeachingAssignment,
  listTeachingAssignments,
  getTeachingAssignmentById,
  updateTeachingAssignment,
  deleteTeachingAssignment
} from './teaching-assignments.service.js';

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

export async function createTeachingAssignmentController(req, res, next) {
  try {
    const parsed = createTeachingAssignmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const assignment = await createTeachingAssignment(
      parsed.data,
      req.user.id,
      req
    );

    return res.status(201).json({
      success: true,
      message: 'Teaching assignment created successfully.',
      data: assignment
    });
  } catch (error) {
    next(error);
  }
}

export async function listTeachingAssignmentsController(req, res, next) {
  try {
    const parsed = listTeachingAssignmentsSchema.safeParse(req.query);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listTeachingAssignments(parsed.data);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getTeachingAssignmentController(req, res, next) {
  try {
    const parsed = teachingAssignmentIdSchema.safeParse(req.params);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const assignment = await getTeachingAssignmentById(parsed.data.id);

    return res.status(200).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTeachingAssignmentController(req, res, next) {
  try {
    const params = teachingAssignmentIdSchema.safeParse(req.params);

    if (!params.success) {
      return validationError(res, params.error);
    }

    const parsed = updateTeachingAssignmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const assignment = await updateTeachingAssignment(
      params.data.id,
      parsed.data,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Teaching assignment updated successfully.',
      data: assignment
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTeachingAssignmentController(req, res, next) {
  try {
    const parsed = teachingAssignmentIdSchema.safeParse(req.params);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await deleteTeachingAssignment(
      parsed.data.id,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Teaching assignment deleted successfully.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}
