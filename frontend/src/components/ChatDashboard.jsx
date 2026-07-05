import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, LogOut, Users, MessageCircle, ArrowLeft } from 'lucide-react';
import io from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4500';

export default function ChatDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'people'
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null); // Selected recipient user
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const activeChatRef = useRef(activeChat);
  const token = localStorage.getItem('token');

  // Sync activeChatRef with activeChat state
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Fetch conversations (recent chats)
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

  // Fetch messages with the selected active user
  const fetchMessages = async (silent = false) => {
    if (!activeChat) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetch(`${apiUrl}/api/messages/${activeChat._id}`, {
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

  // Load initial data and establish WebSocket connection
  useEffect(() => {
    fetchConversations();

    const socket = io(apiUrl, {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('conversation_update', (data) => {
      // If we initiated this update, we already updated our UI locally
      if (data && data.senderId === user.id) {
        return;
      }
      fetchConversations(true);
    });

    const handleReceiveMessage = (message) => {
      const currentActiveChat = activeChatRef.current;
      // Append message if it belongs to the active conversation
      if (currentActiveChat && (message.sender === currentActiveChat._id || message.recipient === currentActiveChat._id)) {
        setMessages((prev) => {
          // Avoid duplicating local-echoed messages
          if (prev.some(m => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }

      // Proactively update the conversations list locally
      setConversations((prevConversations) => {
        const otherUserId = message.sender === user.id ? message.recipient : message.sender;
        const exists = prevConversations.find(c => c.user._id === otherUserId);
        if (exists) {
          const updated = {
            ...exists,
            lastMessage: {
              content: message.content,
              sender: message.sender,
              createdAt: message.createdAt
            }
          };
          return [updated, ...prevConversations.filter(c => c.user._id !== otherUserId)];
        } else {
          // New conversation: fetch to pull full user details (name, email)
          fetchConversations(true);
          return prevConversations;
        }
      });
    };

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

    socket.on('receive_message', handleReceiveMessage);
    socket.on('typing', handleTyping);
    socket.on('stop_typing', handleStopTyping);

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch direct messages on chat selection
  useEffect(() => {
    fetchMessages();
    setIsRecipientTyping(false); // Reset typing status when chat contact switches
    isTypingRef.current = false;
  }, [activeChat]);

  // Scroll to bottom when message log updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingMessages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const messageText = newMessage.trim();
    setNewMessage(''); // Clear input immediately for responsive UI

    // Clear typing timeout and emit stop_typing immediately
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    if (socketRef.current) {
      socketRef.current.emit('stop_typing', { recipientId: activeChat._id });
    }

    // Optimistically update conversations list in sidebar to make UI instantaneous
    const tempMessageId = `temp-${Date.now()}`;
    const optimisticMessage = {
      _id: tempMessageId,
      sender: user.id,
      recipient: activeChat._id,
      content: messageText,
      createdAt: new Date().toISOString()
    };

    // Show message in stream immediately
    setMessages((prev) => [...prev, optimisticMessage]);

    // Update conversation order and last message in sidebar immediately
    setConversations((prevConversations) => {
      const exists = prevConversations.find(c => c.user._id === activeChat._id);
      if (exists) {
        const updated = {
          ...exists,
          lastMessage: {
            content: messageText,
            sender: user.id,
            createdAt: optimisticMessage.createdAt
          }
        };
        return [updated, ...prevConversations.filter(c => c.user._id !== activeChat._id)];
      } else {
        const newConv = {
          user: activeChat,
          lastMessage: {
            content: messageText,
            sender: user.id,
            createdAt: optimisticMessage.createdAt
          }
        };
        return [newConv, ...prevConversations];
      }
    });

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
        // Replace optimistic message with the actual message from database
        setMessages((prev) => prev.map(m => m._id === tempMessageId ? data : m));
      } else {
        // Remove optimistic message on error
        setMessages((prev) => prev.filter(m => m._id !== tempMessageId));
        // Force refresh conversation list on error
        fetchConversations(true);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter(m => m._id !== tempMessageId));
      fetchConversations(true);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);

    if (!socketRef.current || !activeChat) return;

    if (val.trim().length > 0) {
      // Throttle typing emissions: only emit 'typing' if we aren't already typing
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socketRef.current.emit('typing', {
          senderName: user.name,
          recipientId: activeChat._id
        });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit('stop_typing', {
          recipientId: activeChat._id
        });
        isTypingRef.current = false;
      }, 2000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socketRef.current.emit('stop_typing', {
        recipientId: activeChat._id
      });
      isTypingRef.current = false;
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

  return (
    <div className={`dashboard-layout ${activeChat ? 'active-chat-selected' : ''}`}>
      {/* Sidebar Panel */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">SecureChat</div>
          <button className="logout-icon-btn" onClick={onLogout} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="sidebar-tabs">
          <button
            className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('chats');
            }}
          >
            Chats
          </button>
          <button
            className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('people');
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
                    setMessages([]);
                  }}
                >
                  <div className={`avatar-badge ${activeChat?._id === conv.user._id ? 'active-chat' : ''}`}>
                    {getInitials(conv.user.name)}
                  </div>
                  <div className="card-info">
                    <div className="card-name-row">
                      <div className="card-name">{conv.user.name}</div>
                      <div className="card-time">{formatTime(conv.lastMessage.createdAt)}</div>
                    </div>
                    <div className="card-message-row">
                      <div className="card-message">
                        {conv.lastMessage.sender === user.id ? 'You: ' : ''}
                        {conv.lastMessage.content}
                      </div>
                      <div className="see-messages-btn">See messages</div>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            users.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlignment: 'center', color: 'var(--text-secondary)' }}>
                No other users found in the application.
              </div>
            ) : (
              users.map((item) => (
                <div
                  key={item._id}
                  className={`card-item ${activeChat?._id === item._id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChat(item);
                    setMessages([]);
                  }}
                >
                  <div className={`avatar-badge ${activeChat?._id === item._id ? 'active-chat' : ''}`}>
                    {getInitials(item.name)}
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
            )
          )}
        </div>
      </div>

      {/* Main Messaging Panel */}
      <div className="chat-area">
        {activeChat ? (
          <>
            {/* Contact Info Header */}
            <div className="chat-header">
              <button className="back-btn" onClick={() => setActiveChat(null)} title="Back to conversations">
                <ArrowLeft size={20} />
              </button>
              <div className="avatar-badge active-chat">{getInitials(activeChat.name)}</div>
              <div>
                <div className="chat-header-name">{activeChat.name}</div>
                <div className="chat-header-email">{activeChat.email}</div>
              </div>
            </div>

            {/* Messages Stream */}
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
                    className={`message-row ${msg.sender === user.id ? 'sent' : 'received'}`}
                  >
                    <div className="message-bubble">
                      <div>{msg.content}</div>
                      <span className="message-time-stamp">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
              {isRecipientTyping && (
                <div className="typing-indicator">
                  <span>{activeChat.name} is typing</span>
                  <div className="typing-dots">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

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
        ) : (
          <div className="empty-chat">
            <MessageSquare size={48} style={{ color: 'var(--accent-primary)', marginBottom: '15px' }} />
            <div className="empty-chat-title">Select a Conversation</div>
            <p>Choose an active chat from the sidebar or find users in "People" to start messaging.</p>
          </div>
        )}
      </div>
    </div>
  );
}
