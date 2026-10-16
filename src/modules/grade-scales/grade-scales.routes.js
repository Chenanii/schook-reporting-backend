import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';
import { createGradeScaleController, listGradeScalesController } from './grade-scales.controller.js';

export const gradeScalesRouter = Router();

gradeScalesRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'));
gradeScalesRouter.get('/', listGradeScalesController);
gradeScalesRouter.post('/', createGradeScaleController);
