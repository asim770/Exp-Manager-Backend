import mongoose from 'mongoose';

const LendSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    default: '',
  },
  amount: {
    type: Number,
    required: true,
  },
  remainingAmount: {
    type: Number,
    required: true,
  },
  lendingDate: {
    type: Date,
    default: Date.now,
    required: true,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  interest: {
    type: Number,
    default: 0,
  },
  notes: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending', 'repaid'],
    default: 'pending',
  },
  paymentHistory: [
    {
      date: {
        type: Date,
        default: Date.now,
      },
      amount: {
        type: Number,
        required: true,
      },
      notes: {
        type: String,
        default: '',
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Lend', LendSchema);
