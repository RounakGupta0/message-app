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

// PUT /api/users/profile-pic - Upload or update profile picture
router.put('/profile-pic', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { profilePic } = req.body;

    if (!profilePic) {
      return res.status(400).json({ error: 'Profile picture data is required.' });
    }

    const user = await User.findByIdAndUpdate(
      currentUserId,
      { profilePic },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    console.error('Update profile pic error:', error);
    res.status(500).json({ error: 'Server error updating profile picture.' });
  }
});

// DELETE /api/users/profile-pic - Remove profile picture
router.delete('/profile-pic', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const user = await User.findByIdAndUpdate(
      currentUserId,
      { profilePic: null },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    console.error('Delete profile pic error:', error);
    res.status(500).json({ error: 'Server error removing profile picture.' });
  }
});

module.exports = router;
