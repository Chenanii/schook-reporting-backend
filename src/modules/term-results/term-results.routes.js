import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  listTermSubjectResultsController,
  finalizeTermSubjectResultsController,
  publishTermSubjectResultsController,
} from './term-results.controller.js';

export const termResultsRouter = Router();

termResultsRouter.use(authenticate);
termResultsRouter.use(
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
    'EXAMS_OFFICER',
  ),
);

termResultsRouter.get('/', listTermSubjectResultsController);
termResultsRouter.post(
  '/terms/:termId/classes/:classGroupId/subjects/:subjectId/finalize',
  finalizeTermSubjectResultsController,
);
termResultsRouter.post(
  '/terms/:termId/classes/:classGroupId/subjects/:subjectId/publish',
  publishTermSubjectResultsController,
);