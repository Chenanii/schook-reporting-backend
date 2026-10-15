
import {
  createAcademicYearSchema,
  updateAcademicYearSchema,
  listAcademicYearsSchema
} from './academic-years.validation.js';

import {
  createAcademicYear,
  listAcademicYears,
  getAcademicYearById,
  updateAcademicYear
} from './academic-years.service.js';

export async function createAcademicYearController(req, res) {
  const parsed = createAcademicYearSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted academic-year details.',
        details: parsed.error.issues
      }
    });
  }

  const data = await createAcademicYear(
    parsed.data,
    req.user.id,
    req
  );

  return res.status(201).json({ success: true, data });
}

export async function listAcademicYearsController(req, res) {
  const parsed = listAcademicYearsSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.issues }
    });
  }

  const result = await listAcademicYears(parsed.data);
  return res.json({ success: true, ...result });
}

export async function getAcademicYearController(req, res) {
  const data = await getAcademicYearById(req.params.id);
  return res.json({ success: true, data });
}

export async function updateAcademicYearController(req, res) {
  const parsed = updateAcademicYearSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted academic-year details.',
        details: parsed.error.issues
      }
    });
  }

  const data = await updateAcademicYear(
    req.params.id,
    parsed.data,
    req.user.id,
    req
  );

  return res.json({ success: true, data });
}
