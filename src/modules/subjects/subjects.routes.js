
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  createSubjectController,
  listSubjectsController,
  getSubjectController,
  updateSubjectController
} from './subjects.controller.js';

export const subjectsRouter = Router();

subjectsRouter.use(authenticate, authorize('SUPER_ADMIN'));

subjectsRouter.post('/', createSubjectController);
subjectsRouter.get('/', listSubjectsController);
subjectsRouter.get('/:id', getSubjectController);
subjectsRouter.patch('/:id', updateSubjectController);
