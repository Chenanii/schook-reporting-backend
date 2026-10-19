
import {
  createEnrollmentSchema,
  listEnrollmentsSchema,
  updateEnrollmentStatusSchema,
  updateEnrollmentClassGroupSchema,
  bulkEnrollmentPreviewSchema,
  bulkEnrollmentSchema,
  selectedBulkEnrollmentSchema,
  assignClassGroupBulkSchema
} from './enrollments.validation.js';

import {
  createEnrollment,
  listEnrollments,
  getEnrollmentById,
  updateEnrollmentStatus,
  updateEnrollmentClassGroup,
  previewBulkEnrollment,
  createBulkEnrollments,
  previewSelectedBulkEnrollment,
  createSelectedBulkEnrollments,
  assignClassGroupBulk
} from './enrollments.service.js';

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

export async function createEnrollmentController(req, res, next) {
  try {
    const parsed = createEnrollmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const enrollment = await createEnrollment(
      parsed.data,
      req.user.id,
      req,
      req.schoolId
    );

    return res.status(201).json({
      success: true,
      message: 'Student enrolled successfully.',
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
}

export async function listEnrollmentsController(req, res, next) {
  try {
    const parsed = listEnrollmentsSchema.safeParse(req.query);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listEnrollments(parsed.data, req.schoolId);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getEnrollmentController(req, res, next) {
  try {
    const enrollment = await getEnrollmentById(req.params.id, req.schoolId);

    return res.status(200).json({
      success: true,
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
}

export async function updateEnrollmentStatusController(req, res, next) {
  try {
    const parsed = updateEnrollmentStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const enrollment = await updateEnrollmentStatus(
      req.params.id,
      parsed.data.status,
      req.user.id,
      req,
      req.schoolId
    );

    return res.status(200).json({
      success: true,
      message: 'Enrolment status updated successfully.',
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
}

export async function updateEnrollmentClassGroupController(req, res, next) {
  try {
    const parsed = updateEnrollmentClassGroupSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const enrollment = await updateEnrollmentClassGroup(req.params.id, parsed.data.classGroupId, req.user.id, req, req.schoolId);
    return res.status(200).json({
      success: true,
      message: 'Student stream updated successfully.',
      data: enrollment,
    });
  } catch (error) {
    next(error);
  }
}

export async function assignClassGroupBulkController(req, res, next) {
  try {
    const parsed = assignClassGroupBulkSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await assignClassGroupBulk(parsed.data, req.user.id, req, req.schoolId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function previewBulkEnrollmentController(req, res, next) {
  try {
    const parsed = bulkEnrollmentPreviewSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const preview = await previewBulkEnrollment(parsed.data, req.schoolId);

    return res.status(200).json({
      success: true,
      message: 'Bulk enrolment preview generated.',
      data: preview
    });
  } catch (error) {
    next(error);
  }
}

export async function createBulkEnrollmentsController(req, res, next) {
  try {
    const parsed = bulkEnrollmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await createBulkEnrollments(
      parsed.data,
      req.user.id,
      req,
      req.schoolId
    );

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function previewSelectedBulkEnrollmentController(req, res, next) {
  try {
    const parsed = selectedBulkEnrollmentSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const preview = await previewSelectedBulkEnrollment(parsed.data, req.schoolId);
    return res.status(200).json({ success: true, message: 'Selected enrollment preview generated.', data: preview });
  } catch (error) {
    next(error);
  }
}

export async function createSelectedBulkEnrollmentsController(req, res, next) {
  try {
    const parsed = selectedBulkEnrollmentSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await createSelectedBulkEnrollments(parsed.data, req.user.id, req, req.schoolId);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
