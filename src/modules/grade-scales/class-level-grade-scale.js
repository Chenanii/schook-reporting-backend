function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function getGradeScaleForClassLevel(db, classLevelId) {
  const classLevel = await db.classLevel.findUnique({
    where: { id: classLevelId },
    select: {
      id: true,
      gradeScale: {
        include: { boundaries: { orderBy: { minPercent: 'asc' } } },
      },
    },
  });

  if (!classLevel) {
    throw httpError(404, 'CLASS_LEVEL_NOT_FOUND', 'Class level not found.');
  }
  if (classLevel.gradeScale) return classLevel.gradeScale;

  const scales = await db.gradeScale.findMany({
    take: 2,
    include: { boundaries: { orderBy: { minPercent: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  if (scales.length === 0) {
    throw httpError(409, 'GRADE_SCALE_NOT_CONFIGURED', 'Create a grading scale before calculating results.');
  }
  if (scales.length > 1) {
    throw httpError(
      409,
      'CLASS_LEVEL_GRADE_SCALE_NOT_CONFIGURED',
      'Assign a grading scale to this class level before calculating results. Go to Class levels and edit this level.',
    );
  }
  return scales[0];
}
