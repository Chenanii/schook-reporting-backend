import {
  createAssessmentSchema,
  updateAssessmentSchema,
  listAssessmentsSchema,
} from './assessments.validation.js';

import {
  createAssessment,
  listAssessments,
  getAssessmentById,
  updateAssessment,
  deleteAssessment,
} from './assessments.service.js';

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: error.issues,
    },
  });
}

export async function createAssessmentController(req, res) {
  const parsed = createAssessmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const assessment = await createAssessment(
    parsed.data,
    req.user.id,
    req,
    req.user.role === 'TEACHER' ? req.user.id : null,
  );

  return res.status(201).json({
    success: true,
    message: 'Assessment created successfully.',
    data: assessment,
  });
}

export async function listAssessmentsController(req, res) {
  const parsed = listAssessmentsSchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const assessments = await listAssessments(
    parsed.data,
    req.user.role === 'TEACHER' ? req.user.id : null,
  );

  return res.status(200).json({
    success: true,
    data: assessments,
    count: assessments.length,
  });
}

export async function getAssessmentController(req, res) {
  const assessment = await getAssessmentById(
    req.params.id,
    req.user.role === 'TEACHER' ? req.user.id : null,
  );

  return res.status(200).json({
    success: true,
    data: assessment,
  });
}

export async function updateAssessmentController(req, res) {
  const parsed = updateAssessmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const assessment = await updateAssessment(
    req.params.id,
    parsed.data,
    req.user.id,
    req,
    req.user.role === 'TEACHER' ? req.user.id : null,
  );

  return res.status(200).json({
    success: true,
    message: 'Assessment updated successfully.',
    data: assessment,
  });
}

export async function deleteAssessmentController(req, res) {
  const assessment = await deleteAssessment(
    req.params.id,
    req.user.id,
    req,
    req.user.role === 'TEACHER' ? req.user.id : null,
  );

  return res.status(200).json({
    success: true,
    message: 'Draft assessment deleted successfully.',
    data: assessment,
  });
}
