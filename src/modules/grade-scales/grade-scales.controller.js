import { createGradeScaleSchema } from './grade-scales.validation.js';
import { createGradeScale, listGradeScales } from './grade-scales.service.js';

export async function listGradeScalesController(req, res, next) {
  try {
    const data = await listGradeScales();
    return res.status(200).json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
}

export async function createGradeScaleController(req, res, next) {
  try {
    const parsed = createGradeScaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Check the grade scale and boundaries.', details: parsed.error.issues },
      });
    }
    const data = await createGradeScale(parsed.data, req.user.id, req);
    return res.status(201).json({ success: true, message: 'Grade scale created.', data });
  } catch (error) {
    next(error);
  }
}
