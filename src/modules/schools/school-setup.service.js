import { prisma } from '../../lib/prisma.js';

export async function getSchoolSetupStatus(schoolId) {
  if (!schoolId) return { required: false, complete: true, steps: [] };
  const [counts] = await prisma.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM "AcademicYear" WHERE "schoolId" = ${schoolId}) AS "academicYears",
      (SELECT count(*)::int FROM "Term" WHERE "schoolId" = ${schoolId}) AS "terms",
      (SELECT count(*)::int FROM "GradeScale" WHERE "schoolId" = ${schoolId}) AS "gradeScales",
      (SELECT count(*)::int FROM "GradeBoundary" WHERE "schoolId" = ${schoolId}) AS "gradeBoundaries",
      (SELECT count(*)::int FROM "ClassLevel" WHERE "schoolId" = ${schoolId}) AS "classLevels",
      (SELECT count(*)::int FROM "ClassLevel" WHERE "schoolId" = ${schoolId} AND "gradeScaleId" IS NOT NULL) AS "gradedClassLevels",
      (SELECT count(*)::int FROM "ClassGroup" WHERE "schoolId" = ${schoolId}) AS "classGroups",
      (SELECT count(*)::int FROM "Subject" WHERE "schoolId" = ${schoolId}) AS "subjects",
      (SELECT count(*)::int FROM "ClassSubject" WHERE "schoolId" = ${schoolId}) AS "classSubjects",
      (SELECT count(*)::int FROM "Teacher" WHERE "schoolId" = ${schoolId}) AS "teachers",
      (SELECT count(*)::int FROM "Student" WHERE "schoolId" = ${schoolId}) AS "students",
      (SELECT count(*)::int FROM "Enrollment" WHERE "schoolId" = ${schoolId} AND "status" = 'ACTIVE') AS "activeEnrollments"
  `;
  const { academicYears, terms, gradeScales, gradeBoundaries, classLevels, gradedClassLevels, classGroups, subjects, classSubjects, teachers, students, activeEnrollments } = counts;
  const steps = [
    { id: 'calendar', title: 'Academic calendar', complete: academicYears > 0 && terms > 0, counts: { academicYears, terms } },
    { id: 'grading', title: 'Grading scale', complete: gradeScales > 0 && gradeBoundaries >= 2, counts: { gradeScales, gradeBoundaries } },
    // A single school grading scale is applied automatically by the class-level UI,
    // so levels may legitimately have a null gradeScaleId in that case.
    { id: 'classes', title: 'Class structure', complete: classLevels > 0 && classGroups > 0 && (gradeScales === 1 || gradedClassLevels === classLevels), counts: { classLevels, gradedClassLevels, classGroups, gradeScales } },
    { id: 'curriculum', title: 'Subjects and curriculum', complete: subjects > 0 && classSubjects > 0, counts: { subjects, classSubjects } },
    { id: 'staff', title: 'Teaching staff', complete: teachers > 0, counts: { teachers } },
    { id: 'students', title: 'Enrol your first student', complete: students > 0 && activeEnrollments > 0, counts: { students, activeEnrollments } }
  ];
  return { required: true, complete: steps.every((step) => step.complete), steps };
}
