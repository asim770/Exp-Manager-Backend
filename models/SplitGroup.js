import mongoose from 'mongoose';

const MemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member',
  },
  status: {
    type: String,
    enum: ['accepted', 'pending', 'declined'],
    default: 'pending',
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const SplitItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  email: {
    type: String,
    default: '',
  },
  userName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const GroupExpenseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: String,
    default: 'General',
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  paidByName: {
    type: String,
    required: true,
  },
  splitType: {
    type: String,
    enum: ['equal', 'exact', 'percentage'],
    default: 'equal',
  },
  splits: [SplitItemSchema],
  date: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const SettlementSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fromName: {
    type: String,
    required: true,
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  toName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['completed', 'pending'],
    default: 'completed',
  },
  notes: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const SplitGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  emoji: {
    type: String,
    default: '👥',
  },
  currency: {
    type: String,
    default: 'INR',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [MemberSchema],
  expenses: [GroupExpenseSchema],
  settlements: [SettlementSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

SplitGroupSchema.index({ 'members.user': 1 });
SplitGroupSchema.index({ 'members.email': 1 });
SplitGroupSchema.index({ createdBy: 1 });

export default mongoose.model('SplitGroup', SplitGroupSchema);
