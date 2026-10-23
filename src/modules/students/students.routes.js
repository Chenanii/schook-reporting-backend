
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
  updateStudentStatusController,
  studentClassDistributionController,
  downloadStudentQrController,
  exportStudentsWithQrController
} from './students.controller.js';

export const studentsRouter = Router();

studentsRouter.use(authenticate, requireActiveSubscription);

studentsRouter.post('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), requirePlanCapacity('students'), createStudentController);
studentsRouter.get('/distribution', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), studentClassDistributionController);
studentsRouter.get('/qr-export', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN'), exportStudentsWithQrController);
studentsRouter.get('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'TEACHER'), listStudentsController);
studentsRouter.get('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'TEACHER'), getStudentController);
studentsRouter.get('/:id/qr', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN'), downloadStudentQrController);
studentsRouter.patch('/:id/status', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), updateStudentStatusController);
studentsRouter.patch('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'), updateStudentController);
