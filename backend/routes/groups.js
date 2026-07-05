const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const GroupInvite = require('../models/GroupInvite');
const Message = require('../models/Message');
const User = require('../models/User');

// Helper to broadcast socket events to all members of a group
const broadcastToGroupMembers = async (req, groupId, event, data, excludeUserId = null) => {
  try {
    const io = req.app.get('io');
    if (!io) return;
    const group = await Group.findById(groupId);
    if (!group) return;

    group.members.forEach((memberId) => {
      const idStr = memberId.toString();
      if (excludeUserId && idStr === excludeUserId.toString()) return;
      io.to(idStr).emit(event, data);
    });
  } catch (error) {
    console.error('Error broadcasting to group members:', error);
  }
};

// POST /api/groups - Create a new group
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    const currentUserId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    const newGroup = new Group({
      name: name.trim(),
      creator: currentUserId,
      admin: currentUserId,
      members: [currentUserId]
    });

    await newGroup.save();

    // Populate members for response
    const populatedGroup = await Group.findById(newGroup._id).populate('members', 'name email profilePic');

    res.status(201).json(populatedGroup);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error creating group.' });
  }
});

// GET /api/groups - Fetch all groups current user belongs to
router.get('/', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groups = await Group.find({ members: currentUserId })
      .populate('members', 'name email profilePic')
      .populate('admin', 'name email profilePic');
    res.json(groups);
  } catch (error) {
    console.error('Fetch groups error:', error);
    res.status(500).json({ error: 'Server error retrieving groups.' });
  }
});

// GET /api/groups/:groupId/messages - Retrieve group message history
router.get('/:groupId/messages', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const currentUserId = req.user.id;

    // Check if group exists and user is a member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }
    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    const messages = await Message.find({ group: groupId })
      .populate('sender', 'name email profilePic')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Fetch group messages error:', error);
    res.status(500).json({ error: 'Server error retrieving group messages.' });
  }
});

// POST /api/groups/:groupId/messages - Send a message to a group
router.post('/:groupId/messages', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content } = req.body;
    const currentUserId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }
    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    const newMessage = new Message({
      sender: currentUserId,
      group: groupId,
      content: content.trim()
    });

    await newMessage.save();

    // Populate sender details for live UI updates
    const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'name email profilePic');

    // Broadcast message to all group members in real-time
    await broadcastToGroupMembers(req, groupId, 'receive_group_message', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Send group message error:', error);
    res.status(500).json({ error: 'Server error sending group message.' });
  }
});

// DELETE /api/groups/:groupId/messages - Clear group chat history (admin only)
router.delete('/:groupId/messages', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const currentUserId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Only admin can wipe the entire chat
    if (group.admin.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Only the group admin can clear the chat history.' });
    }

    await Message.deleteMany({ group: groupId });

    // Notify all members
    await broadcastToGroupMembers(req, groupId, 'group_chat_cleared', { groupId });

    res.json({ message: 'Group chat history cleared successfully.' });
  } catch (error) {
    console.error('Clear group messages error:', error);
    res.status(500).json({ error: 'Server error clearing group messages.' });
  }
});

// POST /api/groups/:groupId/invite - Invite a user to join the group
router.post('/:groupId/invite', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    const currentUserId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'User email is required to invite.' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Only admin or members can invite? Let's restrict invitations to the group admin
    if (group.admin.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Only the group admin can invite members.' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      return res.status(404).json({ error: 'User with this email not found.' });
    }

    // Check if target user is already in group
    if (group.members.includes(targetUser._id)) {
      return res.status(400).json({ error: 'User is already a member of this group.' });
    }

    // Check if there is already a pending invite
    const inviteExists = await GroupInvite.findOne({
      group: groupId,
      invitedUser: targetUser._id,
      status: 'pending'
    });
    if (inviteExists) {
      return res.status(400).json({ error: 'An invitation is already pending for this user.' });
    }

    const newInvite = new GroupInvite({
      group: groupId,
      invitedUser: targetUser._id,
      invitedBy: currentUserId
    });

    await newInvite.save();

    // Populate for real-time socket payload
    const populatedInvite = await GroupInvite.findById(newInvite._id)
      .populate('group', 'name')
      .populate('invitedBy', 'name email');

    // Emit live Socket.io alert to the invited user
    const io = req.app.get('io');
    if (io) {
      io.to(targetUser._id.toString()).emit('group_invite_received', populatedInvite);
    }

    res.status(201).json({ message: 'Invitation sent successfully.', invite: populatedInvite });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Server error sending invitation.' });
  }
});

// GET /api/groups/invites - Fetch pending group invitations for the current user
router.get('/invites', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const invites = await GroupInvite.find({ invitedUser: currentUserId, status: 'pending' })
      .populate('group', 'name creator admin members')
      .populate('invitedBy', 'name email profilePic');
    res.json(invites);
  } catch (error) {
    console.error('Fetch invites error:', error);
    res.status(500).json({ error: 'Server error retrieving invitations.' });
  }
});

// POST /api/groups/invites/:inviteId/accept - Accept a group invitation
router.post('/invites/:inviteId/accept', auth, async (req, res) => {
  try {
    const { inviteId } = req.params;
    const currentUserId = req.user.id;

    const invite = await GroupInvite.findById(inviteId);
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found.' });
    }

    if (invite.invitedUser.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Access denied. This invitation belongs to another user.' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation is no longer pending.' });
    }

    invite.status = 'accepted';
    await invite.save();

    const group = await Group.findById(invite.group);
    if (!group) {
      return res.status(404).json({ error: 'Group no longer exists.' });
    }

    // Add user to group members list
    if (!group.members.includes(currentUserId)) {
      group.members.push(currentUserId);
      await group.save();
    }

    const updatedGroup = await Group.findById(invite.group)
      .populate('members', 'name email profilePic')
      .populate('admin', 'name email profilePic');

    // Notify all members of group update (real-time reload of lists)
    await broadcastToGroupMembers(req, invite.group, 'group_update', updatedGroup);

    res.json({ message: 'Invitation accepted. Joined group!', group: updatedGroup });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Server error accepting invitation.' });
  }
});

// POST /api/groups/invites/:inviteId/decline - Decline a group invitation
router.post('/invites/:inviteId/decline', auth, async (req, res) => {
  try {
    const { inviteId } = req.params;
    const currentUserId = req.user.id;

    const invite = await GroupInvite.findById(inviteId);
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found.' });
    }

    if (invite.invitedUser.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Access denied. This invitation belongs to another user.' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation is no longer pending.' });
    }

    invite.status = 'declined';
    await invite.save();

    res.json({ message: 'Invitation declined.' });
  } catch (error) {
    console.error('Decline invite error:', error);
    res.status(500).json({ error: 'Server error declining invitation.' });
  }
});

// PUT /api/groups/:groupId/name - Update group name (admin only)
router.put('/:groupId/name', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    const currentUserId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name cannot be empty.' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (group.admin.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Access denied. Only the admin can modify the group name.' });
    }

    group.name = name.trim();
    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'name email profilePic')
      .populate('admin', 'name email profilePic');

    // Notify all members
    await broadcastToGroupMembers(req, groupId, 'group_update', updatedGroup);

    res.json(updatedGroup);
  } catch (error) {
    console.error('Update group name error:', error);
    res.status(500).json({ error: 'Server error updating group name.' });
  }
});

// PUT /api/groups/:groupId/admin - Transfer admin role to another member (admin only)
router.put('/:groupId/admin', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { newAdminId } = req.body;
    const currentUserId = req.user.id;

    if (!newAdminId) {
      return res.status(400).json({ error: 'New admin user ID is required.' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (group.admin.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Access denied. Only the admin can transfer the admin role.' });
    }

    if (!group.members.includes(newAdminId)) {
      return res.status(400).json({ error: 'New admin must be a member of the group.' });
    }

    group.admin = newAdminId;
    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'name email profilePic')
      .populate('admin', 'name email profilePic');

    // Notify all members
    await broadcastToGroupMembers(req, groupId, 'group_update', updatedGroup);

    res.json(updatedGroup);
  } catch (error) {
    console.error('Transfer group admin error:', error);
    res.status(500).json({ error: 'Server error transferring admin role.' });
  }
});

// DELETE /api/groups/:groupId/members/:userId - Remove a member from the group (admin only)
router.delete('/:groupId/members/:userId', auth, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const currentUserId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (group.admin.toString() !== currentUserId) {
      return res.status(403).json({ error: 'Access denied. Only the admin can remove members.' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'You cannot remove yourself. Use Leave Group instead.' });
    }

    if (!group.members.includes(userId)) {
      return res.status(400).json({ error: 'User is not a member of this group.' });
    }

    group.members = group.members.filter((memberId) => memberId.toString() !== userId);
    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'name email profilePic')
      .populate('admin', 'name email profilePic');

    // Notify the kicked user so their UI cleans up/removes the group
    const io = req.app.get('io');
    if (io) {
      io.to(userId).emit('group_kicked', { groupId });
    }

    // Notify all remaining members
    await broadcastToGroupMembers(req, groupId, 'group_update', updatedGroup);

    res.json(updatedGroup);
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({ error: 'Server error removing member.' });
  }
});

// POST /api/groups/:groupId/leave - Leave the group (members only)
router.post('/:groupId/leave', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const currentUserId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(400).json({ error: 'You are not a member of this group.' });
    }

    // If they are the admin, they must transfer role first
    if (group.admin.toString() === currentUserId && group.members.length > 1) {
      return res.status(400).json({ error: 'You are the admin. You must transfer the admin role before leaving.' });
    }

    group.members = group.members.filter((memberId) => memberId.toString() !== currentUserId);

    // If no members are left, delete the group entirely
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
      await Message.deleteMany({ group: groupId });
      return res.json({ message: 'Left group. Group deleted as it had no members remaining.' });
    }

    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'name email profilePic')
      .populate('admin', 'name email profilePic');

    // Notify remaining members
    await broadcastToGroupMembers(req, groupId, 'group_update', updatedGroup);

    res.json({ message: 'Successfully left the group.' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Server error leaving group.' });
  }
});

module.exports = router;
