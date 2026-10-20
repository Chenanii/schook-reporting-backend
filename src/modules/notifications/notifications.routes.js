import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';
import {
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from './notifications.controller.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);
notificationsRouter.use(requireActiveSubscription);
notificationsRouter.use(authorize(
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'ACADEMIC_ADMIN',
  'EXAMS_OFFICER',
  'TEACHER',
  'FORM_TUTOR',
  'STUDENT',
  'PARENT',
));

notificationsRouter.get('/', listNotificationsController);
notificationsRouter.patch('/read-all', markAllNotificationsReadController);
notificationsRouter.patch('/:id/read', markNotificationReadController);
