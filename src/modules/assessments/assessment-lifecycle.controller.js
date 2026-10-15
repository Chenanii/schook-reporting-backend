import { transitionAssessment } from './assessment-lifecycle.service.js';

export async function transitionAssessmentController(req, res) {
  const assessment = await transitionAssessment(
    req.params.id,
    req.user.id,
    req,
  );

  return res.status(200).json({
    success: true,
    message: `Assessment moved to ${assessment.status}.`,
    data: assessment,
  });
}
