import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createClassLevelController,
  listClassLevelsController,
  getClassLevelController,
  updateClassLevelController
} from './class-levels.controller.js';

export const classLevelsRouter = Router();

classLevelsRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'));

classLevelsRouter.post('/', createClassLevelController);
classLevelsRouter.get('/', listClassLevelsController);
classLevelsRouter.get('/:id', getClassLevelController);
classLevelsRouter.patch('/:id', updateClassLevelController);
