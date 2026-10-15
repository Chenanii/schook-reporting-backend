export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const prismaStatus = err.code === 'P2002' ? 409 : err.code === 'P2025' ? 404 : null;
  const status = Number.isInteger(err.statusCode) ? err.statusCode : (prismaStatus ?? 500);
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected server error occurred.'
    : (err.message || 'An unexpected server error occurred.');

  if (status >= 500) console.error(err);
  res.status(status).json({
    success: false,
    error: {
      code: err.code === 'P2002'
        ? 'DUPLICATE_VALUE'
        : err.code === 'P2025'
          ? 'RECORD_NOT_FOUND'
          : (err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR')),
      message
    }
  });
}
