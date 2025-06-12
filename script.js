// Family Chat App - Main JavaScript
let currentPage = 'chatPage';
let mediaRecorder = null;
let recordedChunks = [];
let voiceRecording = null;
let recordingStartTime = 0;
let recordingTimer = null;

// DOM elements
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesList = document.getElementById('messagesList');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarClose = document.getElementById('sidebarClose');

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupAutoResize();
  loadSettings();
});

function setupEventListeners() {
  // Navigation
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
  if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  // Navigation items
  const navChat = document.getElementById('navChat');
  const navSettings = document.getElementById('navSettings');
  const navSignIn = document.getElementById('navSignIn');
  const navSignOut = document.getElementById('navSignOut');

  if (navChat) navChat.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('chatPage');
    closeSidebar();
  });

  if (navSettings) navSettings.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('settingsPage');
    closeSidebar();
  });

  if (navSignIn) navSignIn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'login.html';
  });

  if (navSignOut) navSignOut.addEventListener('click', (e) => {
    e.preventDefault();
    signOutUser();
  });

  // Message input and sending
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessageFromInput();
      }
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
  if (voiceBtn) voiceBtn.addEventListener('click', showVoiceModal);

  // Settings
  const themeSelect = document.getElementById('themeSelect');
  const notificationSound = document.getElementById('notificationSound');
  const editNameBtn = document.getElementById('editNameBtn');
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  if (themeSelect) themeSelect.addEventListener('change', handleThemeChange);
  if (notificationSound) notificationSound.addEventListener('change', saveSettings);
  if (editNameBtn) editNameBtn.addEventListener('click', showNameModal);
  if (signInBtn) signInBtn.addEventListener('click', () => window.location.href = 'login.html');
  if (signOutBtn) signOutBtn.addEventListener('click', signOutUser);

  // Online users button
  const onlineUsersBtn = document.getElementById('onlineUsersBtn');
  if (onlineUsersBtn) onlineUsersBtn.addEventListener('click', showOnlineUsersModal);
}

function setupAutoResize() {
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });
  }
}

// Navigation functions
function toggleSidebar() {
  if (sidebar) sidebar.classList.toggle('open');
  if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  // Show selected page
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active');
    currentPage = pageId;
  }

  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  const activeNavId = pageId === 'chatPage' ? 'navChat' : 'navSettings';
  const activeNav = document.getElementById(activeNavId);
  if (activeNav) activeNav.classList.add('active');
}

// Message functions
function sendMessageFromInput() {
  if (!messageInput) return;
  
  const text = messageInput.value.trim();
  if (!text) return;
  
  sendMessage(text);
  messageInput.value = '';
  messageInput.style.height = 'auto';
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
        <div class="message-header">
          <span class="message-sender">${escapeHtml(message.senderName)}</span>
          <span class="message-time">${messageTime}</span>
        </div>
        <div class="message-bubble">
          ${message.text ? `<div>${escapeHtml(message.text)}</div>` : ''}
          <img src="${message.attachmentUrl}" alt="Shared image" class="message-image" onclick="openImageViewer('${message.attachmentUrl}')" />
        </div>
      </div>
    `;
  } else if (message.type === 'voice') {
    messageContent = `
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender">${escapeHtml(message.senderName)}</span>
          <span class="message-time">${messageTime}</span>
        </div>
        <div class="message-bubble">
          <div class="message-voice">
            <button class="voice-play-btn" onclick="playVoiceMessage('${message.attachmentUrl}')">
              <i class="fas fa-play"></i>
            </button>
            <span class="voice-duration">Voice message</span>
          </div>
        </div>
      </div>
    `;
  } else {
    messageContent = `
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender">${escapeHtml(message.senderName)}</span>
          <span class="message-time">${messageTime}</span>
        </div>
        <div class="message-bubble">
          ${escapeHtml(message.text)}
        </div>
      </div>
    `;
  }
  
  messageElement.innerHTML = `
    <div class="message-avatar">${avatarInitial}</div>
    ${messageContent}
  `;
  
  messagesList.appendChild(messageElement);
  scrollToBottom();
}

function scrollToBottom() {
  if (messagesList) {
    messagesList.scrollTop = messagesList.scrollHeight;
  }
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    showToast('Image size must be less than 5MB', 'error');
    return;
  }
  
  uploadAndSendImage(file);
  event.target.value = ''; // Clear input
}

async function uploadAndSendImage(file) {
  try {
    showToast('Processing image...', 'default');
    const imageBase64 = await convertImageToBase64(file);
    if (imageBase64) {
      await sendMessage('', 'image', imageBase64);
      showToast('Image sent successfully', 'success');
    }
  } catch (error) {
    console.error('Error processing image:', error);
    showToast('Failed to send image', 'error');
  }
}

// Voice recording functions
function showVoiceModal() {
  const modal = document.getElementById('voiceRecordingModal');
  if (modal) {
    modal.classList.add('open');
    resetVoiceRecording();
  }
}

function hideVoiceModal() {
  const modal = document.getElementById('voiceRecordingModal');
  if (modal) {
    modal.classList.remove('open');
    stopVoiceRecording();
    resetVoiceRecording();
  }
}

function resetVoiceRecording() {
  const statusEl = document.getElementById('voiceStatus');
  const durationEl = document.getElementById('voiceDuration');
  const circleEl = document.querySelector('.voice-circle');
  const recordBtn = document.getElementById('voiceRecordBtn');
  const stopBtn = document.getElementById('voiceStopBtn');
  const playBtn = document.getElementById('voicePlayBtn');
  const sendBtn = document.getElementById('voiceSendBtn');
  
  if (statusEl) statusEl.textContent = 'Ready to record';
  if (durationEl) durationEl.textContent = '00:00';
  if (circleEl) circleEl.classList.remove('recording');
  if (recordBtn) recordBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
  if (playBtn) playBtn.classList.add('hidden');
  if (sendBtn) sendBtn.classList.add('hidden');
  
  recordedChunks = [];
  voiceRecording = null;
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    
    const statusEl = document.getElementById('voiceStatus');
    const circleEl = document.querySelector('.voice-circle');
    const recordBtn = document.getElementById('voiceRecordBtn');
    const stopBtn = document.getElementById('voiceStopBtn');
    
    if (statusEl) statusEl.textContent = 'Recording...';
    if (circleEl) circleEl.classList.add('recording');
    if (recordBtn) recordBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');
    
    recordingStartTime = Date.now();
    recordingTimer = setInterval(updateRecordingDuration, 100);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      voiceRecording = blob;
      
      const statusEl = document.getElementById('voiceStatus');
      const circleEl = document.querySelector('.voice-circle');
      const stopBtn = document.getElementById('voiceStopBtn');
      const playBtn = document.getElementById('voicePlayBtn');
      const sendBtn = document.getElementById('voiceSendBtn');
      
      if (statusEl) statusEl.textContent = 'Recording complete';
      if (circleEl) circleEl.classList.remove('recording');
      if (stopBtn) stopBtn.classList.add('hidden');
      if (playBtn) playBtn.classList.remove('hidden');
      if (sendBtn) sendBtn.classList.remove('hidden');
      
      if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
  } catch (error) {
    console.error('Error starting voice recording:', error);
    showToast('Failed to start recording. Please check microphone permissions.', 'error');
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function updateRecordingDuration() {
  if (recordingStartTime) {
    const duration = Date.now() - recordingStartTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    const durationEl = document.getElementById('voiceDuration');
    if (durationEl) {
      durationEl.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }
}

function playVoiceRecording() {
  if (voiceRecording) {
    const audio = new Audio(URL.createObjectURL(voiceRecording));
    audio.play();
  }
}

async function sendVoiceMessage() {
  if (!voiceRecording) return;
  
  try {
    showToast('Processing voice message...', 'default');
    const voiceBase64 = await convertVoiceToBase64(voiceRecording);
    if (voiceBase64) {
      await sendMessage('', 'voice', voiceBase64);
      showToast('Voice message sent successfully', 'success');
      hideVoiceModal();
    }
  } catch (error) {
    console.error('Error sending voice message:', error);
    showToast('Failed to send voice message', 'error');
  }
}

function playVoiceMessage(audioUrl) {
  const audio = new Audio(audioUrl);
  audio.play();
}

// Online users functions
function showOnlineUsersModal() {
  const modal = document.getElementById('onlineUsersModal');
  if (modal) {
    modal.classList.add('open');
  }
}

function hideOnlineUsersModal() {
  const modal = document.getElementById('onlineUsersModal');
  if (modal) {
    modal.classList.remove('open');
  }
}

function updateOnlineUsersDisplay(onlineUsers) {
  const onlineCount = document.getElementById('onlineCount');
  const onlineUsersList = document.getElementById('onlineUsersList');
  
  const userCount = Object.keys(onlineUsers).length;
  if (onlineCount) onlineCount.textContent = userCount;
  
  if (onlineUsersList) {
    onlineUsersList.innerHTML = '';
    
    Object.entries(onlineUsers).forEach(([userId, userData]) => {
      const userElement = document.createElement('div');
      userElement.className = 'online-user';
      
      const avatarInitial = userData.name ? userData.name.charAt(0).toUpperCase() : 'U';
      
      userElement.innerHTML = `
        <div class="online-user-avatar">${avatarInitial}</div>
        <div class="online-user-info">
          <div class="online-user-name">${escapeHtml(userData.name)}</div>
          <div class="online-user-status">Online</div>
        </div>
      `;
      
      onlineUsersList.appendChild(userElement);
    });
  }
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

// Name modal functions
function showNameModal() {
  const modal = document.getElementById('nameModal');
  const nameInput = document.getElementById('nameInput');
  
  if (modal) modal.classList.add('open');
  if (nameInput && currentUser) {
    nameInput.value = currentUser.displayName || '';
    nameInput.focus();
  }
}

function hideNameModal() {
  const modal = document.getElementById('nameModal');
  if (modal) modal.classList.remove('open');
}

function saveName() {
  const nameInput = document.getElementById('nameInput');
  if (!nameInput) return;
  
  const newName = nameInput.value.trim();
  if (!newName) {
    showToast('Please enter a name', 'error');
    return;
  }
  
  updateUserName(newName);
  hideNameModal();
}

// Image viewer function
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
  
  // Add styles if not already present
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

// Utility functions
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) { // Less than 1 minute
    return 'now';
  } else if (diff < 3600000) { // Less than 1 hour
    return `${Math.floor(diff / 60000)}m ago`;
  } else if (date.toDateString() === now.toDateString()) { // Same day
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

// Close modals when clicking outside
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('open');
  }
});

console.log('Family Chat App initialized successfully');