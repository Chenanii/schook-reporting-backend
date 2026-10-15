import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  listPromotionBatchesController,
  getPromotionBatchByIdController,
  listPromotionPoliciesController,
  savePromotionPolicyController,
} from './promotion.controller.js';

import {
  previewPromotionController,
  approvePromotionController,
} from './promotion.controller.js';

export const promotionRouter = Router();

promotionRouter.use(authenticate, requireActiveSubscription);

promotionRouter.use(
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
  ),
);

promotionRouter.get('/preview', previewPromotionController);
promotionRouter.get('/policies', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), listPromotionPoliciesController);
promotionRouter.put('/policies/:classLevelId', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), savePromotionPolicyController);
promotionRouter.post('/approve', approvePromotionController);
promotionRouter.get('/batches', listPromotionBatchesController);
promotionRouter.get('/batches/:id', getPromotionBatchByIdController);
