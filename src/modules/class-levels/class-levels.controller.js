import {
  createClassLevelSchema,
  updateClassLevelSchema,
  listClassLevelsSchema
} from './class-levels.validation.js';

import {
  createClassLevel,
  listClassLevels,
  getClassLevelById,
  updateClassLevel
} from './class-levels.service.js';

export async function createClassLevelController(req, res) {
  const parsed = createClassLevelSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted class-level details.',
        details: parsed.error.issues
      }
    });
  }

  const data = await createClassLevel(parsed.data, req.user.id, req);

  return res.status(201).json({ success: true, data });
}

export async function listClassLevelsController(req, res) {
  const parsed = listClassLevelsSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the class-level filters.',
        details: parsed.error.issues
      }
    });
  }

  const result = await listClassLevels(parsed.data);

  return res.json({ success: true, ...result });
}

export async function getClassLevelController(req, res) {
  const data = await getClassLevelById(req.params.id);

  return res.json({ success: true, data });
}

export async function updateClassLevelController(req, res) {
  const parsed = updateClassLevelSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted class-level changes.',
        details: parsed.error.issues
      }
    });
  }

  const data = await updateClassLevel(
    req.params.id,
    parsed.data,
    req.user.id,
    req
  );

  return res.json({ success: true, data });
}