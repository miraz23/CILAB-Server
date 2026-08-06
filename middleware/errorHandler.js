const AppError = require('../utils/appError');

function errorHandler(err, req, res, next) {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  const response = {
    success: false,
    message: err.message || 'Internal server error.',
  };

  if (process.env.NODE_ENV === 'production') {
    if (err instanceof AppError) {
      res.status(err.statusCode).json(response);
    } else {
      console.error(err);
      res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
  } else {
    res.status(err.statusCode).json({
      ...response,
      error: err,
      stack: err.stack,
    });
  }
}

module.exports = errorHandler;