import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, LogOut, Users, MessageCircle, ArrowLeft, Trash, Plus, Check, X, Info, Settings, MoreVertical, Edit2, Shield, UserX, Crown } from 'lucide-react';
import io from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4500';

export default function ChatDashboard({ user, onLogout }) {
  // Navigation & Base States
  const [activeTab, setActiveTab] = useState('chats'); // 'chats', 'groups', or 'people'
  const [currentUser, setCurrentUser] = useState(user);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  
  // Selected Chat States
  const [activeChat, setActiveChat] = useState(null); // Selected direct recipient user
  const [activeGroup, setActiveGroup] = useState(null); // Selected group
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  // Search & Profile UI States
  const [peopleSearchQuery, setPeopleSearchQuery] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Create Group Modal States
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [createGroupError, setCreateGroupError] = useState('');
  const [createGroupLoading, setCreateGroupLoading] = useState(false);

  // Group Settings Modal States
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [groupInfoName, setGroupInfoName] = useState('');
  const [groupInviteEmail, setGroupInviteEmail] = useState('');
  const [groupInfoError, setGroupInfoError] = useState('');
  const [groupInfoSuccess, setGroupInfoSuccess] = useState('');

  // Group Invites View States
  const [showInvitesModal, setShowInvitesModal] = useState(false);

  // Typing Indicator States
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const [groupTypingUsers, setGroupTypingUsers] = useState([]); // List of typing members: { senderId, senderName }

  // Refs for tracking active objects inside socket callbacks (preventing closure staleness)
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const activeChatRef = useRef(activeChat);
  const activeGroupRef = useRef(activeGroup);
  
  const token = localStorage.getItem('token');

  // Keep references synced
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  // Fetch recent direct conversations
  const fetchConversations = async (silent = false) => {
    try {
      const res = await fetch(`${apiUrl}/api/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  // Fetch all users list
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // Fetch joined groups list
  const fetchGroups = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  };

  // Fetch pending invitations
  const fetchGroupInvites = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/groups/invites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroupInvites(data);
      }
    } catch (err) {
      console.error('Error fetching invites:', err);
    }
  };

  // Fetch direct messages with activeChat
  const fetchMessages = async (silent = false) => {
    const currentChat = activeChatRef.current;
    if (!currentChat) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetch(`${apiUrl}/api/messages/${currentChat._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Fetch group messages with activeGroup
  const fetchGroupMessages = async (silent = false) => {
    const currentGroup = activeGroupRef.current;
    if (!currentGroup) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetch(`${apiUrl}/api/groups/${currentGroup._id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching group messages:', err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchConversations();
    fetchGroupInvites();
    fetchGroups();

    // Establish WebSocket connection
    const socket = io(apiUrl, {
      auth: { token },
      transports: ['websocket']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      fetchConversations(true);
      fetchGroupInvites();
      fetchGroups();
      if (activeChatRef.current) fetchMessages(true);
      if (activeGroupRef.current) fetchGroupMessages(true);
    });

    // Handle incoming direct messages
    const handleReceiveMessage = (message) => {
      const currentActiveChat = activeChatRef.current;
      if (currentActiveChat && (message.sender === currentActiveChat._id || message.recipient === currentActiveChat._id)) {
        setMessages((prev) => {
          if (prev.some(m => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
      fetchConversations(true);
    };

    // Handle incoming group messages
    const handleReceiveGroupMessage = (message) => {
      const currentActiveGroup = activeGroupRef.current;
      if (currentActiveGroup && message.group === currentActiveGroup._id) {
        setMessages((prev) => {
          if (prev.some(m => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
      fetchGroups();
    };

    // Handle group listings update
    const handleGroupUpdate = (updatedGroup) => {
      setGroups((prev) => prev.map(g => g._id === updatedGroup._id ? updatedGroup : g));
      const currentActiveGroup = activeGroupRef.current;
      if (currentActiveGroup && currentActiveGroup._id === updatedGroup._id) {
        setActiveGroup(updatedGroup);
      }
    };

    // Handle user removed from a group
    const handleGroupKicked = (data) => {
      setGroups((prev) => prev.filter(g => g._id !== data.groupId));
      const currentActiveGroup = activeGroupRef.current;
      if (currentActiveGroup && currentActiveGroup._id === data.groupId) {
        setActiveGroup(null);
        alert('You have been removed from this group by the admin.');
      }
    };

    // Handle new group invite
    const handleGroupInviteReceived = (invite) => {
      setGroupInvites((prev) => {
        if (prev.some(i => i._id === invite._id)) return prev;
        return [invite, ...prev];
      });
    };

    // Typing Status Relays
    const handleTyping = (data) => {
      const currentActiveChat = activeChatRef.current;
      if (currentActiveChat && data.senderId === currentActiveChat._id) {
        setIsRecipientTyping(true);
      }
    };

    const handleStopTyping = (data) => {
      const currentActiveChat = activeChatRef.current;
      if (currentActiveChat && data.senderId === currentActiveChat._id) {
        setIsRecipientTyping(false);
      }
    };

    const handleGroupTyping = (data) => {
      const currentActiveGroup = activeGroupRef.current;
      if (currentActiveGroup && data.groupId === currentActiveGroup._id) {
        setGroupTypingUsers((prev) => {
          if (prev.some(u => u.senderId === data.senderId)) return prev;
          return [...prev, { senderId: data.senderId, senderName: data.senderName }];
        });
      }
    };

    const handleGroupStopTyping = (data) => {
      const currentActiveGroup = activeGroupRef.current;
      if (currentActiveGroup && data.groupId === currentActiveGroup._id) {
        setGroupTypingUsers((prev) => prev.filter(u => u.senderId !== data.senderId));
      }
    };

    // Deletions / Wipes
    const handleMessageDeleted = (data) => {
      setMessages((prev) => prev.filter(m => m._id !== data.messageId));
      fetchConversations(true);
    };

    const handleChatCleared = (data) => {
      const currentActiveChat = activeChatRef.current;
      if (currentActiveChat && data.otherUserId === currentActiveChat._id) {
        setMessages([]);
      }
      fetchConversations(true);
    };

    const handleGroupChatCleared = (data) => {
      const currentActiveGroup = activeGroupRef.current;
      if (currentActiveGroup && data.groupId === currentActiveGroup._id) {
        setMessages([]);
      }
    };

    const handleConversationUpdate = (data) => {
      if (data && data.senderId === currentUser.id) return;
      fetchConversations(true);
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('receive_group_message', handleReceiveGroupMessage);
    socket.on('group_update', handleGroupUpdate);
    socket.on('group_kicked', handleGroupKicked);
    socket.on('group_invite_received', handleGroupInviteReceived);
    
    socket.on('typing', handleTyping);
    socket.on('stop_typing', handleStopTyping);
    socket.on('group_typing', handleGroupTyping);
    socket.on('group_stop_typing', handleGroupStopTyping);
    
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('chat_cleared', handleChatCleared);
    socket.on('group_chat_cleared', handleGroupChatCleared);
    socket.on('conversation_update', handleConversationUpdate);

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch messages when direct contact selection changes
  useEffect(() => {
    if (activeChat) {
      fetchMessages();
      setIsRecipientTyping(false);
      isTypingRef.current = false;
    }
  }, [activeChat]);

  // Fetch messages when group chat selection changes
  useEffect(() => {
    if (activeGroup) {
      fetchGroupMessages();
      setGroupTypingUsers([]);
      isTypingRef.current = false;
      setGroupInfoName(activeGroup.name);
    }
  }, [activeGroup]);

  // Scroll messages stream on update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingMessages]);

  // Handle message sending (Direct and Group)
  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;

    if (activeChat) {
      if (socketRef.current) {
        socketRef.current.emit('stop_typing', { recipientId: activeChat._id });
      }

      // Optimistic Render
      const tempMessageId = `temp-${Date.now()}`;
      const optimisticMessage = {
        _id: tempMessageId,
        sender: currentUser.id,
        recipient: activeChat._id,
        content: messageText,
        createdAt: new Date().toISOString()
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const res = await fetch(`${apiUrl}/api/messages/${activeChat._id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ content: messageText })
        });

        if (res.ok) {
          const data = await res.json();
          setMessages((prev) => prev.map(m => m._id === tempMessageId ? data : m));
          fetchConversations(true);
        } else {
          setMessages((prev) => prev.filter(m => m._id !== tempMessageId));
        }
      } catch (err) {
        console.error('Error sending message:', err);
        setMessages((prev) => prev.filter(m => m._id !== tempMessageId));
      }
    } else if (activeGroup) {
      if (socketRef.current) {
        socketRef.current.emit('group_stop_typing', { groupId: activeGroup._id });
      }

      // Optimistic Render
      const tempMessageId = `temp-${Date.now()}`;
      const optimisticMessage = {
        _id: tempMessageId,
        sender: {
          _id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          profilePic: currentUser.profilePic
        },
        group: activeGroup._id,
        content: messageText,
        createdAt: new Date().toISOString()
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ content: messageText })
        });

        if (res.ok) {
          const data = await res.json();
          setMessages((prev) => prev.map(m => m._id === tempMessageId ? data : m));
        } else {
          setMessages((prev) => prev.filter(m => m._id !== tempMessageId));
        }
      } catch (err) {
        console.error('Error sending group message:', err);
        setMessages((prev) => prev.filter(m => m._id !== tempMessageId));
      }
    }
  };

  // Typing events triggers
  const handleInputChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);

    if (!socketRef.current) return;

    if (activeChat) {
      if (val.trim().length > 0) {
        if (!isTypingRef.current) {
          isTypingRef.current = true;
          socketRef.current.emit('typing', {
            senderName: currentUser.name,
            recipientId: activeChat._id
          });
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          socketRef.current.emit('stop_typing', { recipientId: activeChat._id });
          isTypingRef.current = false;
        }, 2000);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        socketRef.current.emit('stop_typing', { recipientId: activeChat._id });
        isTypingRef.current = false;
      }
    } else if (activeGroup) {
      if (val.trim().length > 0) {
        if (!isTypingRef.current) {
          isTypingRef.current = true;
          socketRef.current.emit('group_typing', {
            senderName: currentUser.name,
            groupId: activeGroup._id
          });
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          socketRef.current.emit('group_stop_typing', { groupId: activeGroup._id });
          isTypingRef.current = false;
        }, 2000);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        socketRef.current.emit('group_stop_typing', { groupId: activeGroup._id });
        isTypingRef.current = false;
      }
    }
  };

  // Group Creation
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreateGroupLoading(true);
    setCreateGroupError('');

    try {
      const res = await fetch(`${apiUrl}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newGroupName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setGroups((prev) => [data, ...prev]);
        setActiveGroup(data);
        setActiveChat(null);
        setNewGroupName('');
        setShowCreateGroupModal(false);
      } else {
        setCreateGroupError(data.error || 'Failed to create group.');
      }
    } catch (err) {
      setCreateGroupError('Network error. Please try again.');
    } finally {
      setCreateGroupLoading(false);
    }
  };

  // Group Invitation Management
  const handleAcceptInvite = async (inviteId) => {
    try {
      const res = await fetch(`${apiUrl}/api/groups/invites/${inviteId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Remove from invites and load group
        setGroupInvites((prev) => prev.filter(i => i._id !== inviteId));
        setGroups((prev) => {
          if (prev.some(g => g._id === data.group._id)) return prev;
          return [data.group, ...prev];
        });
        setActiveGroup(data.group);
        setActiveChat(null);
        setShowInvitesModal(false);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to accept invitation.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      const res = await fetch(`${apiUrl}/api/groups/invites/${inviteId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setGroupInvites((prev) => prev.filter(i => i._id !== inviteId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to decline invitation.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Group Settings Administration
  const handleInviteToGroup = async (e) => {
    e.preventDefault();
    if (!groupInviteEmail.trim()) return;
    setGroupInfoError('');
    setGroupInfoSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: groupInviteEmail.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setGroupInfoSuccess(`Invitation successfully sent to ${groupInviteEmail}`);
        setGroupInviteEmail('');
      } else {
        setGroupInfoError(data.error || 'Failed to invite user.');
      }
    } catch (err) {
      setGroupInfoError('Network error. Please try again.');
    }
  };

  const handleUpdateGroupName = async (e) => {
    e.preventDefault();
    if (!groupInfoName.trim() || groupInfoName.trim() === activeGroup.name) return;
    setGroupInfoError('');
    setGroupInfoSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: groupInfoName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setGroupInfoSuccess('Group name updated successfully!');
        setGroups((prev) => prev.map(g => g._id === data._id ? data : g));
        setActiveGroup(data);
      } else {
        setGroupInfoError(data.error || 'Failed to update name.');
      }
    } catch (err) {
      setGroupInfoError('Network error.');
    }
  };

  const handleTransferAdmin = async (memberId) => {
    if (!window.confirm('Are you sure you want to transfer your admin role to this member? You will lose admin settings.')) return;
    setGroupInfoError('');
    setGroupInfoSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newAdminId: memberId })
      });
      const data = await res.json();
      if (res.ok) {
        setGroupInfoSuccess('Admin role transferred successfully!');
        setGroups((prev) => prev.map(g => g._id === data._id ? data : g));
        setActiveGroup(data);
      } else {
        setGroupInfoError(data.error || 'Failed to transfer admin.');
      }
    } catch (err) {
      setGroupInfoError('Network error.');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member from the group?')) return;
    setGroupInfoError('');
    setGroupInfoSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setGroupInfoSuccess('Member removed from the group.');
        setGroups((prev) => prev.map(g => g._id === data._id ? data : g));
        setActiveGroup(data);
      } else {
        setGroupInfoError(data.error || 'Failed to remove member.');
      }
    } catch (err) {
      setGroupInfoError('Network error.');
    }
  };

  const handleLeaveGroup = async () => {
    const isReady = activeGroup.admin._id === currentUser.id 
      ? window.confirm('You are the admin. You must transfer the admin role first before leaving. Or if you are the last member, leaving will delete the group. Do you want to proceed?')
      : window.confirm('Are you sure you want to leave this group?');
    if (!isReady) return;

    try {
      const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setGroups((prev) => prev.filter(g => g._id !== activeGroup._id));
        setActiveGroup(null);
        setShowGroupInfoModal(false);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to leave group.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // User Profile Picture updates
  const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 1024 * 1024) { // Limit size: 1MB
      alert('File size too large. Please upload an image under 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64String = reader.result;
      try {
        const res = await fetch(`${apiUrl}/api/users/profile-pic`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ profilePic: base64String })
        });
        const data = await res.json();
        if (res.ok) {
          setCurrentUser(data);
          localStorage.setItem('user', JSON.stringify(data));
          setShowProfileDropdown(false);
        } else {
          alert(data.error || 'Failed to upload photo.');
        }
      } catch (err) {
        console.error(err);
        alert('Network error uploading profile pic.');
      }
    };
  };

  const handleProfilePicRemove = async () => {
    if (!window.confirm('Are you sure you want to remove your profile picture?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/users/profile-pic`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data);
        localStorage.setItem('user', JSON.stringify(data));
        setShowProfileDropdown(false);
      } else {
        alert(data.error || 'Failed to remove photo.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Message Deletions
  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setMessages((prev) => prev.filter(m => m._id !== messageId));
        fetchConversations(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete message.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearChat = async () => {
    if (activeChat) {
      if (!window.confirm(`Are you sure you want to clear your entire chat history with ${activeChat.name}? This will delete the messages.`)) return;

      try {
        const res = await fetch(`${apiUrl}/api/messages/conversation/${activeChat._id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setMessages([]);
          fetchConversations(true);
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to clear chat.');
        }
      } catch (err) {
        console.error(err);
      }
    } else if (activeGroup) {
      if (!window.confirm('Are you sure you want to wipe all messages in this group chat? Only the group admin can perform this action.')) return;

      try {
        const res = await fetch(`${apiUrl}/api/groups/${activeGroup._id}/messages`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setMessages([]);
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to wipe group messages.');
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helpers to check group roles
  const isGroupAdmin = activeGroup && activeGroup.admin && (activeGroup.admin._id === currentUser.id || activeGroup.admin === currentUser.id);

  // Search filter
  const filteredUsers = users.filter((item) =>
    item.name.toLowerCase().includes(peopleSearchQuery.toLowerCase()) ||
    item.email.toLowerCase().includes(peopleSearchQuery.toLowerCase())
  );

  return (
    <div className={`dashboard-layout ${activeChat || activeGroup ? 'active-chat-selected' : ''}`}>
      {/* Sidebar Panel */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">SecureChat</div>
          <div className="profile-container" style={{ position: 'relative' }}>
            <button 
              className="avatar-btn" 
              onClick={() => setShowProfileDropdown(!showProfileDropdown)} 
              title="Profile Options"
            >
              {currentUser.profilePic ? (
                <img src={currentUser.profilePic} alt="Profile" className="avatar-img" />
              ) : (
                <div className="avatar-badge font-semibold" style={{ margin: 0 }}>
                  {getInitials(currentUser.name)}
                </div>
              )}
            </button>
            
            {showProfileDropdown && (
              <div className="profile-dropdown-menu">
                <div className="dropdown-user-info">
                  <div className="dropdown-user-name">{currentUser.name}</div>
                  <div className="dropdown-user-email">{currentUser.email}</div>
                </div>
                <div className="dropdown-divider" />
                <label className="dropdown-item clickable">
                  Upload Photo
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleProfilePicUpload} 
                    style={{ display: 'none' }} 
                  />
                </label>
                {currentUser.profilePic && (
                  <button className="dropdown-item btn-danger-text" onClick={handleProfilePicRemove}>
                    Remove Photo
                  </button>
                )}
                <button className="dropdown-item" onClick={() => { setShowCreateGroupModal(true); setShowProfileDropdown(false); }}>
                  Create Group
                </button>
                <button className="dropdown-item" onClick={() => { setShowInvitesModal(true); setShowProfileDropdown(false); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Group Invites 
                  {groupInvites.length > 0 && <span className="invites-count">{groupInvites.length}</span>}
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item btn-danger-text" onClick={() => { setShowLogoutConfirm(true); setShowProfileDropdown(false); }}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Selection */}
        <div className="sidebar-tabs">
          <button
            className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('chats');
              setActiveChat(null);
              setActiveGroup(null);
            }}
          >
            Chats
          </button>
          <button
            className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('groups');
              setActiveChat(null);
              setActiveGroup(null);
              fetchGroups();
            }}
          >
            Groups
          </button>
          <button
            className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('people');
              setActiveChat(null);
              setActiveGroup(null);
              if (users.length === 0) {
                fetchUsers();
              }
            }}
          >
            People
          </button>
        </div>

        {/* Dynamic Sidebar Listings */}
        <div className="list-container">
          {activeTab === 'chats' ? (
            conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlignment: 'center', color: 'var(--text-secondary)' }}>
                No active conversations. Switch to "People" to start chatting!
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.user._id}
                  className={`card-item ${activeChat?._id === conv.user._id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChat(conv.user);
                    setActiveGroup(null);
                    setMessages([]);
                  }}
                >
                  <div className="avatar-badge">
                    {conv.user.profilePic ? (
                      <img src={conv.user.profilePic} alt="" className="avatar-img" />
                    ) : (
                      getInitials(conv.user.name)
                    )}
                  </div>
                  <div className="card-info">
                    <div className="card-name-row">
                      <div className="card-name">{conv.user.name}</div>
                      <div className="card-time">{formatTime(conv.lastMessage.createdAt)}</div>
                    </div>
                    <div className="card-message-row">
                      <div className="card-message">
                        {conv.lastMessage.sender === currentUser.id ? 'You: ' : ''}
                        {conv.lastMessage.content}
                      </div>
                      <div className="see-messages-btn">See messages</div>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : activeTab === 'groups' ? (
            groups.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlignment: 'center', color: 'var(--text-secondary)' }}>
                No groups joined yet. Click your profile avatar to "Create Group" or accept invites!
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group._id}
                  className={`card-item ${activeGroup?._id === group._id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveGroup(group);
                    setActiveChat(null);
                    setMessages([]);
                  }}
                >
                  <div className="avatar-badge">
                    {group.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="card-info">
                    <div className="card-name-row">
                      <div className="card-name">{group.name}</div>
                    </div>
                    <div className="card-message-row">
                      <div className="card-message" style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>
                        {group.members.length} members
                      </div>
                      <div className="see-messages-btn">See chat</div>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            <>
              <div className="search-bar-container" style={{ padding: '10px 16px 5px 16px' }}>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={peopleSearchQuery}
                  onChange={(e) => setPeopleSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              
              {filteredUsers.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlignment: 'center', color: 'var(--text-secondary)' }}>
                  No matching users found.
                </div>
              ) : (
                filteredUsers.map((item) => (
                  <div
                    key={item._id}
                    className={`card-item ${activeChat?._id === item._id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveChat(item);
                      setActiveGroup(null);
                      setMessages([]);
                    }}
                  >
                    <div className="avatar-badge">
                      {item.profilePic ? (
                        <img src={item.profilePic} alt="" className="avatar-img" />
                      ) : (
                        getInitials(item.name)
                      )}
                    </div>
                    <div className="card-info">
                      <div className="card-name-row">
                        <div className="card-name">{item.name}</div>
                      </div>
                      <div className="card-message-row">
                        <div className="card-message" style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>
                          Click to start a conversation
                        </div>
                        <div className="see-messages-btn">See messages</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Messaging Panel */}
      <div className="chat-area">
        {activeChat ? (
          <>
            {/* Direct Contact Info Header */}
            <div className="chat-header">
              <button className="back-btn" onClick={() => setActiveChat(null)} title="Back to conversations">
                <ArrowLeft size={20} />
              </button>
              {activeChat.profilePic ? (
                <img src={activeChat.profilePic} alt="" className="avatar-badge active-chat avatar-img" />
              ) : (
                <div className="avatar-badge active-chat">{getInitials(activeChat.name)}</div>
              )}
              <div style={{ flex: 1 }}>
                <div className="chat-header-name">{activeChat.name}</div>
                <div className="chat-header-email">{activeChat.email}</div>
              </div>
              <button className="chat-header-icon-btn btn-danger-text" onClick={handleClearChat} title="Clear Chat History">
                <Trash size={18} />
              </button>
            </div>

            {/* Direct Messages Stream */}
            <div className="messages-stream">
              {loadingMessages && messages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <div className="spinner" />
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-chat" style={{ flex: 1 }}>
                  <MessageCircle size={36} />
                  <div className="empty-chat-title">Say hello to {activeChat.name}</div>
                  <p style={{ color: 'var(--text-secondary)' }}>Type a message below to start your conversation.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg._id}
                    className={`message-row ${msg.sender === currentUser.id ? 'sent' : 'received'}`}
                  >
                    <div className="message-bubble-container">
                      <div className="message-bubble">
                        <div>{msg.content}</div>
                        <span className="message-time-stamp">{formatTime(msg.createdAt)}</span>
                      </div>
                      {msg.sender === currentUser.id && (
                        <button className="delete-msg-btn" onClick={() => handleDeleteMessage(msg._id)} title="Delete message">
                          <Trash size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator Bar */}
            {isRecipientTyping && (
              <div className="typing-indicator-bar">
                <span>{activeChat.name} is typing</span>
                <div className="typing-dots">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}

            {/* Input Form Panel */}
            <div className="chat-input-area">
              <form onSubmit={handleSend} className="chat-input-form">
                <input
                  type="text"
                  className="chat-input-field"
                  placeholder={`Message ${activeChat.name}...`}
                  value={newMessage}
                  onChange={handleInputChange}
                  maxLength={1000}
                />
                <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : activeGroup ? (
          <>
            {/* Group Chat Info Header */}
            <div className="chat-header">
              <button className="back-btn" onClick={() => setActiveGroup(null)} title="Back to groups">
                <ArrowLeft size={20} />
              </button>
              <div className="avatar-badge active-chat">{activeGroup.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div className="chat-header-name">{activeGroup.name}</div>
                <div className="chat-header-email" style={{ fontStyle: 'italic' }}>
                  {activeGroup.members.length} members
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isGroupAdmin && (
                  <button className="chat-header-icon-btn btn-danger-text" onClick={handleClearChat} title="Clear Group Messages">
                    <Trash size={18} />
                  </button>
                )}
                <button className="chat-header-icon-btn" onClick={() => { setShowGroupInfoModal(true); setGroupInfoError(''); setGroupInfoSuccess(''); }} title="Group Settings">
                  <Info size={18} />
                </button>
              </div>
            </div>

            {/* Group Messages Stream */}
            <div className="messages-stream">
              {loadingMessages && messages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <div className="spinner" />
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-chat" style={{ flex: 1 }}>
                  <MessageCircle size={36} />
                  <div className="empty-chat-title">Welcome to {activeGroup.name}</div>
                  <p style={{ color: 'var(--text-secondary)' }}>There are no messages in this group yet. Send a message to get started!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const senderId = msg.sender?._id || msg.sender;
                  const isSent = senderId === currentUser.id;
                  return (
                    <div
                      key={msg._id}
                      className={`message-row ${isSent ? 'sent' : 'received'}`}
                      style={{ alignItems: 'flex-start', gap: '8px' }}
                    >
                      {!isSent && (
                        <div className="message-sender-avatar" style={{ alignSelf: 'flex-end', marginBottom: '4px' }}>
                          {msg.sender?.profilePic ? (
                            <img src={msg.sender.profilePic} alt="" className="avatar-img-small" />
                          ) : (
                            <div className="avatar-badge-small">{getInitials(msg.sender?.name || 'User')}</div>
                          )}
                        </div>
                      )}
                      
                      <div className="message-bubble-wrapper" style={{ display: 'flex', flexDirection: 'column' }}>
                        {!isSent && (
                          <span className="message-sender-name" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '4px', marginBottom: '2px' }}>
                            {msg.sender?.name || 'Unknown User'}
                          </span>
                        )}
                        <div className="message-bubble-container">
                          <div className="message-bubble">
                            <div>{msg.content}</div>
                            <span className="message-time-stamp">{formatTime(msg.createdAt)}</span>
                          </div>
                          {isSent && (
                            <button className="delete-msg-btn" onClick={() => handleDeleteMessage(msg._id)} title="Delete message">
                              <Trash size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Group Typing Indicator Bar */}
            {groupTypingUsers.length > 0 && (
              <div className="typing-indicator-bar">
                <span>
                  {groupTypingUsers.length === 1 
                    ? `${groupTypingUsers[0].senderName} is typing` 
                    : `${groupTypingUsers.map(u => u.senderName).join(', ')} are typing`}
                </span>
                <div className="typing-dots">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}

            {/* Input Form Panel */}
            <div className="chat-input-area">
              <form onSubmit={handleSend} className="chat-input-form">
                <input
                  type="text"
                  className="chat-input-field"
                  placeholder={`Message ${activeGroup.name}...`}
                  value={newMessage}
                  onChange={handleInputChange}
                  maxLength={1000}
                />
                <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="empty-chat">
            <MessageSquare size={48} style={{ color: 'var(--accent-primary)', marginBottom: '15px' }} />
            <div className="empty-chat-title">Select a Conversation</div>
            <p>Choose an active chat or group from the sidebar, or search users in "People" to start messaging.</p>
          </div>
        )}
      </div>

      {/* Profile Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Sign Out</h3>
            <p>Are you sure you want to sign out of SecureChat?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={onLogout}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Create Group Chat</h3>
              <button className="close-btn" onClick={() => setShowCreateGroupModal(false)}><X size={18} /></button>
            </div>
            {createGroupError && <div className="alert alert-danger" style={{ padding: '8px 12px', marginBottom: '12px' }}>{createGroupError}</div>}
            
            <form onSubmit={handleCreateGroup}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">Group Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: '14px' }} 
                  placeholder="e.g. Project Collaborators"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  maxLength={50}
                  required 
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateGroupModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={createGroupLoading}>
                  {createGroupLoading ? <div className="spinner" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending Group Invites Modal */}
      {showInvitesModal && (
        <div className="modal-overlay" onClick={() => setShowInvitesModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Group Invitations</h3>
              <button className="close-btn" onClick={() => setShowInvitesModal(false)}><X size={18} /></button>
            </div>

            {groupInvites.length === 0 ? (
              <div style={{ padding: '20px 0', textAlignment: 'center', color: 'var(--text-secondary)' }}>
                No pending invitations at this time.
              </div>
            ) : (
              <div className="invites-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                {groupInvites.map((invite) => (
                  <div key={invite._id} className="invite-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{invite.group?.name || 'Unknown Group'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Invited by: {invite.invitedBy?.name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="invite-btn accept" onClick={() => handleAcceptInvite(invite._id)} title="Accept Invitation">
                        <Check size={16} />
                      </button>
                      <button className="invite-btn decline" onClick={() => handleDeclineInvite(invite._id)} title="Decline Invitation">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: '15px' }}>
              <button className="btn-secondary" onClick={() => setShowInvitesModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Group Info / Settings Modal */}
      {showGroupInfoModal && activeGroup && (
        <div className="modal-overlay" onClick={() => setShowGroupInfoModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Group Settings</h3>
              <button className="close-btn" onClick={() => setShowGroupInfoModal(false)}><X size={18} /></button>
            </div>

            {groupInfoError && <div className="alert alert-danger" style={{ padding: '8px 12px', marginBottom: '12px' }}>{groupInfoError}</div>}
            {groupInfoSuccess && <div className="alert alert-success" style={{ padding: '8px 12px', marginBottom: '12px' }}>{groupInfoSuccess}</div>}

            {/* Admin Block: Group Rename */}
            {isGroupAdmin ? (
              <form onSubmit={handleUpdateGroupName} style={{ marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Rename Group</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ paddingLeft: '14px' }}
                    value={groupInfoName}
                    onChange={(e) => setGroupInfoName(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: 'auto', height: '42px' }} disabled={groupInfoName.trim() === activeGroup.name}>
                  Save
                </button>
              </form>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <div className="form-label">Group Name</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{activeGroup.name}</div>
              </div>
            )}

            {/* Admin Block: Invite User */}
            {isGroupAdmin && (
              <form onSubmit={handleInviteToGroup} style={{ marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Invite Member (User Email)</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    style={{ paddingLeft: '14px' }} 
                    placeholder="user@example.com"
                    value={groupInviteEmail}
                    onChange={(e) => setGroupInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: 'auto', height: '42px' }}>
                  Invite
                </button>
              </form>
            )}

            {/* Members List */}
            <div style={{ marginBottom: '20px' }}>
              <div className="form-label">Members ({activeGroup.members.length})</div>
              <div className="group-members-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {activeGroup.members.map((member) => {
                  const isAdmin = activeGroup.admin && (activeGroup.admin._id === member._id || activeGroup.admin === member._id);
                  return (
                    <div key={member._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.4)', borderRadius: '6px', border: '1px solid rgba(13,148,136,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {member.profilePic ? (
                          <img src={member.profilePic} alt="" className="avatar-img-small" />
                        ) : (
                          <div className="avatar-badge-small">{getInitials(member.name)}</div>
                        )}
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {member.name} {member._id === currentUser.id && '(You)'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{member.email}</div>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {isAdmin && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(13,148,136,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            <Crown size={10} /> Admin
                          </span>
                        )}
                        
                        {isGroupAdmin && member._id !== currentUser.id && (
                          <>
                            <button className="member-action-btn" onClick={() => handleTransferAdmin(member._id)} title="Transfer Admin Role" style={{ color: 'var(--accent-primary)' }}>
                              <Crown size={14} />
                            </button>
                            <button className="member-action-btn" onClick={() => handleRemoveMember(member._id)} title="Remove Member" style={{ color: 'var(--error-color)' }}>
                              <UserX size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn-danger" onClick={handleLeaveGroup} style={{ width: 'auto' }}>
                Leave Group
              </button>
              <button className="btn-secondary" onClick={() => setShowGroupInfoModal(false)} style={{ width: 'auto' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
