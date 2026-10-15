import {
  previewPromotion,
  approvePromotionBatch,
} from './promotion.service.js';

import {
  previewPromotionSchema,
  approvePromotionSchema,
} from './promotion.validation.js';

import {
  listPromotionBatches,
  getPromotionBatchById,
} from './promotion.service.js';

export async function previewPromotionController(req, res) {
  const parsed = previewPromotionSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'sourceTermId, destinationTermId and classGroupId are required.',
        details: parsed.error.issues,
      },
    });
  }

  const data = await previewPromotion(parsed.data);

  return res.status(200).json({
    success: true,
    message: 'Promotion preview generated successfully.',
    data,
  });
}

export async function approvePromotionController(req, res) {
  const parsed = approvePromotionSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The promotion batch details are invalid.',
        details: parsed.error.issues,
      },
    });
  }

  const result = await approvePromotionBatch({
    ...parsed.data,
    actorId: req.user.id,
    req,
  });

  return res.status(200).json({
    success: true,
    message: 'Promotion batch approved and processed successfully.',
    data: result,
  });
}


export async function listPromotionBatchesController(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page ?? '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit ?? '20', 10)),
    );

    const result = await listPromotionBatches({
      sourceTermId: req.query.sourceTermId,
      destinationTermId: req.query.destinationTermId,
      classGroupId: req.query.classGroupId,
      page,
      limit,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getPromotionBatchByIdController(req, res, next) {
  try {
    const batch = await getPromotionBatchById(req.params.id);

    return res.status(200).json({ success: true, data: batch });
  } catch (error) {
    return next(error);
  }
}
