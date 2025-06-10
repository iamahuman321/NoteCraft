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

function updateUIForUser(user) {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle) {
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

  if (headerTitle) {
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

  if (headerTitle) {
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

        // Refresh UI if we're on the main page
        if (typeof window.renderNotes === "function") {
          window.renderNotes()
        }
        if (typeof window.renderCategories === "function") {
          window.renderCategories()
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

function signUpWithEmail(email, password, name) {
  return window.auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
    const user = userCredential.user

    // Update user profile
    return user
      .updateProfile({
        displayName: name,
      })
      .then(() => {
        // Save user info to database
        return window.database.ref(`users/${user.uid}`).set({
          name: name,
          email: email,
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
