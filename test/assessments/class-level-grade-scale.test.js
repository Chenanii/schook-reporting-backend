import test from 'node:test';
import assert from 'node:assert/strict';

import { getGradeScaleForClassLevel } from '../../src/modules/grade-scales/class-level-grade-scale.js';

function mockDatabase(classLevelScale, schoolScales) {
  return {
    classLevel: {
      findUnique: async () => ({ id: 'level-1', gradeScale: classLevelScale }),
    },
    gradeScale: {
      findMany: async () => schoolScales,
    },
  };
}

test('uses the scale assigned to a class level when multiple scales exist', async () => {
  const assigned = { id: 'primary', boundaries: [] };
  const scale = await getGradeScaleForClassLevel(
    mockDatabase(assigned, [{ id: 'secondary' }, assigned]),
    'level-1',
  );
  assert.equal(scale, assigned);
});

test('automatically uses the only school scale when no level scale is assigned', async () => {
  const onlyScale = { id: 'school-scale', boundaries: [] };
  const scale = await getGradeScaleForClassLevel(
    mockDatabase(null, [onlyScale]),
    'level-1',
  );
  assert.equal(scale, onlyScale);
});

test('requires a class-level choice when multiple school scales exist', async () => {
  await assert.rejects(
    getGradeScaleForClassLevel(
      mockDatabase(null, [{ id: 'primary' }, { id: 'secondary' }]),
      'level-1',
    ),
    (error) => error.code === 'CLASS_LEVEL_GRADE_SCALE_NOT_CONFIGURED',
  );
});

test('requires a grading scale when the school has none', async () => {
  await assert.rejects(
    getGradeScaleForClassLevel(mockDatabase(null, []), 'level-1'),
    (error) => error.code === 'GRADE_SCALE_NOT_CONFIGURED',
  );
});
