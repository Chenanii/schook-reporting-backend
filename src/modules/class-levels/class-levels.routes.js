import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  createClassLevelController,
  listClassLevelsController,
  getClassLevelController,
  updateClassLevelController
} from './class-levels.controller.js';

export const classLevelsRouter = Router();

classLevelsRouter.use(authenticate, authorize('SUPER_ADMIN'));

classLevelsRouter.post('/', createClassLevelController);
classLevelsRouter.get('/', listClassLevelsController);
classLevelsRouter.get('/:id', getClassLevelController);
classLevelsRouter.patch('/:id', updateClassLevelController);