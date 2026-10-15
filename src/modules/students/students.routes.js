
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  requireActiveSubscription,
  requirePlanCapacity
} from '../../middleware/require-active-subscription.js';

import {
  createStudentController,
  listStudentsController,
  getStudentController,
  updateStudentController,
  updateStudentStatusController
} from './students.controller.js';

export const studentsRouter = Router();

studentsRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'));

studentsRouter.post('/', requirePlanCapacity('students'), createStudentController);
studentsRouter.get('/', listStudentsController);
studentsRouter.patch('/:id/status', updateStudentStatusController);
studentsRouter.get('/:id', getStudentController);
studentsRouter.patch('/:id', updateStudentController);
