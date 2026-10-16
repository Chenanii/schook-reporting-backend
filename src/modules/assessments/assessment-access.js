export function teacherAssessmentScope(userId) {
  return userId
    ? { teachingAssignment: { teacher: { userId } } }
    : {};
}
