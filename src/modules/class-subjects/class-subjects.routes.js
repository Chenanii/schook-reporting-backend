
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createClassSubjectController,
  listClassSubjectsController,
  getClassSubjectController,
  updateClassSubjectController,
  deleteClassSubjectController
} from './class-subjects.controller.js';

export const classSubjectsRouter = Router();

classSubjectsRouter.use(authenticate, requireActiveSubscription);

classSubjectsRouter.post('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), createClassSubjectController);
classSubjectsRouter.get('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), listClassSubjectsController);
classSubjectsRouter.get('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), getClassSubjectController);
classSubjectsRouter.patch('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), updateClassSubjectController);
classSubjectsRouter.delete('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), deleteClassSubjectController);
