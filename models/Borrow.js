import mongoose from 'mongoose';

const BorrowSchema = new mongoose.Schema({
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
  borrowDate: {
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
    default: 0, // Annual or flat interest rate % (optional)
  },
  notes: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
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

export default mongoose.model('Borrow', BorrowSchema);
