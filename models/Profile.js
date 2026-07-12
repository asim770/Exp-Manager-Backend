import mongoose from 'mongoose';

const ProfileSchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'Asim Maji',
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
