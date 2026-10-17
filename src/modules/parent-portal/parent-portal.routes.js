import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';
import { parentPortalOverviewController } from './parent-portal.controller.js';

export const parentPortalRouter = Router();

parentPortalRouter.use(authenticate, requireActiveSubscription, authorize('PARENT'));
parentPortalRouter.get('/overview', parentPortalOverviewController);
