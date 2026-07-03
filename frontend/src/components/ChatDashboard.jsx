import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, LogOut, Users, MessageCircle, ArrowLeft } from 'lucide-react';
import io from 'socket.io-client';

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
  const token = localStorage.getItem('token');

  // Fetch conversations (recent chats)
  const fetchConversations = async (silent = false) => {
    try {
      const res = await fetch('http://localhost:4500/api/messages/conversations', {
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
      const res = await fetch('http://localhost:4500/api/users', {
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
      const res = await fetch(`http://localhost:4500/api/messages/${activeChat._id}`, {
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
    fetchUsers();

    const socket = io('http://localhost:4500', {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('conversation_update', () => {
      fetchConversations(true);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch direct messages on chat selection and listen for new ones in real-time
  useEffect(() => {
    fetchMessages();
    setIsRecipientTyping(false); // Reset typing status when chat contact switches

    if (!socketRef.current) return;

    const handleReceiveMessage = (message) => {
      // Append message if it belongs to the active conversation
      if (activeChat && (message.sender === activeChat._id || message.recipient === activeChat._id)) {
        setMessages((prev) => {
          // Avoid duplicating local-echoed messages
          if (prev.some(m => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
    };

    const handleTyping = (data) => {
      if (activeChat && data.senderId === activeChat._id) {
        setIsRecipientTyping(true);
      }
    };

    const handleStopTyping = (data) => {
      if (activeChat && data.senderId === activeChat._id) {
        setIsRecipientTyping(false);
      }
    };

    socketRef.current.on('receive_message', handleReceiveMessage);
    socketRef.current.on('typing', handleTyping);
    socketRef.current.on('stop_typing', handleStopTyping);

    return () => {
      socketRef.current.off('receive_message', handleReceiveMessage);
      socketRef.current.off('typing', handleTyping);
      socketRef.current.off('stop_typing', handleStopTyping);
    };
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
    if (socketRef.current) {
      socketRef.current.emit('stop_typing', { recipientId: activeChat._id });
    }

    try {
      const res = await fetch(`http://localhost:4500/api/messages/${activeChat._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: messageText })
      });

      if (res.ok) {
        const data = await res.json();
        // Append sent message locally so UI is instantaneous
        setMessages((prev) => [...prev, data]);
        // Refresh conversations to update sidebar order and preview text
        fetchConversations(true);
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);

    if (!socketRef.current || !activeChat) return;

    if (val.trim().length > 0) {
      socketRef.current.emit('typing', {
        senderName: user.name,
        recipientId: activeChat._id
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit('stop_typing', {
          recipientId: activeChat._id
        });
      }, 2000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socketRef.current.emit('stop_typing', {
        recipientId: activeChat._id
      });
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
              fetchConversations();
            }}
          >
            Chats
          </button>
          <button
            className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('people');
              fetchUsers();
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
