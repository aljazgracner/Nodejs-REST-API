const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const { promisify } = require('util');
const sendEmail = require('./../utils/email');
const crypto = require('crypto');

const signToken = (id) => {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    role: req.body.role,
  });

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  //1) CHECK IF EMAIL/PASSWORD EXISTS
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }

  //2) CHECK IF USER EXISTS && PASSWORD CORRECT
  //user = document, so we can use the instance method on it
  const [user] = await User.find({ email: email }).select('+password +active');

  if (
    !user ||
    !user.active ||
    !(await user.correctPassword(password, user.password))
  ) {
    //401 means unauthorized
    return next(new AppError('Incorrect email or password', 401));
  }

  //3) IF OK, SEND TOKEN TO CLIENT
  createSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  //1)GETTING TOKEN AND CHECK IF IT EXISTS
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError(`You are not logged in.`, 401));
  }

  //2)VERIFICATION
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //3)CHECK IF USER STILL EXISTS
  const currentUser = await User.findById(decoded.id);

  if (!currentUser)
    return next(
      new AppError('The user belonging to this token no longer exists', 401)
    );

  //4)CHECK IF USER CHANGED PASSWORD AFTER THE JWT WAS ISSUED
  if (currentUser.changesPasswordAfter(decoded.iat)) {
    return next(
      new AppError('Password was recently changed. Please log in again.', 401)
    );
  }

  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'logged out', {
    expires: new Date(Date.now() + 10000),
    httpOnly: true,
  });

  res.status(200).json({
    status: 'success',
  });
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have a permission to do this action.', 403)
      );
    }
    next();
  };
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user)
    return next(new AppError(`User with specified email doesn't exist`, 404));

  const resetToken = user.createPasswordResetToken();

  //makes fields not mandatory, as we dont really have to put in password, only email.
  await user.save({ validateBeforeSave: false });

  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}. \n If you didn't forget your password, please ignore this email!`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your password reset token(valid for 10 min)',
      message,
    });
    res.status(200).json({
      status: 'success',
      passwordToken: 'Token sent to email!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpired = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending email. Please try again later.',
        500
      )
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  //1) GET USER BASED ON THE TOKEN
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //2) IF TOKEN OK AND THERE IS USER, SET NEW PASS
  if (!user) {
    next(new AppError('Token invalid or expired!', 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  //4) LOG USER IN, SEND JWT
  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  //1) GET USER
  const user = await User.findById(req.user.id).select('+password');

  //2) CHECK IF PASSWORD CORRECT
  if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
    return next(new AppError('Wrong current password!', 401));
  }

  //3) IF OK, UPDATE PASSWORD
  user.password = req.body.newPassword;
  user.passwordConfirm = req.body.newPasswordConfirm;
  await user.save();

  //4) LOG USER IN, SEND JWT
  createSendToken(user, 200, res);
});

//only for rendered pages
exports.isLoggedIn = async (req, res, next) => {
  //1)GETTING TOKEN AND CHECK IF IT EXISTS
  if (req.cookies.jwt) {
    try {
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      //CHECK IF USER STILL EXISTS
      const currentUser = await User.findById(decoded.id);

      if (!currentUser) return next();

      //CHECK IF USER CHANGED PASSWORD AFTER THE JWT WAS ISSUED
      if (currentUser.changesPasswordAfter(decoded.iat)) return next();

      //pug templates have access to res.locals.user
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};
