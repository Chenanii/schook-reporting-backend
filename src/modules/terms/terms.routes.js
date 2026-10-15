import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createTermController,
  listTermsController,
  getTermController,
  updateTermController,
  updateTermStatusController
} from './terms.controller.js';

export const termsRouter = Router();

termsRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'));

termsRouter.post('/', createTermController);
termsRouter.get('/', listTermsController);
termsRouter.get('/:id', getTermController);
termsRouter.patch('/:id', updateTermController);
termsRouter.patch('/:id/status', updateTermStatusController);
