import { Router } from 'express';
import {
  loginController,
  meController,
  changePasswordController
} from './auth.controller.js';

import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimit } from '../../middleware/login-rate-limit.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, loginController);
authRouter.get('/me', authenticate, meController);
authRouter.post(
  '/change-password',
  authenticate,
  changePasswordController
);
