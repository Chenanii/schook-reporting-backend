import test from 'node:test';
import assert from 'node:assert/strict';

import { updateSchoolProfileSchema } from '../../src/modules/subscriptions/subscriptions.validation.js';

test('accepts school report-card branding and signatory fields', () => {
  const result = updateSchoolProfileSchema.safeParse({
    address: '10 School Road',
    phone: '+1 555 0100',
    logoDataUrl: 'data:image/png;base64,aA==',
    classTeacherSignerName: 'Jane Teacher',
    headteacherSignerName: 'John Headteacher',
  });
  assert.equal(result.success, true);
});

test('allows removing the school logo and optional profile values', () => {
  const result = updateSchoolProfileSchema.safeParse({
    logoDataUrl: null,
    address: null,
    classTeacherSignerName: null,
  });
  assert.equal(result.success, true);
});

test('rejects unsupported logo formats', () => {
  const result = updateSchoolProfileSchema.safeParse({
    logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
  });
  assert.equal(result.success, false);
});
