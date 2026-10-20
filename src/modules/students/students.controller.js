
import {
  createStudentSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
  listStudentsSchema
} from './students.validation.js';

import {
  createStudent,
  listStudents,
  getStudentById,
  updateStudent,
  updateStudentStatus,
  getStudentClassDistribution
} from './students.service.js';

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

export async function studentClassDistributionController(req, res, next) {
  try {
    const data = await getStudentClassDistribution(req.schoolId);
    return res.status(200).json({ success: true, message: 'Student class distribution retrieved successfully.', data });
  } catch (error) {
    return next(error);
  }
}

export async function createStudentController(req, res, next) {
  try {
    const parsed = createStudentSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const student = await createStudent(parsed.data, req.user.id, req, req.schoolId);

    return res.status(201).json({
      success: true,
      message: 'Student registered successfully.',
      data: student
    });
  } catch (error) {
    next(error);
  }
}

export async function listStudentsController(req, res, next) {
  try {
    const parsed = listStudentsSchema.safeParse(req.query);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listStudents(
      parsed.data,
      req.user.role === 'TEACHER' ? req.user.id : null,
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentController(req, res, next) {
  try {
    const student = await getStudentById(
      req.params.id,
      req.user.role === 'TEACHER' ? req.user.id : null,
    );

    return res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStudentController(req, res, next) {
  try {
    const parsed = updateStudentSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const student = await updateStudent(
      req.params.id,
      parsed.data,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Student updated successfully.',
      data: student
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStudentStatusController(req, res, next) {
  try {
    const parsed = updateStudentStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const student = await updateStudentStatus(
      req.params.id,
      parsed.data.status,
      req.user.id,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Student status updated successfully.',
      data: student
    });
  } catch (error) {
    next(error);
  }
}
