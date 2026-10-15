import { z } from 'zod';
import {
  listTermSubjectResults,
  finalizeTermSubjectResults,
  publishTermSubjectResults,
} from './term-results.service.js';

const scopeSchema = z.object({
  termId: z.string().trim().min(1),
  classGroupId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
});

function parseScope(req, res) {
  const parsed = scopeSchema.safeParse({
    termId: req.params.termId ?? req.query.termId,
    classGroupId: req.params.classGroupId ?? req.query.classGroupId,
    subjectId: req.params.subjectId ?? req.query.subjectId,
  });

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'termId, classGroupId and subjectId are required.',
        details: parsed.error.issues,
      },
    });

    return null;
  }

  return parsed.data;
}

export async function listTermSubjectResultsController(req, res) {
  const scope = parseScope(req, res);
  if (!scope) return;

  const result = await listTermSubjectResults(scope);

  return res.status(200).json({
    success: true,
    message: 'Term subject results retrieved successfully.',
    ...result,
  });
}

export async function finalizeTermSubjectResultsController(req, res) {
  const scope = parseScope(req, res);
  if (!scope) return;

  const results = await finalizeTermSubjectResults({
    ...scope,
    actorId: req.user.id,
    req,
  });

  return res.status(200).json({
    success: true,
    message: 'Subject results finalized successfully.',
    count: results.length,
    data: results,
  });
}

export async function publishTermSubjectResultsController(req, res) {
  const scope = parseScope(req, res);
  if (!scope) return;

  const results = await publishTermSubjectResults({
    ...scope,
    actorId: req.user.id,
    req,
  });

  return res.status(200).json({
    success: true,
    message: 'Subject results published successfully.',
    count: results.length,
    data: results,
  });
}