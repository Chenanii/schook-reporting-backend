
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  createAcademicYearController,
  listAcademicYearsController,
  getAcademicYearController,
  updateAcademicYearController
} from './academic-years.controller.js';

export const academicYearsRouter = Router();

academicYearsRouter.use(authenticate, authorize('SUPER_ADMIN'));

academicYearsRouter.post('/', createAcademicYearController);
academicYearsRouter.get('/', listAcademicYearsController);
academicYearsRouter.get('/:id', getAcademicYearController);
academicYearsRouter.patch('/:id', updateAcademicYearController);
