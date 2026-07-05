const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Group = require('../models/Group');
const auth = require('../middleware/auth');

// GET /api/messages/conversations - Get recent conversations list
router.get('/conversations', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const conversations = await Message.aggregate([
      // 1. Find all messages sent by or to the current user
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(currentUserId) },
            { recipient: new mongoose.Types.ObjectId(currentUserId) }
          ]
        }
      },
      // 2. Sort by creation date descending so the first in group is the newest
      { $sort: { createdAt: -1 } },
      // 3. Group by the "other user" in the conversation
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$sender', new mongoose.Types.ObjectId(currentUserId)] },
              then: '$recipient',
              else: '$sender'
            }
          },
          lastMessage: { $first: '$$ROOT' }
        }
      },
      // 4. Join user details for the other user
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'otherUser'
        }
      },
      // 5. Unwind the joined user array
      { $unwind: '$otherUser' },
      // 6. Project and format fields cleanly
      {
        $project: {
          _id: 0,
          user: {
            _id: '$otherUser._id',
            name: '$otherUser.name',
            email: '$otherUser.email',
            profilePic: '$otherUser.profilePic'
          },
          lastMessage: {
            content: '$lastMessage.content',
            sender: '$lastMessage.sender',
            createdAt: '$lastMessage.createdAt'
          }
        }
      },
      // 7. Sort conversations by the last message date descending
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);

    res.json(conversations);
  } catch (error) {
    console.error('Fetch conversations error:', error);
    res.status(500).json({ error: 'Server error retrieving conversations.' });
  }
});

// GET /api/messages/:userId - Get full message history between current user and userId
router.get('/:userId', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: otherUserId },
        { sender: otherUserId, recipient: currentUserId }
      ]
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Server error retrieving messages.' });
  }
});

// POST /api/messages/:userId - Send a direct message to userId
router.post('/:userId', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ error: 'Invalid recipient ID.' });
    }

    const newMessage = new Message({
      sender: currentUserId,
      recipient: otherUserId,
      content: content.trim()
    });

    await newMessage.save();

    // Emit live WebSocket events if users are online
    const io = req.app.get('io');

    io.to(otherUserId).emit('receive_message', newMessage);

    // Trigger conversation list reload for both users in real-time
    io.to(currentUserId).emit('conversation_update', { senderId: currentUserId });
    io.to(otherUserId).emit('conversation_update', { senderId: currentUserId });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error sending message.' });
  }
});

// DELETE /api/messages/:messageId - Delete a single message
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    if (message.sender.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own messages.' });
    }

    await Message.findByIdAndDelete(messageId);

    const io = req.app.get('io');
    if (io) {
      if (message.group) {
        // Broadcast to group members
        const group = await Group.findById(message.group);
        if (group) {
          group.members.forEach(memberId => {
            io.to(memberId.toString()).emit('message_deleted', { messageId, groupId: message.group });
          });
        }
      } else {
        // Send to sender and recipient
        io.to(message.sender.toString()).emit('message_deleted', { messageId, recipientId: message.recipient });
        io.to(message.recipient.toString()).emit('message_deleted', { messageId, recipientId: message.sender });
      }
    }

    res.json({ message: 'Message deleted successfully.' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Server error deleting message.' });
  }
});

// DELETE /api/messages/conversation/:userId - Clear direct chat history between current user and target user
router.delete('/conversation/:userId', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    // Delete all direct messages between these two users
    await Message.deleteMany({
      $or: [
        { sender: currentUserId, recipient: otherUserId },
        { sender: otherUserId, recipient: currentUserId }
      ],
      group: null
    });

    const io = req.app.get('io');
    if (io) {
      io.to(currentUserId).emit('chat_cleared', { otherUserId });
      io.to(otherUserId).emit('chat_cleared', { otherUserId: currentUserId });
    }

    res.json({ message: 'Chat history cleared successfully.' });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Server error clearing chat history.' });
  }
});

module.exports = router;
