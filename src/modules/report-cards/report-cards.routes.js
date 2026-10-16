import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  getClassGroupReportCardsController,
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
    'TEACHER',
  ),
);

reportCardsRouter.get(
  '/terms/:termId/class-groups/:classGroupId',
  getClassGroupReportCardsController,
);

reportCardsRouter.get(
  '/enrollments/:enrollmentId',
  getReportCardPreviewController,
);
