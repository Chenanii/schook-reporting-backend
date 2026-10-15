
import {
  createTeacherSchema,
  updateTeacherSchema,
  listTeachersSchema,
  acceptTeacherInvitationSchema,
} from './teachers.validation.js';

import {
  createTeacher,
  listTeachers,
  getTeacherById,
  updateTeacher,
  resendTeacherInvitation,
  revokeTeacherInvitation,
  acceptTeacherInvitation,
} from './teachers.service.js';

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: error.issues,
    },
  });
}

function actorIdFromRequest(req) {
  return req.user?.id ?? req.user?.userId ?? req.user?.sub;
}

export async function createTeacherController(req, res, next) {
  const parsed = createTeacherSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const result = await createTeacher(
      parsed.data,
      actorIdFromRequest(req),
      req
    );

    return res.status(201).json({
      success: true,
      message: result.invitationEmailSent
        ? 'Teacher registered and invitation email sent.'
        : 'Teacher registered, but the invitation email could not be sent. Resend the invitation after checking SMTP.',
      data: {
        teacher: result.teacher,
        invitationEmailSent: result.invitationEmailSent,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listTeachersController(req, res, next) {
  const parsed = listTeachersSchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const result = await listTeachers(parsed.data);
    return res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTeacherByIdController(req, res, next) {
  try {
    const teacher = await getTeacherById(req.params.id);
    return res.status(200).json({ success: true, data: teacher });
  } catch (error) {
    next(error);
  }
}

export async function updateTeacherController(req, res, next) {
  const parsed = updateTeacherSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const teacher = await updateTeacher(
      req.params.id,
      parsed.data,
      actorIdFromRequest(req),
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Teacher updated successfully.',
      data: teacher,
    });
  } catch (error) {
    next(error);
  }
}

export async function resendTeacherInvitationController(req, res, next) {
  try {
    const result = await resendTeacherInvitation(
      req.params.id,
      actorIdFromRequest(req),
      req
    );

    return res.status(result.invitationEmailSent ? 200 : 502).json({
      success: result.invitationEmailSent,
      message: result.invitationEmailSent
        ? 'A new teacher invitation has been sent.'
        : 'The invitation could not be emailed. Check the SMTP configuration and try again.',
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeTeacherInvitationController(req, res, next) {
  try {
    const result = await revokeTeacherInvitation(
      req.params.id,
      actorIdFromRequest(req),
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Pending invitations have been revoked.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function acceptTeacherInvitationController(req, res, next) {
  const parsed = acceptTeacherInvitationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const user = await acceptTeacherInvitation(parsed.data, req);

    return res.status(201).json({
      success: true,
      message: 'Teacher account activated. You can now log in.',
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
