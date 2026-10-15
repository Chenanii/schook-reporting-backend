export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected server error occurred.'
    : (err.message || 'An unexpected server error occurred.');

  if (status >= 500) console.error(err);
  res.status(status).json({
    success: false,
    error: {
      code: err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
      message
    }
  });
}
