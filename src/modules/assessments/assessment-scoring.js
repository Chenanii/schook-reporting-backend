function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFinalSubjectMark(componentPercents, finalExamPercent) {
  if (componentPercents.length === 0) {
    throw new Error('At least one coursework or mid-term percentage is required.');
  }
  const continuousPercent = componentPercents.reduce((sum, percent) => sum + percent, 0) / componentPercents.length;
  return round2(continuousPercent * 0.4 + finalExamPercent * 0.6);
}
