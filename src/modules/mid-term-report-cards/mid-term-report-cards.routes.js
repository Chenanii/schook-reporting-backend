import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  getClassGroupMidTermReportCardsController,
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

// GET /mid-term-report-cards/terms/:termId/class-groups/:classGroupId[?allowIncomplete=true]
midTermReportCardsRouter.get(
  '/terms/:termId/class-groups/:classGroupId',
  getClassGroupMidTermReportCardsController,
);