
import {
  createClassSubjectSchema,
  listClassSubjectsSchema,
  classSubjectIdSchema
} from './class-subjects.validation.js';

import {
  createClassSubject,
  listClassSubjects,
  getClassSubjectById,
  deleteClassSubject
} from './class-subjects.service.js';

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

export async function createClassSubjectController(req, res, next) {
  try {
    const parsed = createClassSubjectSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const link = await createClassSubject(
      parsed.data,
      req.user.id,
      req
    );

    return res.status(201).json({
      success: true,
      message: 'Subject linked to class level successfully.',
      data: link
    });
  } catch (error) {
    next(error);
  }
}

export async function listClassSubjectsController(req, res, next) {
  try {
    const parsed = listClassSubjectsSchema.safeParse(req.query);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listClassSubjects(parsed.data);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getClassSubjectController(req, res, next) {
  try {
    const parsed = classSubjectIdSchema.safeParse(req.params);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const link = await getClassSubjectById(parsed.data.id);

    return res.status(200).json({
      success: true,
      data: link
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteClassSubjectController(req, res, next) {
  try {
    const parsed = classSubjectIdSchema.safeParse(req.params);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await deleteClassSubject(
      parsed.data.id,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Class subject link deleted successfully.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}
