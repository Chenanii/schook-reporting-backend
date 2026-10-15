
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createTeachingAssignmentController,
  listTeachingAssignmentsController,
  getTeachingAssignmentController,
  updateTeachingAssignmentController,
  deleteTeachingAssignmentController
} from './teaching-assignments.controller.js';

export const teachingAssignmentsRouter = Router();

teachingAssignmentsRouter.use(
  authenticate,
  requireActiveSubscription,
  authorize('SUPER_ADMIN', 'SCHOOL_ADMIN')
);

teachingAssignmentsRouter.post('/', createTeachingAssignmentController);
teachingAssignmentsRouter.get('/', listTeachingAssignmentsController);
teachingAssignmentsRouter.get('/:id', getTeachingAssignmentController);
teachingAssignmentsRouter.patch('/:id', updateTeachingAssignmentController);
teachingAssignmentsRouter.delete('/:id', deleteTeachingAssignmentController);
