
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  createStudentController,
  listStudentsController,
  getStudentController,
  updateStudentController,
  updateStudentStatusController
} from './students.controller.js';

export const studentsRouter = Router();

studentsRouter.use(authenticate, authorize('SUPER_ADMIN'));

studentsRouter.post('/', createStudentController);
studentsRouter.get('/', listStudentsController);
studentsRouter.patch('/:id/status', updateStudentStatusController);
studentsRouter.get('/:id', getStudentController);
studentsRouter.patch('/:id', updateStudentController);
