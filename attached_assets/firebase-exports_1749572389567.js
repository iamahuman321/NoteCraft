// ES Module exports for deployment compatibility
// This file provides the required exports for the deployment system

// Mock implementations for deployment
const auth = {
  createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
  signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
  signInWithPopup: () => Promise.reject(new Error("Firebase not initialized")),
  signOut: () => Promise.reject(new Error("Firebase not initialized")),
  onAuthStateChanged: () => () => {},
  currentUser: null,
}

const database = {
  ref: () => ({
    set: () => Promise.reject(new Error("Firebase not initialized")),
  }),
}

const googleProvider = {}

const signInWithPopup = () => Promise.reject(new Error("Firebase not initialized"))
const createUserWithEmailAndPassword = () => Promise.reject(new Error("Firebase not initialized"))
const signInWithEmailAndPassword = () => Promise.reject(new Error("Firebase not initialized"))
const signOut = () => Promise.reject(new Error("Firebase not initialized"))
const onAuthStateChanged = () => () => {}
const updateProfile = () => Promise.reject(new Error("Firebase not initialized"))
const ref = () => null
const set = () => Promise.reject(new Error("Firebase not initialized"))

export {
  auth,
  database,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  ref,
  set,
}

export default {
  auth,
  database,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  ref,
  set,
}
