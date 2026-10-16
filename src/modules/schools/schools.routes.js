import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { schoolSignupRateLimit } from '../../middleware/school-signup-rate-limit.js';
import {
  registerSchoolController, listSchoolsController, updateSchoolStatusController,
  currentSchoolController, updateCurrentSchoolController
} from '../subscriptions/subscriptions.controller.js';

export const schoolsRouter = Router();

schoolsRouter.post('/signup', schoolSignupRateLimit, registerSchoolController);
schoolsRouter.get('/current', authenticate, authorize('SCHOOL_ADMIN', 'HEADTEACHER'), currentSchoolController);
schoolsRouter.patch('/current', authenticate, authorize('SCHOOL_ADMIN', 'HEADTEACHER'), updateCurrentSchoolController);
schoolsRouter.get('/', authenticate, authorize('SUPER_ADMIN'), listSchoolsController);
schoolsRouter.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), updateSchoolStatusController);
