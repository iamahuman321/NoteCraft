// Firebase Configuration - Family Chat App
// Note: Using same Firebase project as notes app for family integration

const firebaseConfig = {
  apiKey: "AIzaSyALzgRMGUZFSbiCIf_Bo--iYFuzF7q6WNM",
  authDomain: "note-11065.firebaseapp.com",
  databaseURL: "https://note-11065-default-rtdb.firebaseio.com",
  projectId: "note-11065",
  storageBucket: "note-11065.appspot.com",
  messagingSenderId: "994636147128",
  appId: "1:994636147128:web:af99bbf22fe78b7e123456"
};

console.log('Firebase Chat - Initializing...');

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const database = firebase.database();

// Global variables
let currentUser = null;
let chatRef = null;
let onlineUsersRef = null;
let messagesListener = null;
let onlineUsersListener = null;

// Authentication state management
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    console.log('User signed in:', user.email);
    initializeChat();
    updateUIForUser(user);
    setUserOnline();
    
    // Update the mobile chat interface
    if (typeof initializeFamilyChats === 'function') {
      initializeFamilyChats();
    }
  } else {
    currentUser = null;
    console.log('User signed out');
    updateUIForSignedOut();
    cleanupListeners();
  }
});

function initializeChat() {
  if (!currentUser) return;
  
  // Initialize chat reference
  chatRef = database.ref('familyChat/messages');
  onlineUsersRef = database.ref('familyChat/onlineUsers');
  
  // Listen for new messages
  setupMessagesListener();
  setupOnlineUsersListener();
}

function setupMessagesListener() {
  if (messagesListener) {
    chatRef.off('child_added', messagesListener);
  }
  
  messagesListener = chatRef.limitToLast(50).on('child_added', (snapshot) => {
    const message = snapshot.val();
    if (message) {
      displayMessage(message);
      playNotificationSound();
    }
  });
}

function setupOnlineUsersListener() {
  if (onlineUsersListener) {
    onlineUsersRef.off('value', onlineUsersListener);
  }
  
  onlineUsersListener = onlineUsersRef.on('value', (snapshot) => {
    const onlineUsers = snapshot.val() || {};
    
    // Update the chat interface if function exists
    if (typeof updateOnlineUsersDisplay === 'function') {
      updateOnlineUsersDisplay(onlineUsers);
    }
  });
}

function setUserOnline() {
  if (!currentUser || !onlineUsersRef) return;
  
  const userOnlineRef = onlineUsersRef.child(currentUser.uid);
  
  // Set user online
  userOnlineRef.set({
    name: currentUser.displayName || currentUser.email.split('@')[0],
    email: currentUser.email,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    status: 'online'
  });
  
  // Remove user when they disconnect
  userOnlineRef.onDisconnect().remove();
}

function cleanupListeners() {
  if (messagesListener && chatRef) {
    chatRef.off('child_added', messagesListener);
    messagesListener = null;
  }
  
  if (onlineUsersListener && onlineUsersRef) {
    onlineUsersRef.off('value', onlineUsersListener);
    onlineUsersListener = null;
  }
}

// Send message function
async function sendMessage(text, type = 'text', attachmentUrl = null) {
  if (!currentUser || !chatRef) {
    showToast('Please sign in to send messages', 'error');
    return;
  }
  
  if (!text && !attachmentUrl) return;
  
  try {
    const messageData = {
      id: generateId(),
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.email.split('@')[0],
      senderEmail: currentUser.email,
      text: text || '',
      type: type,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      attachmentUrl: attachmentUrl || null
    };
    
    await chatRef.push(messageData);
    console.log('Message sent successfully');
  } catch (error) {
    console.error('Error sending message:', error);
    showToast('Failed to send message', 'error');
  }
}

// Convert image to base64 for Realtime Database storage
async function convertImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Convert voice recording to base64 for Realtime Database storage
async function convertVoiceToBase64(audioBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
}

// Authentication functions
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((error) => {
    console.error('Error signing in with Google:', error);
    showToast('Failed to sign in with Google', 'error');
  });
}

function signInWithEmail(email, password) {
  auth.signInWithEmailAndPassword(email, password).catch((error) => {
    console.error('Error signing in:', error);
    showToast('Failed to sign in: ' + error.message, 'error');
  });
}

function signUpWithEmail(email, password, name) {
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      return userCredential.user.updateProfile({
        displayName: name
      });
    })
    .then(() => {
      showToast('Account created successfully!', 'success');
    })
    .catch((error) => {
      console.error('Error creating account:', error);
      showToast('Failed to create account: ' + error.message, 'error');
    });
}

function signOutUser() {
  auth.signOut().then(() => {
    showToast('Signed out successfully', 'success');
  }).catch((error) => {
    console.error('Error signing out:', error);
    showToast('Failed to sign out', 'error');
  });
}

function updateUserName(newName) {
  if (!currentUser) return;
  
  currentUser.updateProfile({
    displayName: newName
  }).then(() => {
    showToast('Name updated successfully', 'success');
    // Update online status with new name
    setUserOnline();
  }).catch((error) => {
    console.error('Error updating name:', error);
    showToast('Failed to update name', 'error');
  });
}

// UI update functions
function updateUIForUser(user) {
  const userSettings = document.getElementById('userSettings');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const userEmailDisplay = document.getElementById('userEmailDisplay');
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const navSignIn = document.getElementById('navSignIn');
  const navSignOut = document.getElementById('navSignOut');
  
  if (userSettings) userSettings.style.display = 'block';
  if (userNameDisplay) userNameDisplay.textContent = user.displayName || 'No name set';
  if (userEmailDisplay) userEmailDisplay.textContent = user.email;
  if (signInBtn) signInBtn.style.display = 'none';
  if (signOutBtn) signOutBtn.style.display = 'block';
  if (navSignIn) navSignIn.classList.add('hidden');
  if (navSignOut) navSignOut.classList.remove('hidden');
}

function updateUIForSignedOut() {
  const userSettings = document.getElementById('userSettings');
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const navSignIn = document.getElementById('navSignIn');
  const navSignOut = document.getElementById('navSignOut');
  
  if (userSettings) userSettings.style.display = 'none';
  if (signInBtn) signInBtn.style.display = 'block';
  if (signOutBtn) signOutBtn.style.display = 'none';
  if (navSignIn) navSignIn.classList.remove('hidden');
  if (navSignOut) navSignOut.classList.add('hidden');
  
  // Clear messages
  const messagesList = document.getElementById('messagesList');
  if (messagesList) messagesList.innerHTML = '';
}

// Utility functions
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
    // Create a simple notification sound
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
  }
}

// Initialize Firebase Auth persistence
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log('Firebase auth persistence set to LOCAL');
  })
  .catch((error) => {
    console.error('Error setting auth persistence:', error);
  });

console.log('Firebase Chat initialized successfully');