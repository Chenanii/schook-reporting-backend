
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  createClassGroupController,
  listClassGroupsController,
  getClassGroupController,
  updateClassGroupController
} from './class-groups.controller.js';

export const classGroupsRouter = Router();

classGroupsRouter.use(authenticate, authorize('SUPER_ADMIN'));

classGroupsRouter.post('/', createClassGroupController);
classGroupsRouter.get('/', listClassGroupsController);
classGroupsRouter.get('/:id', getClassGroupController);
classGroupsRouter.patch('/:id', updateClassGroupController);
