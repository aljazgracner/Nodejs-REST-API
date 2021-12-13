const AppError = require('../utils/appError');
const deepCopy = require('deepcopy');

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;

  return new AppError(message, 400);
};

const handleDuplicateIdErrorDB = (err) => {
  let key, value;
  for (const x in err.keyValue) {
    key = x;
    value = err.keyValue[x];
  }
  const message = `Invalid ${key}(${value}). ${key} is already in use.`;

  return new AppError(message, 400);
};

const handleValidatorErrorDB = (err) => {
  const allErrors = Object.values(err.errors)
    .map((val) => val.message)
    .join('; ');
  return new AppError(`Invalid input: ${allErrors}`, 400);
};

const handleInvalidSignatureJWT = () =>
  new AppError(`Invalid token. Please log in again!`, 401);

const handleExpiredTokenJWT = () =>
  new AppError('Your token has expired. Please log in again.', 401);

const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    if (err.isOperational)
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    //log error
    console.error('ERROR: ', err);
    //send generic message
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
  if (err.isOperational)
    return res.status(err.statusCode).render('error', {
      title: 'Something went wrong!',
      msg: err.message,
    });
  //log error
  console.error('ERROR: ', err);
  //send generic message
  return res.status(500).render('error', {
    title: 'Something went very wrong!',
    msg: 'Please try again later.',
  });
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = deepCopy(err);
    if (error.name === 'CastError') {
      error = handleCastErrorDB(error);
    }
    if (error.code == '11000') {
      error = handleDuplicateIdErrorDB(error);
    }
    if (error.errors) {
      error = handleValidatorErrorDB(error);
    }
    if (error.name === 'JsonWebTokenError') {
      error = handleInvalidSignatureJWT();
    }
    if (error.name === 'TokenExpiredError') {
      error = handleExpiredTokenJWT();
    }
    if (error) sendErrorProd(error, req, res);
  }
};
