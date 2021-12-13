const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const AppError = require('./../utils/appError');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: [true, `Username is required.`],
  },
  email: {
    type: String,
    trim: true,
    required: [true, `E-mail is required.`],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email.'],
  },
  photo: {
    type: String,
    default: 'blablabla',
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'guide', 'lead-guide'],
    default: 'user',
  },
  password: {
    type: String,
    trim: true,
    required: [true, `Password is required.`],
    minlength: [8, 'Password must contain at least 8 characters'],
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, 'Please confirm your password.'],
    validate: {
      //ONLY WORKS ON SAVE/CREATE, NOT UPDATE
      validator: function (value) {
        return this.password === value;
      },
      message: 'Passwords must match!',
    },
  },
  passwordChangedAt: {
    type: Date,
  },
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
});

userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

userSchema.pre('save', async function (next) {
  //only runs when pass is modified
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  // deletes passconfirm as we only need it to confirm correct pass
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;

  next();
});

//INSTANCE FUNCTION, AVAILABLE ON ALL USER DOCUMENTS
userSchema.methods.correctPassword = async function (candidatePass, userPass) {
  return await bcrypt.compare(candidatePass, userPass);
};

userSchema.methods.changesPasswordAfter = function (JWTTimestamp) {
  let toMilliseconds = 0;
  if (this.passwordChangedAt) {
    (toMilliseconds = this.passwordChangedAt.getTime() / 1000), 10;
  }
  return toMilliseconds > JWTTimestamp;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// ALL HOOKS HAVE TO BE DEFINED BEFORE DECLARING THIS
const User = mongoose.model('User', userSchema);
module.exports = User;
