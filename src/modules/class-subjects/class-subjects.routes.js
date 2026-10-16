
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

classSubjectsRouter.use(authenticate, requireActiveSubscription);

classSubjectsRouter.post('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), createClassSubjectController);
classSubjectsRouter.get('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), listClassSubjectsController);
classSubjectsRouter.get('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), getClassSubjectController);
classSubjectsRouter.delete('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), deleteClassSubjectController);
