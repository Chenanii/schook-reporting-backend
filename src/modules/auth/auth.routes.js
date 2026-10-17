import { Router } from 'express';
import {
  loginController,
  meController,
  changePasswordController
} from './auth.controller.js';

import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimit } from '../../middleware/login-rate-limit.js';
import {
  parentPortalRateLimit,
  parentPortalRegistrationRateLimit,
} from '../../middleware/parent-portal-rate-limit.js';
import {
  createParentPortalAccountController,
  requestParentPortalVerificationController,
} from '../parent-portal/parent-auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, loginController);
authRouter.post('/parent-portal/verification', parentPortalRateLimit, requestParentPortalVerificationController);
authRouter.post('/parent-portal/register', parentPortalRegistrationRateLimit, createParentPortalAccountController);
authRouter.get('/me', authenticate, meController);
authRouter.post(
  '/change-password',
  authenticate,
  changePasswordController
);
