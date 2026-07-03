const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/users - Get all users (except currently logged-in user)
router.get('/', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    // Find all users except the current user, excluding passwords
    const users = await User.find({ _id: { $ne: currentUserId } }).select('-password');
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Server error retrieving user list.' });
  }
});

module.exports = router;
