import mongoose from 'mongoose';

const ProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  name: {
    type: String,
    default: 'User',
  },
  currency: {
    type: String,
    default: 'USD',
  },
  monthlyBudget: {
    type: Number,
    default: 2000,
  },
  budgetAlertPercentage: {
    type: Number,
    default: 80,
  },
  savingsGoal: {
    type: Number,
    default: 5000,
  },
  theme: {
    type: String,
    enum: ['light', 'dark'],
    default: 'dark',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Profile', ProfileSchema);
