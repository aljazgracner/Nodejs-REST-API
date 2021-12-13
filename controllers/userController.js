const AppError = require('../utils/appError');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const factory = require('./handlerFactory');

const filterObj = (object, ...allowedFields) => {
  const newObj = {};
  allowedFields.forEach((el) => {
    if (object[el]) newObj[el] = object[el];
  });
  return newObj;
};

exports.getMe = catchAsync(async (req, res, next) => {
  req.params.id = req.user._id;
  next();
});
exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) CREATE ERROR IF USER TRIES TO UPDATE PASSWORD
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('This route is not for password updates', 400));
  }

  //2)FILTER UNWANTED PROPERTIES
  const filteredBody = filterObj(req.body, 'name', 'email');

  //3)UPDATE USER DOCUMENT
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      updatedUser,
    },
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.createUser = (req, res) => {
  res.status(201).json({
    status: 'error',
    message: 'Route not defined! Please use sign up.',
  });
};
//dont update passwords with this!
exports.updateUser = factory.updateOne(User);

exports.getUser = factory.getOne(User);
exports.getAllUsers = factory.getAll(User);
exports.deleteUser = factory.deleteOne(User);
