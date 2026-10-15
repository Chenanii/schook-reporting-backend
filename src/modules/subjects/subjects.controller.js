
import {
  createSubjectSchema,
  updateSubjectSchema,
  listSubjectsSchema
} from './subjects.validation.js';

import {
  createSubject,
  listSubjects,
  getSubjectById,
  updateSubject
} from './subjects.service.js';

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

export async function createSubjectController(req, res, next) {
  try {
    const parsed = createSubjectSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const subject = await createSubject(
      parsed.data,
      req.user.id,
      req
    );

    return res.status(201).json({
      success: true,
      message: 'Subject created successfully.',
      data: subject
    });
  } catch (error) {
    next(error);
  }
}

export async function listSubjectsController(req, res, next) {
  try {
    const parsed = listSubjectsSchema.safeParse(req.query);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listSubjects(parsed.data);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getSubjectController(req, res, next) {
  try {
    const subject = await getSubjectById(req.params.id);

    return res.status(200).json({
      success: true,
      data: subject
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSubjectController(req, res, next) {
  try {
    const parsed = updateSubjectSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const subject = await updateSubject(
      req.params.id,
      parsed.data,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Subject updated successfully.',
      data: subject
    });
  } catch (error) {
    next(error);
  }
}
