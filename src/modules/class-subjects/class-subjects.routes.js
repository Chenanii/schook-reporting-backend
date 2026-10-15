
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createClassSubjectController,
  listClassSubjectsController,
  getClassSubjectController,
  deleteClassSubjectController
} from './class-subjects.controller.js';

export const classSubjectsRouter = Router();

classSubjectsRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'));

classSubjectsRouter.post('/', createClassSubjectController);
classSubjectsRouter.get('/', listClassSubjectsController);
classSubjectsRouter.get('/:id', getClassSubjectController);
classSubjectsRouter.delete('/:id', deleteClassSubjectController);
