const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: false
  },
  content: {
    type: String,
    required: [true, 'Message content cannot be empty'],
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound indexes for optimizing query performance
messageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, sender: 1, createdAt: 1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ group: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
