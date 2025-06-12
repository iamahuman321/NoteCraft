// Family Chat App - Mobile-First Chat Interface
let currentPage = 'chatListPage';
let currentChatId = null;
let currentChatType = null; // 'individual' or 'group'
let familyMembers = [];
let mediaRecorder = null;
let recordedChunks = [];
let voiceRecording = null;
let recordingStartTime = 0;
let recordingTimer = null;

// DOM elements
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesList = document.getElementById('messagesList');
const backBtn = document.getElementById('backBtn');
const headerTitle = document.getElementById('headerTitle');
const chatStatus = document.getElementById('chatStatus');
const headerActionBtn = document.getElementById('headerActionBtn');
const chatList = document.getElementById('chatList');
const searchInput = document.getElementById('searchInput');

// Chat data structure
let chats = [];
let messages = {};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupAutoResize();
  loadSettings();
  initializeFamilyChats();
});

function setupEventListeners() {
  // Back navigation
  if (backBtn) backBtn.addEventListener('click', goBackToChatList);

  // Header action button (changes based on context)
  if (headerActionBtn) headerActionBtn.addEventListener('click', handleHeaderAction);

  // Message input and sending
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessageFromInput();
      }
    });
    
    messageInput.addEventListener('input', () => {
      updateSendButtonState();
    });
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessageFromInput);

  // File attachment
  const attachBtn = document.getElementById('attachBtn');
  const imageInput = document.getElementById('imageInput');
  
  if (attachBtn) attachBtn.addEventListener('click', () => {
    if (imageInput) imageInput.click();
  });

  if (imageInput) imageInput.addEventListener('change', handleImageUpload);

  // Voice recording
  const voiceBtn = document.getElementById('voiceBtn');
  if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);

  // Search
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }

  // Settings
  const themeSelect = document.getElementById('themeSelect');
  const notificationSound = document.getElementById('notificationSound');
  const signOutItem = document.getElementById('signOutItem');

  if (themeSelect) themeSelect.addEventListener('change', handleThemeChange);
  if (notificationSound) notificationSound.addEventListener('change', saveSettings);
  if (signOutItem) signOutItem.addEventListener('click', signOutUser);

  // Touch gestures for mobile
  setupTouchGestures();
}

function setupAutoResize() {
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });
  }
}

function setupTouchGestures() {
  let startY = 0;
  let currentY = 0;
  
  if (messagesList) {
    messagesList.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });
    
    messagesList.addEventListener('touchmove', (e) => {
      currentY = e.touches[0].clientY;
    }, { passive: true });
  }
}

// Chat initialization and management
function initializeFamilyChats() {
  // Initialize predefined family chats
  chats = [
    {
      id: 'family-group',
      name: 'Family Group',
      type: 'group',
      avatar: 'F',
      lastMessage: 'Welcome to family chat!',
      lastTime: Date.now(),
      unreadCount: 0,
      participants: []
    }
  ];
  
  // Load family members and create individual chats
  loadFamilyMembers();
  renderChatList();
}

function loadFamilyMembers() {
  // This will be populated from Firebase when users are online
  if (currentUser) {
    // Add current user to family if not already present
    const currentUserChat = {
      id: currentUser.uid,
      name: currentUser.displayName || 'You',
      type: 'individual',
      avatar: (currentUser.displayName || 'U').charAt(0).toUpperCase(),
      lastMessage: '',
      lastTime: 0,
      unreadCount: 0,
      online: true
    };
    
    // Don't add a chat with yourself
    // familyMembers.push(currentUserChat);
  }
}

function addFamilyMemberChat(userId, userData) {
  if (userId === currentUser?.uid) return; // Don't create chat with self
  
  const existingChat = chats.find(chat => chat.id === userId);
  if (existingChat) {
    existingChat.online = true;
    existingChat.name = userData.name;
    renderChatList();
    return;
  }
  
  const memberChat = {
    id: userId,
    name: userData.name,
    type: 'individual',
    avatar: userData.name.charAt(0).toUpperCase(),
    lastMessage: '',
    lastTime: 0,
    unreadCount: 0,
    online: true
  };
  
  chats.push(memberChat);
  renderChatList();
}

// Navigation functions
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active', 'slide-out-left', 'slide-in-right');
  });

  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active');
    currentPage = pageId;
  }
  
  updateHeader();
}

function goBackToChatList() {
  currentChatId = null;
  currentChatType = null;
  showPage('chatListPage');
}

function openChat(chatId, chatType) {
  currentChatId = chatId;
  currentChatType = chatType;
  
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
    chat.unreadCount = 0;
    renderChatList();
  }
  
  showPage('chatPage');
  loadChatMessages(chatId);
  setupChatListener(chatId, chatType);
}

function updateHeader() {
  if (!headerTitle || !chatStatus || !backBtn || !headerActionBtn) return;
  
  if (currentPage === 'chatListPage') {
    headerTitle.textContent = 'Family Chat';
    chatStatus.textContent = '';
    backBtn.classList.add('hidden');
    headerActionBtn.innerHTML = '<i class="fas fa-cog"></i>';
  } else if (currentPage === 'chatPage' && currentChatId) {
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      headerTitle.textContent = chat.name;
      chatStatus.textContent = chat.online ? 'Online' : 'Last seen recently';
      backBtn.classList.remove('hidden');
      headerActionBtn.innerHTML = chat.type === 'group' ? 
        '<i class="fas fa-users"></i>' : '<i class="fas fa-info-circle"></i>';
    }
  } else if (currentPage === 'settingsPage') {
    headerTitle.textContent = 'Settings';
    chatStatus.textContent = '';
    backBtn.classList.remove('hidden');
    headerActionBtn.innerHTML = '<i class="fas fa-check"></i>';
  }
}

function handleHeaderAction() {
  if (currentPage === 'chatListPage') {
    showPage('settingsPage');
  } else if (currentPage === 'chatPage') {
    // Show chat info or group members
    showChatInfo();
  }
}

// Chat list rendering
function renderChatList() {
  if (!chatList) return;
  
  chatList.innerHTML = '';
  
  // Sort chats by last message time
  const sortedChats = [...chats].sort((a, b) => b.lastTime - a.lastTime);
  
  sortedChats.forEach(chat => {
    const chatElement = createChatListItem(chat);
    chatList.appendChild(chatElement);
  });
}

function createChatListItem(chat) {
  const chatElement = document.createElement('div');
  chatElement.className = 'chat-item';
  chatElement.addEventListener('click', () => openChat(chat.id, chat.type));
  
  const avatarClass = chat.type === 'group' ? 'chat-avatar group' : 'chat-avatar';
  const onlineIndicator = chat.online && chat.type === 'individual' ? 
    '<div class="online-indicator"></div>' : '';
  
  const unreadBadge = chat.unreadCount > 0 ? 
    `<div class="unread-badge">${chat.unreadCount}</div>` : '';
  
  const lastTime = chat.lastTime > 0 ? formatTime(chat.lastTime) : '';
  
  chatElement.innerHTML = `
    <div class="${avatarClass}">
      ${chat.avatar}
      ${onlineIndicator}
    </div>
    <div class="chat-content">
      <div class="chat-header">
        <div class="chat-name">${escapeHtml(chat.name)}</div>
        <div class="chat-time">${lastTime}</div>
      </div>
      <div class="chat-preview">
        ${escapeHtml(chat.lastMessage || 'No messages yet')}
        ${unreadBadge}
      </div>
    </div>
  `;
  
  return chatElement;
}

// Message functions
function sendMessageFromInput() {
  if (!messageInput || !currentChatId) return;
  
  const text = messageInput.value.trim();
  if (!text) return;
  
  sendMessage(text, currentChatId, currentChatType);
  messageInput.value = '';
  messageInput.style.height = 'auto';
  updateSendButtonState();
}

function sendMessage(text, chatId, chatType, type = 'text', attachmentUrl = null) {
  if (!currentUser) {
    showToast('Please sign in to send messages');
    return;
  }
  
  const messageData = {
    id: generateId(),
    senderId: currentUser.uid,
    senderName: currentUser.displayName || currentUser.email.split('@')[0],
    text: text || '',
    type: type,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    attachmentUrl: attachmentUrl,
    chatId: chatId,
    chatType: chatType
  };
  
  // Send to appropriate Firebase path
  const messagePath = chatType === 'group' ? 
    `familyChat/groupMessages/${chatId}` : 
    `familyChat/individualMessages/${chatId}`;
  
  database.ref(messagePath).push(messageData)
    .then(() => {
      // Update chat last message
      updateChatLastMessage(chatId, text || 'Media', Date.now());
    })
    .catch(error => {
      console.error('Error sending message:', error);
      showToast('Failed to send message');
    });
}

function updateSendButtonState() {
  if (!sendBtn || !messageInput) return;
  
  const hasText = messageInput.value.trim().length > 0;
  sendBtn.style.opacity = hasText ? '1' : '0.5';
}

function loadChatMessages(chatId) {
  if (!messagesList) return;
  
  messagesList.innerHTML = '';
  
  const messagePath = currentChatType === 'group' ? 
    `familyChat/groupMessages/${chatId}` : 
    `familyChat/individualMessages/${chatId}`;
  
  database.ref(messagePath).limitToLast(50).on('child_added', (snapshot) => {
    const message = snapshot.val();
    if (message) {
      displayMessage(message);
    }
  });
}

function setupChatListener(chatId, chatType) {
  // Clean up previous listeners
  const messagePath = currentChatType === 'group' ? 
    `familyChat/groupMessages/${chatId}` : 
    `familyChat/individualMessages/${chatId}`;
  
  database.ref(messagePath).off();
  
  // Set up new listener
  database.ref(messagePath).limitToLast(50).on('child_added', (snapshot) => {
    const message = snapshot.val();
    if (message && message.senderId !== currentUser?.uid) {
      displayMessage(message);
      playNotificationSound();
    }
  });
}

function displayMessage(message) {
  if (!messagesList || !message) return;
  
  const messageElement = document.createElement('div');
  messageElement.className = `message ${message.senderId === currentUser?.uid ? 'own' : ''}`;
  
  const isOwn = message.senderId === currentUser?.uid;
  const avatarInitial = message.senderName ? message.senderName.charAt(0).toUpperCase() : 'U';
  const messageTime = formatTime(message.timestamp);
  
  let messageContent = '';
  
  if (message.type === 'image') {
    messageContent = `
      <div class="message-content">
        <div class="message-bubble">
          ${message.text ? `<div>${escapeHtml(message.text)}</div>` : ''}
          <img src="${message.attachmentUrl}" alt="Shared image" class="message-image" onclick="openImageViewer('${message.attachmentUrl}')" />
        </div>
        <div class="message-time">${messageTime}</div>
      </div>
    `;
  } else if (message.type === 'voice') {
    messageContent = `
      <div class="message-content">
        <div class="message-bubble">
          <div class="message-voice">
            <button class="voice-play-btn" onclick="playVoiceMessage('${message.attachmentUrl}')">
              <i class="fas fa-play"></i>
            </button>
            <span>Voice message</span>
          </div>
        </div>
        <div class="message-time">${messageTime}</div>
      </div>
    `;
  } else {
    messageContent = `
      <div class="message-content">
        <div class="message-bubble">
          ${escapeHtml(message.text)}
        </div>
        <div class="message-time">${messageTime}</div>
      </div>
    `;
  }
  
  messageElement.innerHTML = `
    ${!isOwn ? `<div class="message-avatar">${avatarInitial}</div>` : ''}
    ${messageContent}
  `;
  
  messagesList.appendChild(messageElement);
  scrollToBottom();
}

function updateChatLastMessage(chatId, text, timestamp) {
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
    chat.lastMessage = text;
    chat.lastTime = timestamp;
    renderChatList();
  }
}

function scrollToBottom() {
  if (messagesList) {
    messagesList.scrollTop = messagesList.scrollHeight;
  }
}

// Media functions
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image size must be less than 5MB');
    return;
  }
  
  uploadAndSendImage(file);
  event.target.value = '';
}

async function uploadAndSendImage(file) {
  try {
    showToast('Processing image...');
    const imageBase64 = await convertImageToBase64(file);
    if (imageBase64) {
      sendMessage('', currentChatId, currentChatType, 'image', imageBase64);
      showToast('Image sent successfully');
    }
  } catch (error) {
    console.error('Error processing image:', error);
    showToast('Failed to send image');
  }
}

// Voice recording
let isRecording = false;

function toggleVoiceRecording() {
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    
    isRecording = true;
    updateVoiceButton();
    
    recordingStartTime = Date.now();
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      voiceRecording = blob;
      
      try {
        showToast('Processing voice message...');
        const voiceBase64 = await convertVoiceToBase64(blob);
        if (voiceBase64) {
          sendMessage('', currentChatId, currentChatType, 'voice', voiceBase64);
          showToast('Voice message sent');
        }
      } catch (error) {
        console.error('Error sending voice message:', error);
        showToast('Failed to send voice message');
      }
      
      isRecording = false;
      updateVoiceButton();
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
  } catch (error) {
    console.error('Error starting voice recording:', error);
    showToast('Microphone access denied');
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function updateVoiceButton() {
  const voiceBtn = document.getElementById('voiceBtn');
  if (!voiceBtn) return;
  
  if (isRecording) {
    voiceBtn.style.background = 'var(--accent-color)';
    voiceBtn.style.color = 'white';
    voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
  } else {
    voiceBtn.style.background = 'var(--secondary-background)';
    voiceBtn.style.color = 'var(--text-secondary)';
    voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  }
}

function playVoiceMessage(audioUrl) {
  const audio = new Audio(audioUrl);
  audio.play();
}

// Search functionality
function handleSearch() {
  if (!searchInput) return;
  
  const query = searchInput.value.toLowerCase().trim();
  const chatItems = document.querySelectorAll('.chat-item');
  
  chatItems.forEach(item => {
    const chatName = item.querySelector('.chat-name').textContent.toLowerCase();
    const chatPreview = item.querySelector('.chat-preview').textContent.toLowerCase();
    
    if (chatName.includes(query) || chatPreview.includes(query)) {
      item.style.display = 'flex';
    } else {
      item.style.display = query ? 'none' : 'flex';
    }
  });
}

// Settings functions
function loadSettings() {
  const savedTheme = localStorage.getItem('chatTheme') || 'dark';
  const savedNotifications = localStorage.getItem('chatNotifications') !== 'false';
  
  const themeSelect = document.getElementById('themeSelect');
  const notificationSound = document.getElementById('notificationSound');
  
  if (themeSelect) themeSelect.value = savedTheme;
  if (notificationSound) notificationSound.checked = savedNotifications;
  
  applyTheme(savedTheme);
}

function saveSettings() {
  const themeSelect = document.getElementById('themeSelect');
  const notificationSound = document.getElementById('notificationSound');
  
  if (themeSelect) localStorage.setItem('chatTheme', themeSelect.value);
  if (notificationSound) localStorage.setItem('chatNotifications', notificationSound.checked);
}

function handleThemeChange(event) {
  const theme = event.target.value;
  applyTheme(theme);
  saveSettings();
}

function applyTheme(theme) {
  document.body.className = theme === 'light' ? 'light-theme' : '';
}

function showChatInfo() {
  // Placeholder for chat info modal
  showToast('Chat info coming soon');
}

// Utility functions
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return 'now';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m`;
  } else if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diff < 86400000 * 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  toast.className = `toast open ${type}`;
  
  setTimeout(() => {
    toast.classList.remove('open');
  }, 3000);
}

function playNotificationSound() {
  const notificationSound = document.getElementById('notificationSound');
  if (notificationSound && notificationSound.checked) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Audio context not available');
    }
  }
}

function openImageViewer(imageSrc) {
  const viewer = document.createElement('div');
  viewer.className = 'image-viewer';
  viewer.innerHTML = `
    <div class="image-viewer-overlay" onclick="closeImageViewer()">
      <div class="image-viewer-content">
        <img src="${imageSrc}" alt="Full size image" />
        <button class="image-viewer-close" onclick="closeImageViewer()">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(viewer);
  
  if (!document.getElementById('image-viewer-styles')) {
    const styles = document.createElement('style');
    styles.id = 'image-viewer-styles';
    styles.textContent = `
      .image-viewer {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .image-viewer-content {
        position: relative;
        max-width: 90%;
        max-height: 90%;
      }
      
      .image-viewer img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
      }
      
      .image-viewer-close {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.7);
        border: none;
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(styles);
  }
}

function closeImageViewer() {
  const viewer = document.querySelector('.image-viewer');
  if (viewer) {
    viewer.remove();
  }
}

// Firebase integration - update online users
function updateOnlineUsersDisplay(onlineUsers) {
  Object.entries(onlineUsers).forEach(([userId, userData]) => {
    addFamilyMemberChat(userId, userData);
  });
}

console.log('Family Chat App initialized successfully');