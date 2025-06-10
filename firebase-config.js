// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyALzgRMGUZFSbiCIf_Bo--iYFuzF7q6WNM",
  authDomain: "note-11065.firebaseapp.com",
  databaseURL: "https://note-11065-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "note-11065",
  storageBucket: "note-11065.firebasestorage.app",
  messagingSenderId: "727662778690",
  appId: "1:727662778690:web:74c986343364d6244850db",
  measurementId: "G-679ZR5YNSL",
}

// Declare Firebase variable
const firebase = window.firebase

// Initialize Firebase when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  if (typeof firebase !== "undefined") {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig)

    // Get Firebase services
    window.auth = firebase.auth()
    window.database = firebase.database()
    window.googleProvider = new firebase.auth.GoogleAuthProvider()

    console.log("Firebase initialized successfully")

    // Initialize auth state listener
    initializeAuth()
  } else {
    console.error("Firebase not loaded")
  }
})

// Auth state management
let currentUser = null
let isGuest = false

function initializeAuth() {
  // Set auth persistence to LOCAL (stays logged in until explicit logout)
  window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => {
    console.log("Auth persistence set to LOCAL")
  }).catch((error) => {
    console.error("Error setting auth persistence:", error)
  })

  // Check if user was in guest mode
  if (localStorage.getItem("isGuest") === "true") {
    isGuest = true
    updateUIForGuest()
    return
  }

  // Listen for auth state changes
  window.auth.onAuthStateChanged((user) => {
    console.log("Auth state changed:", user)

    if (user) {
      currentUser = user
      isGuest = false
      localStorage.removeItem("isGuest")

      // Check if user needs to set username (for Google sign-in users)
      checkUsernameRequired(user)

      // Update UI for logged in user
      updateUIForUser(user)

      // Migrate guest data if exists
      migrateGuestDataToUser(user)

      // Load user data from Firebase
      loadUserData(user)
    } else {
      currentUser = null
      if (!isGuest) {
        updateUIForSignedOut()
      }
    }
  })
}

async function checkUsernameRequired(user) {
  try {
    // Check if username is already saved in localStorage
    const savedUsername = localStorage.getItem(`username_${user.uid}`)
    if (savedUsername) {
      console.log("Username already saved, skipping modal")
      return
    }

    const userSnapshot = await window.database.ref(`users/${user.uid}`).once('value')
    const userData = userSnapshot.val()
    
    if (!userData || !userData.username) {
      // Show username modal for users without username
      if (typeof window.showUsernameModal === 'function') {
        window.showUsernameModal()
      }
    } else {
      // Save username to localStorage to avoid future prompts
      localStorage.setItem(`username_${user.uid}`, userData.username)
    }
  } catch (error) {
    console.error("Error checking username:", error)
  }
}

function updateUIForUser(user) {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle && headerTitle.textContent === "NOTES") {
    headerTitle.textContent = `Hello, ${user.displayName || user.email.split("@")[0]}`
  }

  if (signInBtn) {
    signInBtn.style.display = "none"
  }

  if (userSettings) {
    userSettings.style.display = "block"
    // Update user name in settings
    const userNameDisplay = document.getElementById("userNameDisplay")
    if (userNameDisplay) {
      userNameDisplay.textContent = user.displayName || user.email
    }
  }
}

function updateUIForGuest() {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle && headerTitle.textContent === "NOTES") {
    headerTitle.textContent = "NOTES (Guest)"
  }

  if (signInBtn) {
    signInBtn.style.display = "block"
  }

  if (userSettings) {
    userSettings.style.display = "none"
  }
}

function updateUIForSignedOut() {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle && headerTitle.textContent.startsWith("Hello")) {
    headerTitle.textContent = "NOTES"
  }

  if (signInBtn) {
    signInBtn.style.display = "block"
  }

  if (userSettings) {
    userSettings.style.display = "none"
  }
}

// Data migration and synchronization
function migrateGuestDataToUser(user) {
  const guestNotes = JSON.parse(localStorage.getItem("notes")) || []
  const guestCategories = JSON.parse(localStorage.getItem("categories")) || []

  if (guestNotes.length > 0 || guestCategories.length > 1) {
    // More than just "All" category
    console.log("Migrating guest data to user account...")

    // Save guest data to Firebase
    const userRef = window.database.ref(`users/${user.uid}`)

    userRef
      .update({
        notes: guestNotes,
        categories: guestCategories,
        migratedAt: Date.now(),
      })
      .then(() => {
        console.log("Guest data migrated successfully")
        // Clear local storage after successful migration
        localStorage.removeItem("notes")
        localStorage.removeItem("categories")
        showToast("Your guest data has been saved to your account!")
      })
      .catch((error) => {
        console.error("Error migrating data:", error)
        showToast("Error saving your data. Please try again.")
      })
  }
}

function loadUserData(user) {
  console.log("Loading user data from Firebase...")

  const userRef = window.database.ref(`users/${user.uid}`)

  userRef
    .once("value")
    .then((snapshot) => {
      const userData = snapshot.val()

      if (userData) {
        // Load notes and categories from Firebase
        if (userData.notes) {
          localStorage.setItem("notes", JSON.stringify(userData.notes))
          window.notes = userData.notes
        }

        if (userData.categories) {
          localStorage.setItem("categories", JSON.stringify(userData.categories))
          window.categories = userData.categories
        }

        // Set data loaded flag and refresh UI
        window.dataLoaded = true;
        
        // Trigger UI refresh for the main app
        if (typeof window.renderNotes === "function") {
          window.renderNotes()
        }
        if (typeof window.renderCategories === "function") {
          window.renderCategories()
        }
        if (typeof window.updateFilterChips === "function") {
          window.updateFilterChips()
        }

        console.log("User data loaded successfully")
      } else {
        // First time user - initialize with default data
        const defaultCategories = [{ id: "all", name: "All" }]
        userRef.set({
          name: user.displayName || user.email.split("@")[0],
          email: user.email,
          notes: [],
          categories: defaultCategories,
          createdAt: Date.now(),
          lastLogin: Date.now(),
        })
      }
    })
    .catch((error) => {
      console.error("Error loading user data:", error)
      showToast("Error loading your data. Please refresh the page.")
    })
}

function saveUserData() {
  if (currentUser && !isGuest) {
    const notes = JSON.parse(localStorage.getItem("notes")) || []
    const categories = JSON.parse(localStorage.getItem("categories")) || []

    const userRef = window.database.ref(`users/${currentUser.uid}`)

    userRef
      .update({
        notes: notes,
        categories: categories,
        lastUpdated: Date.now(),
      })
      .catch((error) => {
        console.error("Error saving user data:", error)
      })
  }
}

// Auth functions
function continueAsGuest() {
  console.log("Continuing as guest")
  isGuest = true
  localStorage.setItem("isGuest", "true")
  updateUIForGuest()
  window.location.href = "index.html"
}

function signInWithGoogle() {
  return window.auth.signInWithPopup(window.googleProvider).then((result) => {
    const user = result.user
    console.log("Google sign-in successful:", user)

    // Update user info in database
    window.database.ref(`users/${user.uid}`).update({
      name: user.displayName,
      email: user.email,
      lastLogin: Date.now(),
      photoURL: user.photoURL,
    })

    return user
  })
}

function signUpWithEmail(email, password, name, username) {
  return window.auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
    const user = userCredential.user

    // Update user profile
    return user
      .updateProfile({
        displayName: name,
      })
      .then(() => {
        // Reserve username
        return window.database.ref(`usernames/${username}`).set(user.uid)
      })
      .then(() => {
        // Save user info to database
        return window.database.ref(`users/${user.uid}`).set({
          name: name,
          email: email,
          username: username,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          notes: [],
          categories: [{ id: "all", name: "All" }],
        })
      })
      .then(() => user)
  })
}

function signInWithEmail(email, password) {
  return window.auth.signInWithEmailAndPassword(email, password).then((userCredential) => {
    const user = userCredential.user

    // Update last login
    window.database.ref(`users/${user.uid}`).update({
      lastLogin: Date.now(),
    })

    return user
  })
}

function signOutUser() {
  return window.auth.signOut().then(() => {
    currentUser = null
    isGuest = false
    localStorage.removeItem("isGuest")
    localStorage.removeItem("notes")
    localStorage.removeItem("categories")
    localStorage.removeItem("cachedInvitations")
    localStorage.removeItem("cachedSharedNotes")
    
    // Clear all username cache to prevent future prompts
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('username_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    console.log("User signed out successfully")
    window.location.href = "index.html"
  })
}

function updateUserName(newName) {
  if (!currentUser) return Promise.reject("No user logged in")

  return currentUser
    .updateProfile({
      displayName: newName,
    })
    .then(() => {
      // Update in database
      return window.database.ref(`users/${currentUser.uid}`).update({
        name: newName,
        lastUpdated: Date.now(),
      })
    })
    .then(() => {
      updateUIForUser(currentUser)
      showToast("Name updated successfully!")
    })
}

// Sharing functions
async function getInvitations() {
  if (!currentUser) return []

  try {
    const snapshot = await window.database.ref(`users/${currentUser.uid}/invitations`).once('value')
    const invitations = snapshot.val() || {}
    return Object.values(invitations).filter(inv => inv.status === 'pending')
  } catch (error) {
    console.error("Error fetching invitations:", error)
    return []
  }
}

async function acceptInvitation(invitationId, sharedId) {
  if (!currentUser) throw new Error("No user logged in")

  // Remove invitation
  await window.database.ref(`users/${currentUser.uid}/invitations/${invitationId}`).remove()
  
  // Add user to shared note collaborators
  const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`)
  const snapshot = await sharedNoteRef.once('value')
  const sharedNote = snapshot.val()
  
  if (sharedNote) {
    const collaborators = sharedNote.collaborators || []
    if (!collaborators.includes(currentUser.uid)) {
      collaborators.push(currentUser.uid)
      await sharedNoteRef.update({ collaborators })
    }
  }
}

async function declineInvitation(invitationId) {
  if (!currentUser) throw new Error("No user logged in")

  await window.database.ref(`users/${currentUser.uid}/invitations/${invitationId}`).remove()
}

async function getSharedNotes() {
  if (!currentUser) return []

  try {
    const snapshot = await window.database.ref('sharedNotes').once('value')
    const sharedNotes = snapshot.val() || {}
    
    return Object.entries(sharedNotes)
      .filter(([id, note]) => 
        note.ownerId === currentUser.uid || 
        (note.collaborators && note.collaborators.includes(currentUser.uid))
      )
      .map(([id, note]) => ({ id, ...note }))
  } catch (error) {
    console.error("Error fetching shared notes:", error)
    return []
  }
}

async function updateSharedNote(sharedId, updates) {
  if (!currentUser) throw new Error("No user logged in")

  const updateData = {
    ...updates,
    lastEditedBy: currentUser.uid,
    updatedAt: Date.now()
  }

  await window.database.ref(`sharedNotes/${sharedId}`).update(updateData)
}

async function updatePresence(sharedId, data) {
  if (!currentUser) return

  const presenceRef = window.database.ref(`sharedNotes/${sharedId}/activeUsers/${currentUser.uid}`)
  
  await presenceRef.set({
    name: currentUser.displayName || currentUser.email,
    lastActive: Date.now(),
    ...data
  })

  // Remove presence on disconnect
  presenceRef.onDisconnect().remove()
}

// Utility functions
function showToast(message) {
  const toast = document.getElementById("toast")
  const toastMessage = document.getElementById("toastMessage")

  if (toast && toastMessage) {
    toastMessage.textContent = message
    toast.classList.add("show")
    setTimeout(() => {
      toast.classList.remove("show")
    }, 3000)
  }
}

function getCurrentUser() {
  return currentUser
}

function isUserGuest() {
  return isGuest
}

// Export functions globally
window.authFunctions = {
  continueAsGuest,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  signOutUser,
  updateUserName,
  getCurrentUser,
  isUserGuest,
  saveUserData,
  getInvitations,
  acceptInvitation,
  declineInvitation,
  getSharedNotes,
  updateSharedNote,
  updatePresence,
}

// For module compatibility
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    auth: null,
    database: null,
    googleProvider: null,
    signInWithPopup: () => Promise.reject(new Error("Firebase not initialized")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
    signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
    signOut: () => Promise.reject(new Error("Firebase not initialized")),
    onAuthStateChanged: () => () => {},
    updateProfile: () => Promise.reject(new Error("Firebase not initialized")),
    ref: () => null,
    set: () => Promise.reject(new Error("Firebase not initialized")),
  }
}
