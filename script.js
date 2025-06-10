// Notes App Main JavaScript
// Global variables
let notes = JSON.parse(localStorage.getItem("notes")) || [];
let categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }];
let currentNote = null;
let currentFilter = "all";
let currentListType = "bulleted";
// currentUser is managed by firebase-config.js
let sharedNoteListeners = new Map(); // Track Firebase listeners for shared notes

// Translations
const translations = {
  en: {
    noteAdded: "Note added",
    noteUpdated: "Note updated",
    noteDeleted: "Note deleted",
    categoryAdded: "Category added",
    categoryDeleted: "Category deleted",
    passwordSet: "Password set",
    passwordRemoved: "Password removed",
    incorrectPassword: "Incorrect password",
    emptyNote: "Note cannot be empty",
    noteShared: "Note shared successfully",
    invitationSent: "Invitation sent",
    invitationAccepted: "Invitation accepted",
    invitationDeclined: "Invitation declined",
    userNotFound: "User not found",
    shareNote: "Share Note",
    searchUsers: "Search users...",
    accept: "Accept",
    decline: "Decline",
    userEditing: "is editing...",
    changesWillSync: "Changes will sync when online",
    guestCannotShare: "Sign in to share notes",
    usernameTaken: "Username is already taken",
    enterUsername: "Please enter a username",
    usernameInvalid: "Username must be 4-20 characters, letters, numbers, and underscores only",
    offlineWarning: "This feature requires internet connection"
  }
};

let currentLanguage = localStorage.getItem("language") || "en";

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

// Initialize app
document.addEventListener("DOMContentLoaded", function() {
  initializeApp();
});

function initializeApp() {
  // Wait for Firebase to be ready
  function waitForFirebase() {
    return new Promise((resolve) => {
      const checkFirebase = () => {
        if (window.auth && window.database && window.authFunctions) {
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      };
      checkFirebase();
    });
  }

  waitForFirebase().then(() => {
    console.log("Firebase ready for main app");
    
    // Get current user from firebase-config
    window.currentUser = window.authFunctions.getCurrentUser();
    
    // Initialize UI
    setupEventListeners();
    renderNotes();
    renderCategories();
    updateFilterChips();
    loadSettings();
    updateShareButtonVisibility();
    
    // Listen for auth state changes
    if (window.auth) {
      window.auth.onAuthStateChanged((user) => {
        window.currentUser = user;
        updateShareButtonVisibility();
        updateSidebarAuth();
      });
    }
  });
}

function setupEventListeners() {
  // Hamburger menu
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const sidebarClose = document.getElementById("sidebarClose");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", toggleSidebar);
  if (sidebarClose) sidebarClose.addEventListener("click", closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

  // Navigation
  const addNoteBtn = document.getElementById("addNoteBtn");
  const backBtn = document.getElementById("backBtn");
  const navNotes = document.getElementById("navNotes");
  const navSettings = document.getElementById("navSettings");
  const navSignOut = document.getElementById("navSignOut");
  const signInBtn = document.getElementById("signInBtn");

  if (addNoteBtn) addNoteBtn.addEventListener("click", createNewNote);
  if (backBtn) backBtn.addEventListener("click", showNotesPage);
  if (navNotes) navNotes.addEventListener("click", (e) => {
    e.preventDefault();
    showNotesPage();
    closeSidebar();
  });
  if (navSettings) navSettings.addEventListener("click", (e) => {
    e.preventDefault();
    showSettingsPage();
    closeSidebar();
  });
  if (navSignOut) navSignOut.addEventListener("click", (e) => {
    e.preventDefault();
    if (window.authFunctions) {
      window.authFunctions.signOutUser();
    }
    closeSidebar();
  });
  if (signInBtn) signInBtn.addEventListener("click", () => window.location.href = "login.html");

  // Editor
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  if (titleInput) titleInput.addEventListener("input", debounce(saveCurrentNote, 500));
  if (contentTextarea) contentTextarea.addEventListener("input", debounce(saveCurrentNote, 500));
  
  // Toolbar buttons
  const imageBtn = document.getElementById("imageBtn");
  const listBtn = document.getElementById("listBtn");
  const passwordBtn = document.getElementById("passwordBtn");
  const shareBtn = document.getElementById("shareBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  
  if (imageBtn) imageBtn.addEventListener("click", handleImageUpload);
  if (listBtn) listBtn.addEventListener("click", showListTypeModal);
  if (passwordBtn) passwordBtn.addEventListener("click", showPasswordModal);
  if (shareBtn) shareBtn.addEventListener("click", showShareModal);
  if (deleteBtn) deleteBtn.addEventListener("click", () => {
    if (currentNote) showDeleteModal(currentNote);
  });

  // Categories
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  if (addCategoryBtn) addCategoryBtn.addEventListener("click", showCategoryModal);

  // Modals
  setupModalEventListeners();

  // Filter chips
  document.getElementById("filterChips").addEventListener("click", handleFilterClick);

  // Settings
  document.getElementById("themeSelect").addEventListener("change", handleThemeChange);
  document.getElementById("languageSelect").addEventListener("change", handleLanguageChange);
}

function setupModalEventListeners() {
  // Password modal
  document.getElementById("passwordModalClose").addEventListener("click", hidePasswordModal);
  document.getElementById("savePasswordBtn").addEventListener("click", savePassword);
  document.getElementById("removePasswordBtn").addEventListener("click", removePassword);
  document.getElementById("passwordToggle").addEventListener("click", togglePasswordVisibility);

  // Category modal
  document.getElementById("categoryModalClose").addEventListener("click", hideCategoryModal);

  // Share modal
  document.getElementById("shareModalClose").addEventListener("click", hideShareModal);
  document.getElementById("sendInvitesBtn").addEventListener("click", sendInvitations);
  document.getElementById("cancelShareBtn").addEventListener("click", hideShareModal);
  document.getElementById("userSearchInput").addEventListener("input", debounce(searchUsers, 300));

  // Username modal
  document.getElementById("saveUsernameBtn").addEventListener("click", saveUsername);

  // Name modal
  document.getElementById("nameModalClose").addEventListener("click", hideNameModal);
  document.getElementById("saveNameBtn").addEventListener("click", saveName);
  document.getElementById("cancelNameBtn").addEventListener("click", hideNameModal);

  // Delete modal
  document.getElementById("deleteModalClose").addEventListener("click", hideDeleteModal);
  document.getElementById("confirmDeleteBtn").addEventListener("click", confirmDelete);
  document.getElementById("cancelDeleteBtn").addEventListener("click", hideDeleteModal);

  // List type modal
  document.getElementById("listTypeModalClose").addEventListener("click", hideListTypeModal);
  document.querySelectorAll(".list-type-btn").forEach(btn => {
    btn.addEventListener("click", selectListType);
  });

  // Close modals on overlay click
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("show");
      }
    });
  });
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  sidebar.classList.toggle("open");
  hamburgerBtn.classList.toggle("active");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  sidebar.classList.remove("open");
  hamburgerBtn.classList.remove("active");
}

function updateSidebarAuth() {
  const navSignIn = document.getElementById("navSignIn");
  const navSignOut = document.getElementById("navSignOut");
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  if (currentUser && !isGuest) {
    navSignIn.classList.add("hidden");
    navSignOut.classList.remove("hidden");
  } else {
    navSignIn.classList.remove("hidden");
    navSignOut.classList.add("hidden");
  }
}

// Note management
function createNewNote() {
  currentNote = {
    id: generateId(),
    title: "",
    content: "",
    categories: [],
    images: [],
    listItems: [],
    listType: "bulleted",
    password: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isShared: false,
    sharedId: null
  };

  showEditorPage();
  updateEditorContent();
  document.getElementById("titleInput").focus();
}

function editNote(note) {
  if (note.password && !verifyNotePassword(note)) {
    return;
  }

  currentNote = { ...note };
  showEditorPage();
  updateEditorContent();
  
  // If this is a shared note, set up real-time collaboration
  if (note.isShared && note.sharedId && currentUser) {
    setupRealTimeCollaboration(note.sharedId);
  }
}

function verifyNotePassword(note) {
  if (!note.password) return true;
  
  const password = prompt("Enter note password:");
  return password === note.password;
}

function saveCurrentNote() {
  if (!currentNote) return;

  // Update note data
  currentNote.title = document.getElementById("titleInput").value;
  currentNote.content = document.getElementById("contentTextarea").value;
  currentNote.updatedAt = Date.now();

  // Save to appropriate location
  if (currentNote.isShared && currentNote.sharedId && currentUser) {
    saveSharedNote();
  } else {
    saveLocalNote();
  }
}

function saveLocalNote() {
  const existingIndex = notes.findIndex(n => n.id === currentNote.id);
  
  if (existingIndex >= 0) {
    notes[existingIndex] = { ...currentNote };
    showToast(t("noteUpdated"));
  } else {
    notes.push({ ...currentNote });
    showToast(t("noteAdded"));
  }

  localStorage.setItem("notes", JSON.stringify(notes));
  
  // Save to Firebase if user is authenticated
  if (window.authFunctions && currentUser && !isGuest) {
    window.authFunctions.saveUserData();
  }

  renderNotes();
}

function saveSharedNote() {
  if (!currentUser || !currentNote.sharedId) return;

  const sharedNoteRef = window.database.ref(`sharedNotes/${currentNote.sharedId}`);
  
  sharedNoteRef.update({
    title: currentNote.title,
    content: currentNote.content,
    updatedAt: Date.now(),
    lastEditedBy: currentUser.uid
  }).catch(error => {
    console.error("Error saving shared note:", error);
    showToast("Error saving shared note");
  });
}

function deleteNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  if (note.password) {
    showDeleteModal(note);
  } else {
    confirmDeleteNote(noteId);
  }
}

function confirmDeleteNote(noteId) {
  const noteIndex = notes.findIndex(n => n.id === noteId);
  if (noteIndex >= 0) {
    notes.splice(noteIndex, 1);
    localStorage.setItem("notes", JSON.stringify(notes));
    
    // Save to Firebase if user is authenticated
    if (window.authFunctions && currentUser && !isGuest) {
      window.authFunctions.saveUserData();
    }

    renderNotes();
    showToast(t("noteDeleted"));
    
    if (currentNote && currentNote.id === noteId) {
      showNotesPage();
    }
  }
}

// Real-time collaboration
function setupRealTimeCollaboration(sharedId) {
  if (!currentUser || !sharedId) return;

  const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
  
  // Clean up existing listeners
  if (sharedNoteListeners.has(sharedId)) {
    sharedNoteListeners.get(sharedId).off();
  }

  // Listen for content changes
  const contentListener = sharedNoteRef.on('value', (snapshot) => {
    const sharedNote = snapshot.val();
    if (!sharedNote) return;

    // Update local note if changed by another user
    if (sharedNote.lastEditedBy !== currentUser.uid) {
      const titleInput = document.getElementById("titleInput");
      const contentTextarea = document.getElementById("contentTextarea");
      
      if (titleInput.value !== sharedNote.title) {
        titleInput.value = sharedNote.title;
        currentNote.title = sharedNote.title;
      }
      
      if (contentTextarea.value !== sharedNote.content) {
        contentTextarea.value = sharedNote.content;
        currentNote.content = sharedNote.content;
      }
    }

    // Update collaborator status
    updateCollaboratorStatus(sharedNote.activeUsers || {});
  });

  sharedNoteListeners.set(sharedId, { off: () => sharedNoteRef.off('value', contentListener) });

  // Update presence
  updatePresence(sharedId);
}

function updatePresence(sharedId) {
  if (!currentUser || !sharedId) return;

  const presenceRef = window.database.ref(`sharedNotes/${sharedId}/activeUsers/${currentUser.uid}`);
  
  presenceRef.set({
    name: currentUser.displayName || currentUser.email,
    lastActive: Date.now()
  });

  // Remove presence on disconnect
  presenceRef.onDisconnect().remove();
}

function updateCollaboratorStatus(activeUsers) {
  const collaboratorStatus = document.getElementById("collaboratorStatus");
  const collaboratorList = document.getElementById("collaboratorList");
  
  if (!collaboratorStatus || !collaboratorList) return;

  const users = Object.entries(activeUsers || {});
  const otherUsers = users.filter(([uid]) => uid !== currentUser?.uid);

  if (otherUsers.length === 0) {
    collaboratorStatus.style.display = "none";
    return;
  }

  collaboratorStatus.style.display = "block";
  collaboratorList.innerHTML = otherUsers.map(([uid, user]) => {
    const isActive = Date.now() - user.lastActive < 60000; // Active within last minute
    return `
      <div class="collaborator-badge ${isActive ? 'active' : ''}">
        <i class="fas fa-user"></i>
        ${user.name}
        ${isActive ? `<small>${t("userEditing")}</small>` : ''}
      </div>
    `;
  }).join('');
}

// Sharing functionality
function showShareModal() {
  if (isGuest) {
    showToast(t("guestCannotShare"));
    return;
  }

  if (!navigator.onLine) {
    showToast(t("offlineWarning"));
    return;
  }

  if (!currentNote) return;

  document.getElementById("shareModal").classList.add("show");
  document.getElementById("userSearchInput").value = "";
  document.getElementById("searchResults").innerHTML = "";
  document.getElementById("selectedUsers").innerHTML = "";
  document.getElementById("sendInvitesBtn").disabled = true;
}

function hideShareModal() {
  document.getElementById("shareModal").classList.remove("show");
}

async function searchUsers(query) {
  if (!query || query.length < 2) {
    document.getElementById("searchResults").innerHTML = "";
    return;
  }

  try {
    const usersRef = window.database.ref('users');
    const snapshot = await usersRef.orderByChild('email').startAt(query).endAt(query + '\uf8ff').limitToFirst(10).once('value');
    
    const results = [];
    snapshot.forEach(child => {
      const user = child.val();
      if (user.email !== currentUser?.email) {
        results.push({
          uid: child.key,
          ...user
        });
      }
    });

    // Also search by username
    const usernameSnapshot = await usersRef.orderByChild('username').startAt(query).endAt(query + '\uf8ff').limitToFirst(10).once('value');
    
    usernameSnapshot.forEach(child => {
      const user = child.val();
      if (user.email !== currentUser?.email && !results.find(r => r.uid === child.key)) {
        results.push({
          uid: child.key,
          ...user
        });
      }
    });

    renderSearchResults(results);
  } catch (error) {
    console.error("Error searching users:", error);
    showToast("Error searching users");
  }
}

function renderSearchResults(users) {
  const searchResults = document.getElementById("searchResults");
  
  if (users.length === 0) {
    searchResults.innerHTML = '<p class="text-muted">No users found</p>';
    return;
  }

  searchResults.innerHTML = users.map(user => `
    <div class="user-result" onclick="selectUser('${user.uid}', '${user.name || user.email}', '${user.username || ''}')">
      <input type="checkbox" class="user-checkbox" id="user-${user.uid}" />
      <div class="user-info">
        <div class="user-name">${user.name || user.email}</div>
        <div class="user-username">@${user.username || 'no-username'}</div>
      </div>
    </div>
  `).join('');
}

function selectUser(uid, name, username) {
  const checkbox = document.getElementById(`user-${uid}`);
  checkbox.checked = !checkbox.checked;
  
  const selectedUsers = document.getElementById("selectedUsers");
  const sendBtn = document.getElementById("sendInvitesBtn");
  
  if (checkbox.checked) {
    const userDiv = document.createElement('div');
    userDiv.className = 'selected-user';
    userDiv.id = `selected-${uid}`;
    userDiv.innerHTML = `
      <div class="user-info">
        <div class="user-name">${name}</div>
        <div class="user-username">@${username || 'no-username'}</div>
      </div>
      <button class="remove-user" onclick="removeSelectedUser('${uid}')">
        <i class="fas fa-times"></i>
      </button>
    `;
    selectedUsers.appendChild(userDiv);
  } else {
    const existingDiv = document.getElementById(`selected-${uid}`);
    if (existingDiv) {
      existingDiv.remove();
    }
  }
  
  // Update send button state
  const selectedCount = selectedUsers.children.length;
  sendBtn.disabled = selectedCount === 0;
}

function removeSelectedUser(uid) {
  const selectedDiv = document.getElementById(`selected-${uid}`);
  const checkbox = document.getElementById(`user-${uid}`);
  
  if (selectedDiv) selectedDiv.remove();
  if (checkbox) checkbox.checked = false;
  
  const sendBtn = document.getElementById("sendInvitesBtn");
  const selectedCount = document.getElementById("selectedUsers").children.length;
  sendBtn.disabled = selectedCount === 0;
}

async function sendInvitations() {
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentNote || !currentUser) return;

  const selectedUsers = Array.from(document.getElementById("selectedUsers").children).map(div => {
    const uid = div.id.replace('selected-', '');
    const name = div.querySelector('.user-name').textContent;
    return { uid, name };
  });

  if (selectedUsers.length === 0) return;

  try {
    // Create shared note if it doesn't exist
    let sharedId = currentNote.sharedId;
    
    if (!sharedId) {
      sharedId = generateId();
      
      const sharedNoteData = {
        noteId: currentNote.id,
        ownerId: currentUser.uid,
        ownerName: currentUser.displayName || currentUser.email,
        title: currentNote.title,
        content: currentNote.content,
        collaborators: selectedUsers.map(u => u.uid),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await window.database.ref(`sharedNotes/${sharedId}`).set(sharedNoteData);
      
      // Update local note
      currentNote.isShared = true;
      currentNote.sharedId = sharedId;
      saveLocalNote();
    }

    // Send invitations
    const invitationPromises = selectedUsers.map(user => {
      const invitationData = {
        id: generateId(),
        noteId: currentNote.id,
        sharedId: sharedId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email,
        noteTitle: currentNote.title,
        status: 'pending',
        createdAt: Date.now()
      };

      return window.database.ref(`users/${user.uid}/invitations/${invitationData.id}`).set(invitationData);
    });

    await Promise.all(invitationPromises);
    
    hideShareModal();
    showToast(t("noteShared"));
    
  } catch (error) {
    console.error("Error sending invitations:", error);
    showToast("Error sharing note");
  }
}

function updateShareButtonVisibility() {
  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.style.display = (currentUser && !isGuest) ? "block" : "none";
  }
}

// Username modal for Google sign-in users
function showUsernameModal() {
  document.getElementById("usernameModal").classList.add("show");
  document.getElementById("usernameModalInput").focus();
}

function hideUsernameModal() {
  document.getElementById("usernameModal").classList.remove("show");
}

async function saveUsername() {
  const username = document.getElementById("usernameModalInput").value.trim();
  
  if (!validateUsername(username)) {
    showToast(t("usernameInvalid"));
    return;
  }

  try {
    const saveBtn = document.getElementById("saveUsernameBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    // Check availability
    const snapshot = await window.database.ref(`usernames/${username}`).once('value');
    if (snapshot.exists()) {
      showToast(t("usernameTaken"));
      return;
    }

    // Save username
    await window.database.ref(`usernames/${username}`).set(currentUser.uid);
    await window.database.ref(`users/${currentUser.uid}`).update({ username });

    hideUsernameModal();
    showToast("Username saved!");

  } catch (error) {
    console.error("Error saving username:", error);
    showToast("Error saving username");
  } finally {
    const saveBtn = document.getElementById("saveUsernameBtn");
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'SAVE';
  }
}

function validateUsername(username) {
  const regex = /^[a-zA-Z0-9_]{4,20}$/;
  return regex.test(username);
}

// Name change modal
function showNameModal() {
  if (!currentUser) return;
  
  document.getElementById("nameModal").classList.add("show");
  document.getElementById("nameModalInput").value = currentUser.displayName || "";
  document.getElementById("nameModalInput").focus();
}

function hideNameModal() {
  document.getElementById("nameModal").classList.remove("show");
}

async function saveName() {
  const newName = document.getElementById("nameModalInput").value.trim();
  
  if (!newName) {
    showToast("Name cannot be empty");
    return;
  }

  try {
    await window.authFunctions.updateUserName(newName);
    hideNameModal();
  } catch (error) {
    console.error("Error updating name:", error);
    showToast("Error updating name");
  }
}

// Category management
function showCategoryModal() {
  document.getElementById("categoryModal").classList.add("show");
  renderModalCategories();
}

function hideCategoryModal() {
  document.getElementById("categoryModal").classList.remove("show");
}

function renderModalCategories() {
  const modalCategoriesList = document.getElementById("modalCategoriesList");
  const userCategories = categories.filter(c => c.id !== "all");

  modalCategoriesList.innerHTML = userCategories.map(category => `
    <div class="category-checkbox">
      <input type="checkbox" id="modal-cat-${category.id}" 
             ${currentNote?.categories?.includes(category.id) ? 'checked' : ''} 
             onchange="toggleNoteCategory('${category.id}')" />
      <label for="modal-cat-${category.id}">${category.name}</label>
    </div>
  `).join('');
}

function toggleNoteCategory(categoryId) {
  if (!currentNote) return;

  if (!currentNote.categories) {
    currentNote.categories = [];
  }

  const index = currentNote.categories.indexOf(categoryId);
  if (index >= 0) {
    currentNote.categories.splice(index, 1);
  } else {
    currentNote.categories.push(categoryId);
  }

  updateCategoryChips();
  saveCurrentNote();
}

function updateCategoryChips() {
  const categoryChips = document.getElementById("categoryChips");
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  
  // Clear existing chips except add button
  const existingChips = categoryChips.querySelectorAll(".chip:not(.outline)");
  existingChips.forEach(chip => chip.remove());

  if (currentNote?.categories) {
    currentNote.categories.forEach(categoryId => {
      const category = categories.find(c => c.id === categoryId);
      if (category) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.innerHTML = `
          ${category.name}
          <i class="fas fa-times" onclick="toggleNoteCategory('${categoryId}')"></i>
        `;
        categoryChips.insertBefore(chip, addCategoryBtn);
      }
    });
  }
}

// Rendering functions
function renderNotes() {
  const notesContainer = document.getElementById("notesContainer");
  if (!notesContainer) return;

  let filteredNotes = notes;
  if (currentFilter !== "all") {
    filteredNotes = notes.filter(note => 
      note.categories && note.categories.includes(currentFilter)
    );
  }

  if (filteredNotes.length === 0) {
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-sticky-note"></i>
        <h3>No notes yet</h3>
        <p>Tap the + button to create your first note</p>
      </div>
    `;
    return;
  }
  
  notesContainer.innerHTML = `
    <div class="notes-grid">
      ${filteredNotes.map(note => {
    const preview = note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content;
    const dateStr = new Date(note.updatedAt).toLocaleDateString();
    
    const categoryTags = note.categories?.map(catId => {
      const category = categories.find(c => c.id === catId);
      return category ? `<span class="note-category">${category.name}</span>` : "";
    }).join("") || "";

    const passwordIcon = note.password ? "password-protected" : "";
    const sharedIcon = note.isShared ? "shared" : "";
    
    return `
      <div class="note-card ${passwordIcon} ${sharedIcon}" onclick="editNote(${JSON.stringify(note).replace(/"/g, '&quot;')})">
        <div class="note-title">${note.title || "Untitled"}</div>
        <div class="note-content">${preview}</div>
        <div class="note-meta">
          <div class="note-date">
            <i class="fas fa-clock"></i>
            ${dateStr}
          </div>
          <div class="note-categories">${categoryTags}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCategories() {
  // This function is called to refresh category data
  // The actual rendering is handled by category.js when on category.html
  updateFilterChips();
}

function updateFilterChips() {
  const filterChips = document.getElementById("filterChips");
  
  filterChips.innerHTML = categories.map(category => `
    <button class="chip ${currentFilter === category.id ? 'active' : ''}" 
            data-filter="${category.id}">
      ${category.name}
    </button>
  `).join("");
}

// UI functions
function showNotesPage() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById("notesPage").classList.add("active");
  document.getElementById("backBtn").classList.add("hidden");
  document.getElementById("headerTitle").textContent = isGuest ? "NOTES (Guest)" : 
    currentUser ? `Hello, ${currentUser.displayName || currentUser.email.split("@")[0]}` : "NOTES";
  
  // Clean up real-time listeners
  sharedNoteListeners.forEach(listener => listener.off());
  sharedNoteListeners.clear();
}

function showEditorPage() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById("editorPage").classList.add("active");
  document.getElementById("backBtn").classList.remove("hidden");
  document.getElementById("headerTitle").textContent = "EDIT NOTE";
}

function showSettingsPage() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById("settingsPage").classList.add("active");
  document.getElementById("backBtn").classList.remove("hidden");
  document.getElementById("headerTitle").textContent = "SETTINGS";
}

function updateEditorContent() {
  if (!currentNote) return;

  document.getElementById("titleInput").value = currentNote.title || "";
  document.getElementById("contentTextarea").value = currentNote.content || "";
  
  const dateInfo = document.getElementById("dateInfo");
  const created = new Date(currentNote.createdAt).toLocaleString();
  const updated = new Date(currentNote.updatedAt).toLocaleString();
  dateInfo.innerHTML = `Created: ${created}<br>Updated: ${updated}`;

  updateCategoryChips();
  updatePasswordButton();
  updateListSection();
  updateImagesSection();
}

// Password functionality
function showPasswordModal() {
  document.getElementById("passwordModal").classList.add("show");
  document.getElementById("passwordInput").value = currentNote?.password || "";
  document.getElementById("passwordInput").focus();
}

function hidePasswordModal() {
  document.getElementById("passwordModal").classList.remove("show");
}

function savePassword() {
  const password = document.getElementById("passwordInput").value;
  
  if (password.length < 4) {
    showToast("Password must be at least 4 characters");
    return;
  }

  if (currentNote) {
    currentNote.password = password;
    saveCurrentNote();
    hidePasswordModal();
    updatePasswordButton();
    showToast(t("passwordSet"));
  }
}

function removePassword() {
  if (currentNote) {
    currentNote.password = "";
    saveCurrentNote();
    hidePasswordModal();
    updatePasswordButton();
    showToast(t("passwordRemoved"));
  }
}

function updatePasswordButton() {
  const passwordIcon = document.getElementById("passwordIcon");
  if (currentNote?.password) {
    passwordIcon.className = "fas fa-lock";
  } else {
    passwordIcon.className = "fas fa-unlock";
  }
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById("passwordInput");
  const toggleIcon = document.getElementById("passwordToggle").querySelector("i");
  
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleIcon.className = "fas fa-eye-slash";
  } else {
    passwordInput.type = "password";
    toggleIcon.className = "fas fa-eye";
  }
}

// List functionality
function showListTypeModal() {
  document.getElementById("listTypeModal").classList.add("show");
}

function hideListTypeModal() {
  document.getElementById("listTypeModal").classList.remove("show");
}

function selectListType(event) {
  const type = event.currentTarget.getAttribute("data-type");
  currentListType = type;
  
  if (currentNote) {
    currentNote.listType = type;
    if (!currentNote.listItems) {
      currentNote.listItems = [];
    }
    updateListSection();
    saveCurrentNote();
  }
  
  hideListTypeModal();
}

function updateListSection() {
  const listSection = document.getElementById("listSection");
  const listItems = document.getElementById("listItems");
  
  if (!currentNote?.listItems || currentNote.listItems.length === 0) {
    listSection.classList.add("hidden");
    return;
  }
  
  listSection.classList.remove("hidden");
  
  listItems.innerHTML = currentNote.listItems.map((item, index) => {
    let prefix = "";
    switch (currentNote.listType) {
      case "bulleted":
        prefix = "•";
        break;
      case "numbered":
        prefix = `${index + 1}.`;
        break;
      case "checklist":
        prefix = `<input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleListItem(${index})">`;
        break;
    }
    
    return `
      <div class="list-item">
        <span class="list-prefix">${prefix}</span>
        <input type="text" class="list-item-input" value="${item.text || item}" 
               onchange="updateListItem(${index}, this.value)" />
        <button class="list-item-delete" onclick="deleteListItem(${index})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
  }).join("");
}

function addListItem() {
  if (!currentNote) {
    currentNote = {
      id: generateId(),
      title: "",
      content: "",
      categories: [],
      images: [],
      listItems: [],
      listType: currentListType,
      password: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  
  if (!currentNote.listItems) {
    currentNote.listItems = [];
  }
  
  const newItem = currentNote.listType === "checklist" 
    ? { text: "", checked: false }
    : "";
    
  currentNote.listItems.push(newItem);
  updateListSection();
  saveCurrentNote();
  
  // Focus on the new item
  const listItems = document.querySelectorAll(".list-item-input");
  if (listItems.length > 0) {
    listItems[listItems.length - 1].focus();
  }
}

function updateListItem(index, value) {
  if (!currentNote?.listItems) return;
  
  if (currentNote.listType === "checklist") {
    currentNote.listItems[index].text = value;
  } else {
    currentNote.listItems[index] = value;
  }
  
  saveCurrentNote();
}

function toggleListItem(index) {
  if (!currentNote?.listItems || currentNote.listType !== "checklist") return;
  
  currentNote.listItems[index].checked = !currentNote.listItems[index].checked;
  saveCurrentNote();
}

function deleteListItem(index) {
  if (!currentNote?.listItems) return;
  
  currentNote.listItems.splice(index, 1);
  updateListSection();
  saveCurrentNote();
}

// Setup list item button
document.getElementById("addListItemBtn").addEventListener("click", addListItem);

// Image functionality
function handleImageUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  
  input.onchange = function(event) {
    const files = Array.from(event.target.files);
    files.forEach(processImage);
  };
  
  input.click();
}

function processImage(file) {
  if (!file.type.startsWith("image/")) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = {
      id: generateId(),
      data: e.target.result,
      name: file.name,
      size: file.size
    };
    
    if (!currentNote) {
      currentNote = {
        id: generateId(),
        title: "",
        content: "",
        categories: [],
        images: [],
        listItems: [],
        listType: "bulleted",
        password: "",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    
    if (!currentNote.images) {
      currentNote.images = [];
    }
    
    currentNote.images.push(imageData);
    updateImagesSection();
    saveCurrentNote();
  };
  
  reader.readAsDataURL(file);
}

function updateImagesSection() {
  const imagesSection = document.getElementById("imagesSection");
  const imageGrid = document.getElementById("imageGrid");
  
  if (!currentNote?.images || currentNote.images.length === 0) {
    imagesSection.classList.add("hidden");
    return;
  }
  
  imagesSection.classList.remove("hidden");
  
  imageGrid.innerHTML = currentNote.images.map((image, index) => `
    <div class="image-item">
      <img src="${image.data}" alt="${image.name}" />
      <button class="image-delete" onclick="deleteImage(${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join("");
}

function deleteImage(index) {
  if (!currentNote?.images) return;
  
  currentNote.images.splice(index, 1);
  updateImagesSection();
  saveCurrentNote();
}

// Delete modal
function showDeleteModal(note) {
  currentDeleteNote = note;
  document.getElementById("deleteModal").classList.add("show");
  
  if (note.password) {
    document.getElementById("deletePasswordContainer").classList.remove("hidden");
    document.getElementById("deletePasswordInput").focus();
  } else {
    document.getElementById("deletePasswordContainer").classList.add("hidden");
  }
}

function hideDeleteModal() {
  document.getElementById("deleteModal").classList.remove("show");
  currentDeleteNote = null;
}

function confirmDelete() {
  if (!currentDeleteNote) return;
  
  if (currentDeleteNote.password) {
    const enteredPassword = document.getElementById("deletePasswordInput").value;
    if (enteredPassword !== currentDeleteNote.password) {
      showToast(t("incorrectPassword"));
      return;
    }
  }
  
  confirmDeleteNote(currentDeleteNote.id);
  hideDeleteModal();
}

// Filter handling
function handleFilterClick(event) {
  if (event.target.classList.contains("chip")) {
    const filter = event.target.getAttribute("data-filter");
    currentFilter = filter;
    
    document.querySelectorAll(".chip").forEach(chip => chip.classList.remove("active"));
    event.target.classList.add("active");
    
    renderNotes();
  }
}

// Settings
function loadSettings() {
  const theme = localStorage.getItem("theme") || "system";
  const language = localStorage.getItem("language") || "en";
  
  document.getElementById("themeSelect").value = theme;
  document.getElementById("languageSelect").value = language;
  
  currentLanguage = language;
  applyTheme(theme);
}

function handleThemeChange(event) {
  const theme = event.target.value;
  localStorage.setItem("theme", theme);
  applyTheme(theme);
}

function handleLanguageChange(event) {
  const language = event.target.value;
  localStorage.setItem("language", language);
  currentLanguage = language;
  // Refresh UI with new language
  renderNotes();
}

function applyTheme(theme) {
  const root = document.documentElement;
  
  if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.style.setProperty("--background-color", "#1a1a1a");
    root.style.setProperty("--text-color", "#ffffff");
    root.style.setProperty("--text-muted", "#a0a0a0");
    root.style.setProperty("--border-color", "#333333");
    root.style.setProperty("--light-color", "#2a2a2a");
  } else {
    root.style.setProperty("--background-color", "#ffffff");
    root.style.setProperty("--text-color", "#212529");
    root.style.setProperty("--text-muted", "#6c757d");
    root.style.setProperty("--border-color", "#dee2e6");
    root.style.setProperty("--light-color", "#f8f9fa");
  }
}

// Global functions for inline event handlers
window.editNote = editNote;
window.deleteNote = deleteNote;
window.toggleNoteCategory = toggleNoteCategory;
window.toggleListItem = toggleListItem;
window.updateListItem = updateListItem;
window.deleteListItem = deleteListItem;
window.deleteImage = deleteImage;
window.selectUser = selectUser;
window.removeSelectedUser = removeSelectedUser;
window.showNameModal = showNameModal;
window.logoutUser = () => window.authFunctions?.signOutUser();
window.showUsernameModal = showUsernameModal;

// Utility functions
function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showToast(message, type = 'default') {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  
  toastMessage.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Export for window global
window.renderNotes = renderNotes;
window.renderCategories = renderCategories;
