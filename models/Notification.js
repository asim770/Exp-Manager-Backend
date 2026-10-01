import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['budget', 'payment', 'savings', 'general', 'group_invite', 'group'],
    default: 'general',
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  read: {
    type: Boolean,
    default: false,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

NotificationSchema.index({ user: 1, date: -1 });
NotificationSchema.index({ user: 1, read: 1 });

export default mongoose.model('Notification', NotificationSchema);
