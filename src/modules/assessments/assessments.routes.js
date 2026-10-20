import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createAssessmentController,
  listAssessmentsController,
  getAssessmentController,
  updateAssessmentController,
  deleteAssessmentController,
} from './assessments.controller.js';

import {
  getAssessmentResultsController,
  saveAssessmentResultsController,
} from './assessment-results.controller.js';

import {
  transitionAssessmentController,
  resetAssessmentController,
} from './assessment-lifecycle.controller.js';

import {
  calculateTermSubjectResultsController,
} from './term-results-calculation.controller.js';

export const assessmentsRouter = Router();

assessmentsRouter.use(
  authenticate,
  requireActiveSubscription,
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
    'EXAMS_OFFICER',
    'TEACHER',
  ),
);

assessmentsRouter.post('/', createAssessmentController);
assessmentsRouter.get('/', listAssessmentsController);
assessmentsRouter.get('/:id', getAssessmentController);
assessmentsRouter.patch('/:id', updateAssessmentController);
assessmentsRouter.delete('/:id', deleteAssessmentController);
assessmentsRouter.get('/:id/results', getAssessmentResultsController);
assessmentsRouter.put('/:id/results', saveAssessmentResultsController);
assessmentsRouter.post('/:id/transition', transitionAssessmentController);
assessmentsRouter.post(
  '/:id/reset',
  authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'),
  resetAssessmentController,
);
assessmentsRouter.post(
  '/terms/:termId/results/calculate',
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
    'EXAMS_OFFICER',
  ),
  calculateTermSubjectResultsController,
);
