import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  listPromotionBatchesController,
  getPromotionBatchByIdController,
} from './promotion.controller.js';

import {
  previewPromotionController,
  approvePromotionController,
} from './promotion.controller.js';

export const promotionRouter = Router();

promotionRouter.use(authenticate);

promotionRouter.use(
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
  ),
);

promotionRouter.get('/preview', previewPromotionController);
promotionRouter.post('/approve', approvePromotionController);
promotionRouter.get('/batches', listPromotionBatchesController);
promotionRouter.get('/batches/:id', getPromotionBatchByIdController);