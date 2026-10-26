import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { schoolSignupRateLimit, schoolNameAvailabilityRateLimit } from '../../middleware/school-signup-rate-limit.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';
import { schoolSetupStatusController } from './school-setup.controller.js';
import {
  registerSchoolController, listSchoolsController, updateSchoolStatusController,
  currentSchoolController, updateCurrentSchoolController, checkSchoolNameAvailabilityController
} from '../subscriptions/subscriptions.controller.js';

export const schoolsRouter = Router();

schoolsRouter.post('/signup', schoolSignupRateLimit, registerSchoolController);
schoolsRouter.get('/name-availability', schoolNameAvailabilityRateLimit, checkSchoolNameAvailabilityController);
schoolsRouter.get('/current', authenticate, authorize(
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'ACADEMIC_ADMIN',
  'EXAMS_OFFICER',
  'TEACHER',
  'STUDENT',
  'PARENT',
), currentSchoolController);
schoolsRouter.get('/setup-status', authenticate, authorize(
  'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER', 'TEACHER', 'FORM_TUTOR'
), schoolSetupStatusController);
schoolsRouter.patch('/current', authenticate, requireActiveSubscription, authorize('SCHOOL_ADMIN', 'HEADTEACHER'), updateCurrentSchoolController);
schoolsRouter.get('/', authenticate, authorize('SUPER_ADMIN'), listSchoolsController);
schoolsRouter.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), updateSchoolStatusController);
