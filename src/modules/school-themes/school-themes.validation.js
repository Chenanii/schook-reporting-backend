import { z } from 'zod';

const hexColor = z.string().regex(
  /^#[0-9a-fA-F]{6}$/,
  'Color must be a valid six-digit hexadecimal value, e.g. #216b49.'
);

const fontFamilies = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Poppins',
  'Arial',
  'system-ui'
];

export const updateSchoolThemeSchema = z.object({
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),

  pageBackground: hexColor.optional(),
  surfaceColor: hexColor.optional(),
  textColor: hexColor.optional(),
  mutedTextColor: hexColor.optional(),
  borderColor: hexColor.optional(),

  mode: z.enum(['LIGHT', 'DARK']).optional(),
  fontFamily: z.enum(fontFamilies).optional()
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one theme setting to update.' }
);