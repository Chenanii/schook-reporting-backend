import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';
import { saveReportCardDetailsController } from '../report-cards/report-card-details.controller.js';

import {
  getClassGroupMidTermReportCardsController,
  publishClassGroupMidTermReportsController,
  getMidTermReportCardPreviewController,
} from './mid-term-report-cards.controller.js';

export const midTermReportCardsRouter = Router();

midTermReportCardsRouter.use(authenticate, requireActiveSubscription);

// Keep this list identical to your report-cards router.
midTermReportCardsRouter.use(
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

// GET /mid-term-report-cards/enrollments/:enrollmentId[?allowIncomplete=true]
midTermReportCardsRouter.get('/enrollments/:enrollmentId', getMidTermReportCardPreviewController);
midTermReportCardsRouter.put('/enrollments/:enrollmentId/details', saveReportCardDetailsController('MID_TERM'));

// GET /mid-term-report-cards/terms/:termId/class-groups/:classGroupId[?allowIncomplete=true]
midTermReportCardsRouter.get(
  '/terms/:termId/class-groups/:classGroupId',
  getClassGroupMidTermReportCardsController,
);
midTermReportCardsRouter.post(
  '/terms/:termId/class-groups/:classGroupId/publish',
  authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'),
  publishClassGroupMidTermReportsController,
);
