import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  getReportCardPreviewController,
} from './report-cards.controller.js';

export const reportCardsRouter = Router();

reportCardsRouter.use(authenticate, requireActiveSubscription);

reportCardsRouter.use(
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
    'EXAMS_OFFICER',
  ),
);

reportCardsRouter.get(
  '/enrollments/:enrollmentId',
  getReportCardPreviewController,
);
