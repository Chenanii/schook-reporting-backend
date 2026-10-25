import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription, requireReportsBeforeTermEnd } from '../../middleware/require-active-subscription.js';
import { saveReportCardDetailsController } from './report-card-details.controller.js';

import {
  getClassGroupReportCardsController,
  getReportCardPreviewController,
  publishClassGroupEndOfTermReportsController,
  unpublishClassGroupEndOfTermReportsController,
} from './report-cards.controller.js';

export const reportCardsRouter = Router();

reportCardsRouter.use(authenticate, requireActiveSubscription, requireReportsBeforeTermEnd);

reportCardsRouter.use(
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
    'EXAMS_OFFICER',
    'TEACHER',
    'FORM_TUTOR',
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

reportCardsRouter.put('/enrollments/:enrollmentId/details', saveReportCardDetailsController('END_OF_TERM'));

reportCardsRouter.post(
  '/terms/:termId/class-groups/:classGroupId/publish',
  publishClassGroupEndOfTermReportsController,
);

reportCardsRouter.post(
  '/terms/:termId/class-groups/:classGroupId/unpublish',
  unpublishClassGroupEndOfTermReportsController,
);
