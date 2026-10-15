import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  listPublicPlansController, listPlansController, createPlanController,
  updatePlanController, currentSubscriptionController,
  updateSubscriptionStatusController, listSubscriptionsController,
  changePlanController
} from './subscriptions.controller.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/plans', listPublicPlansController);
subscriptionsRouter.post('/plans', authenticate, authorize('SUPER_ADMIN'), createPlanController);
subscriptionsRouter.get('/manage/plans', authenticate, authorize('SUPER_ADMIN'), listPlansController);
subscriptionsRouter.patch('/plans/:id', authenticate, authorize('SUPER_ADMIN'), updatePlanController);
subscriptionsRouter.get('/current', authenticate, currentSubscriptionController);
subscriptionsRouter.post('/change-plan', authenticate, authorize('SCHOOL_ADMIN'), changePlanController);
subscriptionsRouter.get('/manage/subscriptions', authenticate, authorize('SUPER_ADMIN'), listSubscriptionsController);
subscriptionsRouter.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), updateSubscriptionStatusController);
