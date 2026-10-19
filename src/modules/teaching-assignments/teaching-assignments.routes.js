
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createTeachingAssignmentController,
  listTeachingAssignmentsController,
  getTeachingAssignmentController,
  updateTeachingAssignmentController,
  deleteTeachingAssignmentController,
  listFormTutorAssignmentsController,
  saveFormTutorAssignmentController
} from './teaching-assignments.controller.js';
import {
  getStudentStreamRosterController,
  saveStudentStreamRosterController,
} from './student-streams.controller.js';

export const teachingAssignmentsRouter = Router();

teachingAssignmentsRouter.use(
  authenticate,
  requireActiveSubscription
);

teachingAssignmentsRouter.get(
  '/',
  authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'EXAMS_OFFICER', 'TEACHER'),
  listTeachingAssignmentsController
);

teachingAssignmentsRouter.use(authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'));
teachingAssignmentsRouter.get('/form-tutors', listFormTutorAssignmentsController);
teachingAssignmentsRouter.put('/form-tutors', saveFormTutorAssignmentController);
teachingAssignmentsRouter.get('/:assignmentId/student-streams', getStudentStreamRosterController);
teachingAssignmentsRouter.put('/:assignmentId/student-streams', saveStudentStreamRosterController);
teachingAssignmentsRouter.post('/', createTeachingAssignmentController);
teachingAssignmentsRouter.get('/:id', getTeachingAssignmentController);
teachingAssignmentsRouter.patch('/:id', updateTeachingAssignmentController);
teachingAssignmentsRouter.delete('/:id', deleteTeachingAssignmentController);
