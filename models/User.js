import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  googleId: {
    type: String,
    sparse: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String,
    default: null,
  },
  authProvider: {
    type: String,
    enum: ['google', 'local'],
    default: 'local',
  },
  avatar: {
    type: String,
    default: '',
  },
  resetOtpHash: {
    type: String,
    default: null,
  },
  resetOtpExpires: {
    type: Date,
    default: null,
  },
  resetOtpAttempts: {
    type: Number,
    default: 0,
  },
  resetOtpCooldownUntil: {
    type: Date,
    default: null,
  },
  resetTokenHash: {
    type: String,
    default: null,
  },
  resetTokenExpires: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('User', UserSchema);
