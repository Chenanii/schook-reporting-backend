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

termsRouter.use(authenticate, requireActiveSubscription);

termsRouter.post('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), createTermController);
termsRouter.get('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), listTermsController);
termsRouter.get('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), getTermController);
termsRouter.patch('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), updateTermController);
termsRouter.patch('/:id/status', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), updateTermStatusController);
