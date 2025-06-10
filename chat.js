// Translation function
function t(key) {
  const translations = {
    en: {
      'family_chat': 'Family Chat',
      'sign_in_to_chat': 'Sign in to chat with your family members',
      'someone_typing': 'Someone is typing...',
      'type_message': 'Type your message...',
      'loading_chat': 'Loading chat...',
      'message_sent': 'Message sent',
      'message_failed': 'Failed to send message',
      'today': 'Today',
      'yesterday': 'Yesterday',
      'you': 'You',
      'online': 'Online',
      'offline': 'Offline'
    }
  };
  
  const lang = localStorage.getItem('language') || 'en';
  return translations[lang]?.[key] || key;
}

// Global variables
let currentUser = null;
let messagesRef = null;
let typingRef = null;
let presenceRef = null;
let messageListener = null;
let typingListener = null;
let typingTimeout = null;

// Initialize the chat page
function initializePage() {
  console.log("Initializing chat page");
  
  function waitForFirebase() {
    return new Promise((resolve) => {
      function checkFirebase() {
        if (window.authFunctions && window.auth) {
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      }
      checkFirebase();
    });
  }

  waitForFirebase().then(() => {
    console.log("Firebase ready for chat page");
    
    // Always setup event listeners first
    setupEventListeners();
    
    currentUser = window.authFunctions.getCurrentUser();
    const isGuest = window.authFunctions.isUserGuest();
    
    if (isGuest || !currentUser) {
      showSignInRequired();
      return;
    }

    initializeChat();
    
    // Listen for auth state changes
    if (window.auth) {
      window.auth.onAuthStateChanged((user) => {
        if (user && !window.authFunctions.isUserGuest()) {
          currentUser = user;
          initializeChat();
        } else {
          currentUser = null;
          showSignInRequired();
          cleanupListeners();
        }
      });
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  // Hamburger menu
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', toggleSidebar);
  }
  
  if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
  }
  
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  // Message input
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');

  if (messageInput) {
    messageInput.addEventListener('input', handleMessageInput);
    messageInput.addEventListener('keypress', handleKeyPress);
    messageInput.addEventListener('focus', handleInputFocus);
    messageInput.addEventListener('blur', handleInputBlur);
  }

  if (sendButton) {
    sendButton.addEventListener('click', sendMessage);
  }
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  if (sidebar && hamburgerBtn) {
    sidebar.classList.toggle("open");
    hamburgerBtn.classList.toggle("active");
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  if (sidebar && hamburgerBtn) {
    sidebar.classList.remove("open");
    hamburgerBtn.classList.remove("active");
  }
}

// Show sign in required
function showSignInRequired() {
  const signInRequired = document.getElementById('signInRequired');
  const chatContent = document.getElementById('chatContent');
  const loading = document.getElementById('loading');
  
  if (signInRequired) signInRequired.style.display = 'block';
  if (chatContent) chatContent.style.display = 'none';
  if (loading) loading.style.display = 'none';
}

// Initialize chat functionality
function initializeChat() {
  if (!currentUser) return;

  const signInRequired = document.getElementById('signInRequired');
  const chatContent = document.getElementById('chatContent');
  const loading = document.getElementById('loading');
  
  if (signInRequired) signInRequired.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (chatContent) chatContent.style.display = 'block';

  // Initialize Firebase references
  const database = firebase.database();
  messagesRef = database.ref('familyChat/messages');
  typingRef = database.ref('familyChat/typing');
  presenceRef = database.ref('familyChat/presence');

  // Setup presence
  setupPresence();
  
  // Load messages
  loadMessages();
  
  // Setup typing indicator
  setupTypingIndicator();
}

// Setup user presence
function setupPresence() {
  if (!currentUser || !presenceRef) return;

  const userPresenceRef = presenceRef.child(currentUser.uid);
  const connectedRef = firebase.database().ref('.info/connected');

  connectedRef.on('value', (snapshot) => {
    if (snapshot.val() === true) {
      // User is online
      userPresenceRef.set({
        uid: currentUser.uid,
        name: currentUser.displayName || 'Anonymous',
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        online: true
      });

      // When user disconnects, update their status
      userPresenceRef.onDisconnect().update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }
  });
}

// Load and display messages
function loadMessages() {
  if (!messagesRef) return;

  // Clean up existing listener
  if (messageListener) {
    messagesRef.off('child_added', messageListener);
  }

  messageListener = messagesRef.limitToLast(50).on('child_added', (snapshot) => {
    const message = snapshot.val();
    if (message) {
      displayMessage(message);
    }
  });
}

// Display a message in the chat
function displayMessage(message) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;

  const messageElement = document.createElement('div');
  messageElement.className = `message ${message.uid === currentUser?.uid ? 'own' : 'other'}`;

  const timestamp = new Date(message.timestamp);
  const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageElement.innerHTML = `
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">${message.uid === currentUser?.uid ? t('you') : message.authorName}</span>
        <span class="message-time">${timeString}</span>
      </div>
      <div class="message-text">${escapeHtml(message.text)}</div>
    </div>
  `;

  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

// Handle message input
function handleMessageInput(event) {
  const sendButton = document.getElementById('sendButton');
  const value = event.target.value.trim();
  
  if (sendButton) {
    sendButton.disabled = !value;
  }

  // Show typing indicator
  if (value && typingRef && currentUser) {
    updateTypingStatus(true);
    
    // Clear previous timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeout = setTimeout(() => {
      updateTypingStatus(false);
    }, 2000);
  }
}

// Handle key press
function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Handle input focus/blur
function handleInputFocus() {
  // Scroll to bottom when input is focused (for mobile)
  setTimeout(scrollToBottom, 300);
}

function handleInputBlur() {
  updateTypingStatus(false);
}

// Update typing status
function updateTypingStatus(isTyping) {
  if (!typingRef || !currentUser) return;

  const userTypingRef = typingRef.child(currentUser.uid);
  
  if (isTyping) {
    userTypingRef.set({
      name: currentUser.displayName || 'Anonymous',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  } else {
    userTypingRef.remove();
  }
}

// Setup typing indicator
function setupTypingIndicator() {
  if (!typingRef || !currentUser) return;

  typingRef.on('value', (snapshot) => {
    const typingUsers = snapshot.val() || {};
    const otherUsersTyping = Object.keys(typingUsers).filter(uid => uid !== currentUser.uid);
    
    const typingIndicator = document.getElementById('typingIndicator');
    if (!typingIndicator) return;

    if (otherUsersTyping.length > 0) {
      const names = otherUsersTyping.map(uid => typingUsers[uid].name).join(', ');
      const typingText = document.querySelector('.typing-text');
      if (typingText) {
        typingText.textContent = `${names} ${otherUsersTyping.length === 1 ? 'is' : 'are'} typing...`;
      }
      typingIndicator.style.display = 'flex';
      scrollToBottom();
    } else {
      typingIndicator.style.display = 'none';
    }
  });
}

// Send message
function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  
  if (!messageInput || !messagesRef || !currentUser) return;

  const text = messageInput.value.trim();
  if (!text) return;

  // Disable input while sending
  messageInput.disabled = true;
  if (sendButton) sendButton.disabled = true;

  const message = {
    uid: currentUser.uid,
    authorName: currentUser.displayName || 'Anonymous',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  messagesRef.push(message)
    .then(() => {
      messageInput.value = '';
      messageInput.disabled = false;
      if (sendButton) sendButton.disabled = true;
      updateTypingStatus(false);
      messageInput.focus();
    })
    .catch((error) => {
      console.error('Error sending message:', error);
      messageInput.disabled = false;
      if (sendButton) sendButton.disabled = false;
      showToast(t('message_failed'), 'error');
    });
}

// Scroll to bottom of messages
function scrollToBottom() {
  const messagesContainer = document.getElementById('chatMessages');
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// Cleanup listeners
function cleanupListeners() {
  if (messageListener && messagesRef) {
    messagesRef.off('child_added', messageListener);
  }
  
  if (typingRef) {
    typingRef.off();
  }
  
  if (presenceRef && currentUser) {
    const userPresenceRef = presenceRef.child(currentUser.uid);
    userPresenceRef.update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}

// Cleanup when page unloads
window.addEventListener('beforeunload', cleanupListeners);