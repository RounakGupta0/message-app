const mongoose = require('mongoose');

const groupInviteSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  invitedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure compound index for fast queries and query optimization
groupInviteSchema.index({ group: 1, invitedUser: 1, status: 1 });

module.exports = mongoose.model('GroupInvite', groupInviteSchema);
