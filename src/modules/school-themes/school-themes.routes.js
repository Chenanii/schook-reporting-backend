import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  getSchoolThemeController,
  updateSchoolThemeController
} from './school-themes.controller.js';

export const schoolThemesRouter = Router();

schoolThemesRouter.use(
  authenticate,
  requireActiveSubscription
);

schoolThemesRouter.get(
  '/',
  authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'),
  getSchoolThemeController
);

schoolThemesRouter.patch(
  '/',
  authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  updateSchoolThemeController
);