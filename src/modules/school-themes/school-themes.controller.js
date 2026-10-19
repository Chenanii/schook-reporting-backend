import {
  getSchoolTheme,
  updateSchoolTheme
} from './school-themes.service.js';

import { updateSchoolThemeSchema } from './school-themes.validation.js';

export async function getSchoolThemeController(req, res, next) {
  try {
    const theme = await getSchoolTheme(req.schoolId);

    return res.status(200).json({
      success: true,
      data: theme
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSchoolThemeController(req, res, next) {
  try {
    const parsed = updateSchoolThemeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The supplied theme settings are invalid.',
          details: parsed.error.issues
        }
      });
    }

    const theme = await updateSchoolTheme(
      req.schoolId,
      parsed.data,
      req.user,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'School theme updated successfully.',
      data: theme
    });
  } catch (error) {
    next(error);
  }
}