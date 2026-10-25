import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  listPublicPlansController, listPlansController, createPlanController,
  updatePlanController, currentSubscriptionController,
  updateSubscriptionStatusController, listSubscriptionsController,
  changePlanController, startCheckoutController, schoolPaymentsController,
  allPaymentsController, payChanguCallbackController, payChanguWebhookController,
  termExpiryReminderController
} from './subscriptions.controller.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/plans', listPublicPlansController);
subscriptionsRouter.post('/plans', authenticate, authorize('SUPER_ADMIN'), createPlanController);
subscriptionsRouter.get('/manage/plans', authenticate, authorize('SUPER_ADMIN'), listPlansController);
subscriptionsRouter.patch('/plans/:id', authenticate, authorize('SUPER_ADMIN'), updatePlanController);
subscriptionsRouter.get('/current', authenticate, currentSubscriptionController);
subscriptionsRouter.get('/reminder', authenticate, authorize('SCHOOL_ADMIN', 'SUPER_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), termExpiryReminderController);
subscriptionsRouter.post('/change-plan', authenticate, authorize('SCHOOL_ADMIN'), changePlanController);
subscriptionsRouter.post('/:id/checkout', authenticate, authorize('SCHOOL_ADMIN'), startCheckoutController);
subscriptionsRouter.get('/payments', authenticate, authorize('SCHOOL_ADMIN'), schoolPaymentsController);
subscriptionsRouter.get('/manage/payments', authenticate, authorize('SUPER_ADMIN'), allPaymentsController);
subscriptionsRouter.all('/paychangu/callback', payChanguCallbackController);
subscriptionsRouter.post('/paychangu/webhook', payChanguWebhookController);
subscriptionsRouter.get('/manage/subscriptions', authenticate, authorize('SUPER_ADMIN'), listSubscriptionsController);
subscriptionsRouter.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), updateSubscriptionStatusController);
