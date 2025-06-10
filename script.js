// Notes App Main JavaScript
// Global variables
let notes = JSON.parse(localStorage.getItem("notes")) || [];
let categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }];
let currentNote = null;
let currentFilter = "all";
let currentListType = "bulleted";
let autoSaveTimeout = null; // Define autoSaveTimeout variable
let isAutoSave = false; // Flag to distinguish auto-save from manual save
// currentUser is managed by firebase-config.js
let sharedNoteListeners = new Map(); // Track Firebase listeners for shared notes
let isReceivingUpdate = false; // Prevent infinite loops during real-time updates
let collaborativeEditingEnabled = false;
let homePageSyncInterval = null; // Track home page sync interval

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
    
    // Initialize UI first
    setupEventListeners();
    loadSettings();
    
    // Listen for auth state changes and load data accordingly
    if (window.auth) {
      window.auth.onAuthStateChanged((user) => {
        window.currentUser = user;
        
        // Load data after auth state is determined
        if (user && !window.authFunctions.isUserGuest()) {
          // Authenticated user - data will be loaded by firebase-config
          // Wait for data to be loaded, then render
          const checkDataLoaded = () => {
            if (window.dataLoaded || notes.length > 0) {
              renderNotes();
              renderCategories();
              updateFilterChips();
            } else {
              setTimeout(checkDataLoaded, 50);
            }
          };
          setTimeout(checkDataLoaded, 100);
        } else {
          // Guest user - load local data
          loadLocalData();
          renderNotes();
          renderCategories();
          updateFilterChips();
        }
        
        updateShareButtonVisibility();
        updateSidebarAuth();
      });
    }
  });
}

function loadLocalData() {
  // Load notes from localStorage
  const savedNotes = localStorage.getItem("notes");
  if (savedNotes) {
    notes = JSON.parse(savedNotes);
  }
  
  // Load categories from localStorage
  const savedCategories = localStorage.getItem("categories");
  if (savedCategories) {
    categories = JSON.parse(savedCategories);
  }
  
  // Load settings from localStorage
  const savedFilter = localStorage.getItem("currentFilter");
  if (savedFilter) {
    currentFilter = savedFilter;
  }
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
  
  // Auto-save with debounce for regular editing
  function autoSaveWrapper() {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  }
  
  if (titleInput) titleInput.addEventListener("input", debounce(autoSaveWrapper, 500));
  if (contentTextarea) contentTextarea.addEventListener("input", debounce(autoSaveWrapper, 500));
  
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

  // Image upload
  const imageUpload = document.getElementById("imageUpload");
  if (imageUpload) imageUpload.addEventListener("change", processImageUpload);

  // Settings
  const themeSelect = document.getElementById("themeSelect");
  const languageSelect = document.getElementById("languageSelect");
  const editNameBtn = document.getElementById("editNameBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  if (themeSelect) themeSelect.addEventListener("change", handleThemeChange);
  if (languageSelect) languageSelect.addEventListener("change", handleLanguageChange);
  if (editNameBtn) editNameBtn.addEventListener("click", showNameModal);
  if (signOutBtn) signOutBtn.addEventListener("click", () => {
    if (window.authFunctions) {
      window.authFunctions.signOutUser();
    }
  });

  // Modals
  setupModalEventListeners();
}

function setupModalEventListeners() {
  // Share modal
  const shareModalClose = document.getElementById("shareModalClose");
  const sendInvitesBtn = document.getElementById("sendInvitesBtn");
  const cancelShareBtn = document.getElementById("cancelShareBtn");
  const userSearchInput = document.getElementById("userSearchInput");

  if (shareModalClose) shareModalClose.addEventListener("click", hideShareModal);
  if (sendInvitesBtn) sendInvitesBtn.addEventListener("click", sendInvitations);
  if (cancelShareBtn) cancelShareBtn.addEventListener("click", hideShareModal);
  if (userSearchInput) {
    userSearchInput.addEventListener("input", debounce((e) => searchUsers(e.target.value), 300));
    userSearchInput.addEventListener("focus", () => {
      if (userSearchInput.value.length >= 2) {
        searchUsers(userSearchInput.value);
      }
    });
  }

  // Username modal
  const saveUsernameBtn = document.getElementById("saveUsernameBtn");
  if (saveUsernameBtn) saveUsernameBtn.addEventListener("click", saveUsername);

  // Name modal
  const nameModalClose = document.getElementById("nameModalClose");
  const saveNameBtn = document.getElementById("saveNameBtn");
  const cancelNameBtn = document.getElementById("cancelNameBtn");

  if (nameModalClose) nameModalClose.addEventListener("click", hideNameModal);
  if (saveNameBtn) saveNameBtn.addEventListener("click", saveName);
  if (cancelNameBtn) cancelNameBtn.addEventListener("click", hideNameModal);

  // Category modal
  const categoryModalClose = document.getElementById("categoryModalClose");
  const saveCategoriesBtn = document.getElementById("saveCategoriesBtn");

  if (categoryModalClose) categoryModalClose.addEventListener("click", hideCategoryModal);
  if (saveCategoriesBtn) saveCategoriesBtn.addEventListener("click", saveNoteCategories);

  // Password modal
  const passwordModalClose = document.getElementById("passwordModalClose");
  const savePasswordBtn = document.getElementById("savePasswordBtn");
  const removePasswordBtn = document.getElementById("removePasswordBtn");

  if (passwordModalClose) passwordModalClose.addEventListener("click", hidePasswordModal);
  if (savePasswordBtn) savePasswordBtn.addEventListener("click", savePassword);
  if (removePasswordBtn) removePasswordBtn.addEventListener("click", removePassword);

  // List type modal
  const listTypeModalClose = document.getElementById("listTypeModalClose");
  if (listTypeModalClose) listTypeModalClose.addEventListener("click", hideListTypeModal);

  const listTypeBtns = document.querySelectorAll(".list-type-btn");
  listTypeBtns.forEach(btn => {
    btn.addEventListener("click", selectListType);
  });

  // Delete modal
  const deleteModalClose = document.getElementById("deleteModalClose");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

  if (deleteModalClose) deleteModalClose.addEventListener("click", hideDeleteModal);
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDelete);
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", hideDeleteModal);

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
    if (navSignIn) navSignIn.classList.add("hidden");
    if (navSignOut) navSignOut.classList.remove("hidden");
  } else {
    if (navSignIn) navSignIn.classList.remove("hidden");
    if (navSignOut) navSignOut.classList.add("hidden");
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
    list: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  showEditorPage();
  updateEditorContent();
}

function editNote(note) {
  if (note.password) {
    verifyNotePassword(note);
    return;
  }
  
  currentNote = note;
  showEditorPage();
  updateEditorContent();
}

function verifyNotePassword(note) {
  const password = prompt("Enter note password:");
  if (password === note.password) {
    currentNote = note;
    showEditorPage();
    updateEditorContent();
  } else {
    showToast(t("incorrectPassword"), "error");
  }
}

function saveCurrentNote() {
  if (!currentNote || isReceivingUpdate) return; // Don't save during real-time updates
  
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  if (titleInput) currentNote.title = titleInput.value;
  if (contentTextarea) currentNote.content = contentTextarea.value;
  
  // Save the current list type with the note
  if (currentNote.list && currentNote.list.length > 0) {
    currentNote.listType = currentListType;
  }
  
  currentNote.updatedAt = Date.now();
  
  if (currentNote.isShared && currentNote.sharedId) {
    console.log("Saving shared note:", currentNote.sharedId);
    saveSharedNote();
  } else {
    console.log("Saving local note:", currentNote.id);
    saveLocalNote();
  }
}

function saveLocalNote() {
  const existingIndex = notes.findIndex(n => n.id === currentNote.id);
  
  if (existingIndex >= 0) {
    notes[existingIndex] = currentNote;
    // Only show toast for manual saves, not auto-saves
    if (!isAutoSave && !collaborativeEditingEnabled) {
      showToast(t("noteUpdated"), "success");
    }
  } else {
    notes.push(currentNote);
    if (!isAutoSave && !collaborativeEditingEnabled) {
      showToast(t("noteAdded"), "success");
    }
  }
  
  localStorage.setItem("notes", JSON.stringify(notes));
  
  // Save to Firebase if user is authenticated
  if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
    window.authFunctions.saveUserData();
  }
}

function saveSharedNote() {
  if (!currentNote.sharedId) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (currentUser && window.authFunctions?.updateSharedNote) {
    try {
      window.authFunctions.updateSharedNote(currentNote.sharedId, {
        title: currentNote.title,
        content: currentNote.content,
        categories: currentNote.categories || [],
        images: currentNote.images || [],
        list: currentNote.list || []
      });
      
      // Also update local note
      const existingIndex = notes.findIndex(n => n.id === currentNote.id);
      if (existingIndex >= 0) {
        notes[existingIndex] = currentNote;
        localStorage.setItem("notes", JSON.stringify(notes));
      }
    } catch (error) {
      console.error("Error saving shared note:", error);
    }
  }
}

function deleteNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (note && note.password) {
    showDeleteModal(note);
  } else {
    confirmDeleteNote(noteId);
  }
}

function confirmDeleteNote(noteId) {
  notes = notes.filter(n => n.id !== noteId);
  localStorage.setItem("notes", JSON.stringify(notes));
  
  if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
    window.authFunctions.saveUserData();
  }
  
  showToast(t("noteDeleted"), "success");
  showNotesPage();
  renderNotes();
}

// Rendering functions
function renderNotes() {
  const notesContainer = document.getElementById("notesContainer");
  if (!notesContainer) return;

  let filteredNotes = notes;
  if (currentFilter === "shared") {
    // Show notes that have collaborators (shared notes)
    filteredNotes = notes.filter(note => 
      note.sharedId || (note.collaborators && Object.keys(note.collaborators).length > 0)
    );
  } else if (currentFilter !== "all") {
    filteredNotes = notes.filter(note => 
      note.categories && note.categories.includes(currentFilter)
    );
  }

  if (filteredNotes.length === 0) {
    const emptyMessage = currentFilter === "shared" 
      ? { icon: "fas fa-users", title: "No shared notes", text: "Notes shared with others will appear here" }
      : { icon: "fas fa-sticky-note", title: "No notes yet", text: "Tap the + button to create your first note" };
    
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="${emptyMessage.icon}"></i>
        <h3>${emptyMessage.title}</h3>
        <p>${emptyMessage.text}</p>
      </div>
    `;
    return;
  }
  
  notesContainer.innerHTML = `
    <div class="notes-grid">
      ${filteredNotes.map(note => {
        const preview = note.content ? (note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content) : "No content";
        const dateStr = formatDate(note.updatedAt || note.createdAt || Date.now());
        
        const categoryTags = note.categories?.map(catId => {
          const category = categories.find(c => c.id === catId);
          return category ? `<span class="category-chip">${category.name}</span>` : "";
        }).join("") || "";

        const isShared = note.sharedId || (note.collaborators && Object.keys(note.collaborators).length > 0);
        const collaboratorCount = note.collaborators ? Object.keys(note.collaborators).length : 0;

        return `
          <div class="note-card" onclick="editNote(notes.find(n => n.id === '${note.id}'))">
            <div class="note-title">
              ${note.title || "Untitled"}
              ${isShared ? `<i class="fas fa-users share-icon" title="Shared with ${collaboratorCount} people"></i>` : ""}
            </div>
            <div class="note-preview">${preview}</div>
            <div class="note-meta">
              <span>${dateStr}</span>
              ${note.categories && note.categories.length > 0 ? `<span>${note.categories.length} categories</span>` : ""}
              ${isShared ? `<span class="shared-indicator"><i class="fas fa-share-alt"></i> Shared</span>` : ""}
            </div>
            ${categoryTags ? `<div class="category-chips">${categoryTags}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderCategories() {
  updateFilterChips();
}

function updateFilterChips() {
  const filterChips = document.getElementById("filterChips");
  if (!filterChips) return;
  
  // Always include "All" and "Shared" filters
  let chips = [
    { id: 'all', name: 'All' },
    { id: 'shared', name: 'Shared' }
  ];
  
  // Add category filters (excluding "All" to avoid duplication)
  const categoryFilters = categories.filter(cat => cat.id !== 'all');
  chips = chips.concat(categoryFilters);
  
  filterChips.innerHTML = chips.map(chip => `
    <button class="filter-chip ${currentFilter === chip.id ? 'active' : ''}" 
            data-filter="${chip.id}">
      ${chip.name}
    </button>
  `).join("");
  
  // Add event listeners to filter chips
  filterChips.querySelectorAll('.filter-chip').forEach(chipEl => {
    chipEl.addEventListener('click', (e) => {
      currentFilter = e.target.dataset.filter;
      localStorage.setItem("currentFilter", currentFilter);
      
      // Update active state
      filterChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      
      renderNotes();
    });
  });
}

// UI functions
function showNotesPage() {
  // Clean up any active collaborative editing listeners
  if (currentNote && currentNote.isShared && currentNote.sharedId) {
    cleanupRealtimeCollaboration(currentNote.sharedId);
  }
  
  // Save current note before leaving editor
  if (currentNote) {
    // Don't set isAutoSave for manual save when leaving editor
    saveCurrentNote();
    
    // Show toast notification for manual save when leaving editor
    if (currentNote.isShared) {
      showToast("Shared note saved", "success");
    } else {
      showToast("Note saved", "success");
    }
  }
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const notesPage = document.getElementById("notesPage");
  if (notesPage) notesPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "NOTES";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.add("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.remove("hidden");
  
  // Force refresh the notes view to show latest changes
  setTimeout(() => {
    renderNotes();
    updateFilterChips();
  }, 100);
  
  // Setup real-time sync for home page to show shared note updates
  setupHomePageSync();
}

function showEditorPage() {
  // Clean up home page sync when leaving notes page
  cleanupHomePageSync();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const editorPage = document.getElementById("editorPage");
  if (editorPage) editorPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "EDIT NOTE";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  // Setup real-time collaboration if note is shared
  if (currentNote && currentNote.isShared && currentNote.sharedId) {
    setupRealtimeCollaboration(currentNote.sharedId);
  }
}

function showSettingsPage() {
  // Clean up home page sync when leaving notes page
  cleanupHomePageSync();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) settingsPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "SETTINGS";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  updateSettingsContent();
}

function updateEditorContent() {
  if (!currentNote) return;
  
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  const dateInfo = document.getElementById("dateInfo");
  
  if (titleInput) titleInput.value = currentNote.title || "";
  if (contentTextarea) contentTextarea.value = currentNote.content || "";
  if (dateInfo) {
    const created = formatDate(currentNote.createdAt);
    const updated = formatDate(currentNote.updatedAt);
    dateInfo.textContent = `Created: ${created} | Updated: ${updated}`;
  }
  
  // Restore the list type if the note has one saved
  if (currentNote.listType) {
    currentListType = currentNote.listType;
  } else if (currentNote.list && currentNote.list.length > 0) {
    // Auto-detect list type if not saved - check if any items have completed property
    const hasCheckboxes = currentNote.list.some(item => item.hasOwnProperty('completed'));
    currentListType = hasCheckboxes ? 'checklist' : 'bulleted';
    currentNote.listType = currentListType; // Save for future
  }
  
  updateCategoryChips();
  updateShareButtonVisibility();
  updateListSection();
  updateImagesSection();
  updatePasswordButton();
}

function updateCategoryChips() {
  const categoryChips = document.getElementById("categoryChips");
  if (!categoryChips || !currentNote) return;
  
  categoryChips.innerHTML = "";
  
  if (currentNote.categories) {
    currentNote.categories.forEach(categoryId => {
      const category = categories.find(c => c.id === categoryId);
      if (category) {
        const chip = document.createElement("span");
        chip.className = "category-chip selected";
        chip.innerHTML = `
          ${category.name}
          <i class="fas fa-times" onclick="toggleNoteCategory('${categoryId}')"></i>
        `;
        categoryChips.appendChild(chip);
      }
    });
  }
}

function updateShareButtonVisibility() {
  const shareBtn = document.getElementById("shareBtn");
  if (!shareBtn) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  if (currentUser && !isGuest) {
    shareBtn.style.display = "flex";
    shareBtn.classList.remove("hidden");
  } else {
    shareBtn.style.display = "flex";
    shareBtn.classList.add("disabled");
    shareBtn.title = "Sign in to share notes";
  }
}

function updateSettingsContent() {
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  const userSettings = document.getElementById("userSettings");
  const userNameDisplay = document.getElementById("userNameDisplay");
  const userEmailDisplay = document.getElementById("userEmailDisplay");
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  
  if (currentUser && !isGuest) {
    if (userSettings) userSettings.style.display = "flex";
    if (userNameDisplay) userNameDisplay.textContent = currentUser.displayName || "No name";
    if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email;
    if (signInBtn) signInBtn.style.display = "none";
    if (signOutBtn) signOutBtn.style.display = "block";
  } else {
    if (userSettings) userSettings.style.display = "none";
    if (signInBtn) signInBtn.style.display = "block";
    if (signOutBtn) signOutBtn.style.display = "none";
  }
}

// Modal functions
function showShareModal() {
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  if (isGuest || !currentUser) {
    showToast("Sign in required to share notes", "warning");
    return;
  }
  
  const shareModal = document.getElementById("shareModal");
  if (shareModal) {
    shareModal.classList.add("show");
    
    // Load current collaborators
    loadCurrentCollaborators();
    
    // Clear previous selections
    const selectedUsers = document.getElementById("selectedUsers");
    const searchResults = document.getElementById("searchResults");
    const userSearchInput = document.getElementById("userSearchInput");
    const sendBtn = document.getElementById("sendInvitesBtn");
    
    if (selectedUsers) selectedUsers.innerHTML = "";
    if (searchResults) searchResults.classList.remove("show");
    if (userSearchInput) userSearchInput.value = "";
    if (sendBtn) sendBtn.disabled = true;
  }
}

function hideShareModal() {
  const shareModal = document.getElementById("shareModal");
  if (shareModal) shareModal.classList.remove("show");
}

function showCategoryModal() {
  const categoryModal = document.getElementById("categoryModal");
  if (categoryModal) categoryModal.classList.add("show");
  renderModalCategories();
}

function hideCategoryModal() {
  const categoryModal = document.getElementById("categoryModal");
  if (categoryModal) categoryModal.classList.remove("show");
}

function showPasswordModal() {
  const passwordModal = document.getElementById("passwordModal");
  if (passwordModal) passwordModal.classList.add("show");
  updatePasswordButton();
}

function hidePasswordModal() {
  const passwordModal = document.getElementById("passwordModal");
  if (passwordModal) passwordModal.classList.remove("show");
}

function showListTypeModal() {
  const listTypeModal = document.getElementById("listTypeModal");
  if (listTypeModal) listTypeModal.classList.add("show");
}

function hideListTypeModal() {
  const listTypeModal = document.getElementById("listTypeModal");
  if (listTypeModal) listTypeModal.classList.remove("show");
}

function showDeleteModal(note) {
  const deleteModal = document.getElementById("deleteModal");
  if (deleteModal) deleteModal.classList.add("show");
  
  const deletePasswordContainer = document.getElementById("deletePasswordContainer");
  if (note.password && deletePasswordContainer) {
    deletePasswordContainer.classList.remove("hidden");
  } else if (deletePasswordContainer) {
    deletePasswordContainer.classList.add("hidden");
  }
}

function hideDeleteModal() {
  const deleteModal = document.getElementById("deleteModal");
  if (deleteModal) deleteModal.classList.remove("show");
}

function showUsernameModal() {
  const usernameModal = document.getElementById("usernameModal");
  if (usernameModal) usernameModal.classList.add("show");
}

function hideUsernameModal() {
  const usernameModal = document.getElementById("usernameModal");
  if (usernameModal) usernameModal.classList.remove("show");
}

function showNameModal() {
  const nameModal = document.getElementById("nameModal");
  if (nameModal) nameModal.classList.add("show");
}

function hideNameModal() {
  const nameModal = document.getElementById("nameModal");
  if (nameModal) nameModal.classList.remove("show");
}

// Modal action functions
function renderModalCategories() {
  const modalCategories = document.getElementById("modalCategories");
  if (!modalCategories) return;
  
  modalCategories.innerHTML = categories.filter(c => c.id !== "all").map(category => `
    <div class="modal-category-item ${currentNote?.categories?.includes(category.id) ? 'selected' : ''}" 
         onclick="toggleNoteCategory('${category.id}')">
      <input type="checkbox" ${currentNote?.categories?.includes(category.id) ? 'checked' : ''} />
      <span>${category.name}</span>
    </div>
  `).join("");
}

function toggleNoteCategory(categoryId) {
  if (!currentNote) return;
  
  if (!currentNote.categories) currentNote.categories = [];
  
  const index = currentNote.categories.indexOf(categoryId);
  if (index >= 0) {
    currentNote.categories.splice(index, 1);
  } else {
    currentNote.categories.push(categoryId);
  }
  
  renderModalCategories();
  updateCategoryChips();
  saveCurrentNote();
}

function saveNoteCategories() {
  hideCategoryModal();
  updateCategoryChips();
  saveCurrentNote();
}

function savePassword() {
  const passwordInput = document.getElementById("notePasswordInput");
  if (!passwordInput || !currentNote) return;
  
  const password = passwordInput.value.trim();
  if (password) {
    currentNote.password = password;
    saveCurrentNote();
    hidePasswordModal();
    showToast(t("passwordSet"), "success");
    updatePasswordButton();
  }
}

function removePassword() {
  if (!currentNote) return;
  
  delete currentNote.password;
  saveCurrentNote();
  hidePasswordModal();
  showToast(t("passwordRemoved"), "success");
  updatePasswordButton();
}

function updatePasswordButton() {
  const passwordIcon = document.getElementById("passwordIcon");
  if (!passwordIcon || !currentNote) return;
  
  if (currentNote.password) {
    passwordIcon.className = "fas fa-lock";
  } else {
    passwordIcon.className = "fas fa-unlock";
  }
}

function selectListType(event) {
  const listType = event.target.closest('.list-type-btn').dataset.type;
  hideListTypeModal();
  
  // Create a new list section with the selected type
  if (!currentNote.listSections) currentNote.listSections = [];
  
  const newListSection = {
    id: generateId(),
    type: listType,
    items: [{ text: "", completed: false }]
  };
  
  currentNote.listSections.push(newListSection);
  
  const listSection = document.getElementById("listSection");
  if (listSection) listSection.classList.remove("hidden");
  
  updateListSection();
  saveCurrentNote();
}

function updateListSection() {
  const listItems = document.getElementById("listItems");
  if (!listItems || !currentNote) return;
  
  // Handle migration from old single list to new multiple list sections
  if (currentNote.list && !currentNote.listSections) {
    currentNote.listSections = [{
      id: generateId(),
      type: currentNote.listType || 'bulleted',
      items: currentNote.list
    }];
    delete currentNote.list;
    delete currentNote.listType;
  }
  
  if (!currentNote.listSections) currentNote.listSections = [];
  
  listItems.innerHTML = currentNote.listSections.map((section, sectionIndex) => `
    <div class="list-section" data-section-id="${section.id}">
      <div class="list-section-header">
        <span class="list-type-label">${section.type === 'checklist' ? 'Checklist' : 'Bulleted List'}</span>
        <button class="btn-icon" onclick="deleteListSection('${section.id}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${section.items.map((item, itemIndex) => `
        <div class="list-item ${item.completed ? 'completed' : ''}">
          ${section.type === 'checklist' ? `<input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleListItemInSection('${section.id}', ${itemIndex})" />` : ''}
          <input type="text" value="${item.text || ''}" onchange="updateListItemInSection('${section.id}', ${itemIndex}, this.value)" />
          <button class="btn-icon" onclick="deleteListItemInSection('${section.id}', ${itemIndex})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `).join("")}
      <div class="list-item">
        <button class="btn-icon" onclick="addListItemToSection('${section.id}')">
          <i class="fas fa-plus"></i>
        </button>
        <span>Add item</span>
      </div>
    </div>
  `).join("");
}

function addListItemToSection(sectionId) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section) return;
  
  section.items.push({
    text: "",
    completed: false
  });
  
  updateListSection();
  
  // Use collaborative auto-save for shared notes
  if (currentNote.isShared && collaborativeEditingEnabled) {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  } else {
    saveCurrentNote();
  }
}

function updateListItemInSection(sectionId, itemIndex, value) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section?.items?.[itemIndex]) return;
  
  section.items[itemIndex].text = value;
  
  // Use collaborative auto-save for shared notes
  if (currentNote.isShared && collaborativeEditingEnabled) {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  } else {
    saveCurrentNote();
  }
}

function toggleListItemInSection(sectionId, itemIndex) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section?.items?.[itemIndex]) return;
  
  section.items[itemIndex].completed = !section.items[itemIndex].completed;
  updateListSection();
  
  // Use collaborative auto-save for shared notes
  if (currentNote.isShared && collaborativeEditingEnabled) {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  } else {
    saveCurrentNote();
  }
}

function deleteListItemInSection(sectionId, itemIndex) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section?.items) return;
  
  section.items.splice(itemIndex, 1);
  
  // Remove section if no items left
  if (section.items.length === 0) {
    deleteListSection(sectionId);
    return;
  }
  
  updateListSection();
  
  // Use collaborative auto-save for shared notes
  if (currentNote.isShared && collaborativeEditingEnabled) {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  } else {
    saveCurrentNote();
  }
}

function deleteListSection(sectionId) {
  if (!currentNote?.listSections) return;
  
  const sectionIndex = currentNote.listSections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1) return;
  
  currentNote.listSections.splice(sectionIndex, 1);
  updateListSection();
  
  // Use collaborative auto-save for shared notes
  if (currentNote.isShared && collaborativeEditingEnabled) {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  } else {
    saveCurrentNote();
  }
}

// Legacy functions for backward compatibility
function addListItem() {
  // If no sections exist, create a bulleted list section
  if (!currentNote.listSections || currentNote.listSections.length === 0) {
    selectListType({ target: { closest: () => ({ dataset: { type: 'bulleted' } }) } });
    return;
  }
  
  // Add to the last section
  const lastSection = currentNote.listSections[currentNote.listSections.length - 1];
  addListItemToSection(lastSection.id);
}

function updateListItem(index, value) {
  // Legacy support - use first section
  if (currentNote.listSections?.[0]) {
    updateListItemInSection(currentNote.listSections[0].id, index, value);
  }
}

function toggleListItem(index) {
  // Legacy support - use first section
  if (currentNote.listSections?.[0]) {
    toggleListItemInSection(currentNote.listSections[0].id, index);
  }
}

function deleteListItem(index) {
  // Legacy support - use first section
  if (currentNote.listSections?.[0]) {
    deleteListItemInSection(currentNote.listSections[0].id, index);
  }
}

function confirmDelete() {
  if (!currentNote) return;
  
  const deletePasswordInput = document.getElementById("deletePasswordInput");
  if (currentNote.password && deletePasswordInput) {
    const password = deletePasswordInput.value;
    if (password !== currentNote.password) {
      showToast(t("incorrectPassword"), "error");
      return;
    }
  }
  
  confirmDeleteNote(currentNote.id);
  hideDeleteModal();
}

// Image handling
function handleImageUpload() {
  const imageUpload = document.getElementById("imageUpload");
  if (imageUpload) imageUpload.click();
}

function processImageUpload(event) {
  const files = event.target.files;
  if (!files || !currentNote) return;
  
  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!currentNote.images) currentNote.images = [];
        currentNote.images.push({
          name: file.name,
          data: e.target.result
        });
        updateImagesSection();
        saveCurrentNote();
      };
      reader.readAsDataURL(file);
    }
  });
}

function updateImagesSection() {
  const imagesSection = document.getElementById("imagesSection");
  const imageGrid = document.getElementById("imageGrid");
  
  if (!currentNote?.images || currentNote.images.length === 0) {
    if (imagesSection) imagesSection.classList.add("hidden");
    return;
  }
  
  if (imagesSection) imagesSection.classList.remove("hidden");
  
  if (imageGrid) {
    imageGrid.innerHTML = currentNote.images.map((image, index) => `
      <div class="image-item">
        <img src="${image.data}" alt="${image.name}" />
        <button class="image-delete" onclick="deleteImage(${index})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join("");
  }
}

function deleteImage(index) {
  if (!currentNote?.images) return;
  
  currentNote.images.splice(index, 1);
  updateImagesSection();
  saveCurrentNote();
}

// Collaborator functions
async function loadCurrentCollaborators() {
  const currentCollaborators = document.getElementById("currentCollaborators");
  if (!currentCollaborators || !currentNote) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;
  
  try {
    // Show current user as owner
    const collaborators = [];
    
    // Add current user as owner
    collaborators.push({
      uid: currentUser.uid,
      name: currentUser.displayName || currentUser.email.split('@')[0],
      email: currentUser.email,
      role: 'owner'
    });
    
    // If note is shared, load collaborators from shared note
    if (currentNote.isShared && currentNote.sharedId && window.database) {
      const sharedNoteRef = window.database.ref(`sharedNotes/${currentNote.sharedId}`);
      const snapshot = await sharedNoteRef.once('value');
      const sharedNote = snapshot.val();
      
      if (sharedNote && sharedNote.collaborators) {
        // Get user details for each collaborator
        for (const [uid, collab] of Object.entries(sharedNote.collaborators)) {
          if (uid !== currentUser.uid) {
            const userRef = window.database.ref(`users/${uid}`);
            const userSnapshot = await userRef.once('value');
            const userData = userSnapshot.val();
            
            if (userData) {
              collaborators.push({
                uid: uid,
                name: userData.name || userData.displayName || userData.email.split('@')[0],
                email: userData.email,
                role: collab.role || 'editor'
              });
            }
          }
        }
      }
    }
    
    // Render collaborators
    renderCollaborators(collaborators);
    
  } catch (error) {
    console.error("Error loading collaborators:", error);
    currentCollaborators.innerHTML = "<div class='collaborator-item'>Error loading collaborators</div>";
  }
}

function renderCollaborators(collaborators) {
  const currentCollaborators = document.getElementById("currentCollaborators");
  if (!currentCollaborators) return;
  
  if (collaborators.length === 0) {
    currentCollaborators.innerHTML = "<div class='collaborator-item'>Only you have access</div>";
    return;
  }
  
  currentCollaborators.innerHTML = collaborators.map(collaborator => {
    const initials = collaborator.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    
    return `
      <div class="collaborator-item">
        <div class="collaborator-info">
          <div class="collaborator-avatar">${initials}</div>
          <div class="collaborator-details">
            <div class="collaborator-name">${escapeHtml(collaborator.name)}</div>
            <div class="collaborator-email">${escapeHtml(collaborator.email)}</div>
          </div>
        </div>
        <div class="collaborator-role ${collaborator.role}">${collaborator.role}</div>
      </div>
    `;
  }).join("");
}

// Sharing functions
async function searchUsers(query) {
  const searchResults = document.getElementById("searchResults");
  if (!searchResults) {
    console.log("Search results element not found");
    return;
  }
  
  console.log("Searching for users with query:", query);
  
  if (query.length < 2) {
    searchResults.classList.remove("show");
    return;
  }
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser || !window.database) {
    console.log("No current user or database");
    searchResults.innerHTML = "<div class='user-search-item'>Sign in required</div>";
    searchResults.classList.add("show");
    return;
  }
  
  try {
    console.log("Starting database search...");
    
    // Search for users by username, name, and email
    const usersRef = window.database.ref('users');
    const snapshot = await usersRef.once('value');
    
    console.log("Database snapshot received:", snapshot.exists());
    
    const users = [];
    const queryLower = query.toLowerCase();
    let totalUsers = 0;
    
    snapshot.forEach(childSnapshot => {
      totalUsers++;
      const userData = childSnapshot.val();
      console.log(`User ${totalUsers}:`, userData);
      
      if (userData.uid !== currentUser.uid && userData.username) {
        const matchesUsername = userData.username && userData.username.toLowerCase().includes(queryLower);
        const matchesName = userData.name && userData.name.toLowerCase().includes(queryLower);
        const matchesEmail = userData.email && userData.email.toLowerCase().includes(queryLower);
        
        if (matchesUsername || matchesName || matchesEmail) {
          console.log("Found matching user:", userData);
          users.push({
            uid: childSnapshot.key,
            username: userData.username,
            name: userData.name || userData.displayName || userData.email.split('@')[0],
            email: userData.email
          });
        }
      }
    });
    
    console.log(`Searched ${totalUsers} users, found ${users.length} matches`);
    
    // Sort by relevance (exact matches first, then partial matches)
    users.sort((a, b) => {
      const aExact = a.username.toLowerCase() === queryLower || a.name.toLowerCase() === queryLower;
      const bExact = b.username.toLowerCase() === queryLower || b.name.toLowerCase() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });
    
    if (users.length === 0) {
      searchResults.innerHTML = "<div class='user-search-item'>No users found</div>";
    } else {
      console.log("Rendering users to UI:", users);
      searchResults.innerHTML = users.map(user => `
        <div class="user-search-item" onclick="selectUser('${user.uid}', '${escapeHtml(user.name)}', '${escapeHtml(user.username)}')">
          <div class="user-info">
            <div class="user-name">${escapeHtml(user.name)}</div>
            <div class="user-username">@${escapeHtml(user.username)}</div>
            <div class="user-email">${escapeHtml(user.email)}</div>
          </div>
        </div>
      `).join("");
      console.log("Search results HTML set:", searchResults.innerHTML);
    }
    
    searchResults.classList.add("show");
    console.log("Search results classes:", searchResults.className);
  } catch (error) {
    console.error("Error searching users:", error);
    searchResults.innerHTML = "<div class='user-search-item'>Error searching users</div>";
  }
}

async function sendInvitations() {
  if (!currentNote || !window.database) return;
  
  const selectedUsers = document.getElementById("selectedUsers");
  const userElements = selectedUsers?.querySelectorAll("[data-uid]");
  
  if (!userElements || userElements.length === 0) {
    showToast("Select users to share with", "warning");
    return;
  }
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;
  
  try {
    console.log("Starting invitation process...");
    console.log("Current note:", currentNote);
    console.log("Selected users:", userElements.length);
    
    // Create shared note
    const sharedId = generateId();
    console.log("Generated shared ID:", sharedId);
    
    const sharedNoteData = {
      id: sharedId,
      title: currentNote.title || "Untitled Note",
      content: currentNote.content || "",
      categories: currentNote.categories || [],
      images: currentNote.images || [],
      list: currentNote.list || [],
      createdAt: currentNote.createdAt || Date.now(),
      updatedAt: Date.now(),
      owner: currentUser.uid,
      collaborators: {}
    };
    
    // Add owner as collaborator
    sharedNoteData.collaborators[currentUser.uid] = {
      role: 'owner',
      joinedAt: Date.now()
    };
    
    console.log("Shared note data:", sharedNoteData);
    
    // Save shared note
    await window.database.ref(`sharedNotes/${sharedId}`).set(sharedNoteData);
    console.log("Shared note saved to database");
    
    // Send invitations to selected users
    const invitations = [];
    userElements.forEach(element => {
      const uid = element.dataset.uid;
      const userName = element.querySelector('.user-name')?.textContent || 'Unknown';
      const invitationId = generateId();
      
      const invitation = {
        id: invitationId,
        sharedId: sharedId,
        from: currentUser.uid,
        fromName: currentUser.displayName || currentUser.email.split('@')[0],
        to: uid,
        toName: userName,
        noteTitle: currentNote.title || "Untitled Note",
        createdAt: Date.now(),
        status: 'pending'
      };
      
      invitations.push(invitation);
      console.log("Created invitation:", invitation);
    });
    
    console.log("Total invitations to send:", invitations.length);
    
    // Save invitations
    const invitationsRef = window.database.ref('invitations');
    for (const invitation of invitations) {
      await invitationsRef.child(invitation.id).set(invitation);
      console.log("Saved invitation to database:", invitation.id);
    }
    
    // Mark current note as shared and add collaborators data
    currentNote.isShared = true;
    currentNote.sharedId = sharedId;
    currentNote.collaborators = sharedNoteData.collaborators;
    saveCurrentNote();
    console.log("Note marked as shared and saved");
    
    // Also update the note in the notes array to reflect shared status
    const noteIndex = notes.findIndex(n => n.id === currentNote.id);
    if (noteIndex !== -1) {
      notes[noteIndex].isShared = true;
      notes[noteIndex].sharedId = sharedId;
      notes[noteIndex].collaborators = sharedNoteData.collaborators;
      localStorage.setItem("notes", JSON.stringify(notes));
      
      // Save to Firebase if user is authenticated
      if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
        window.authFunctions.saveUserData();
      }
    }
    
    showToast(`Sent ${invitations.length} invitation(s)`, "success");
    hideShareModal();
    
  } catch (error) {
    console.error("Error sending invitations:", error);
    showToast("Error sharing note", "error");
  }
}

function selectUser(uid, name, username) {
  const selectedUsers = document.getElementById("selectedUsers");
  if (!selectedUsers) return;
  
  // Check if user is already selected
  if (selectedUsers.querySelector(`[data-uid="${uid}"]`)) return;
  
  const userElement = document.createElement("div");
  userElement.className = "selected-user";
  userElement.dataset.uid = uid;
  userElement.innerHTML = `
    <div class="user-info">
      <div class="user-name">${name}</div>
      <div class="user-username">@${username}</div>
    </div>
    <button class="remove-user" onclick="removeSelectedUser('${uid}')">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  selectedUsers.appendChild(userElement);
  
  // Enable send button if users are selected
  const sendBtn = document.getElementById("sendInvitesBtn");
  if (sendBtn) sendBtn.disabled = false;
  
  // Clear search
  const searchInput = document.getElementById("userSearchInput");
  const searchResults = document.getElementById("searchResults");
  if (searchInput) searchInput.value = "";
  if (searchResults) searchResults.classList.remove("show");
}

function removeSelectedUser(uid) {
  const selectedUsers = document.getElementById("selectedUsers");
  const userElement = selectedUsers?.querySelector(`[data-uid="${uid}"]`);
  
  if (userElement) {
    userElement.remove();
    
    // Disable send button if no users selected
    const remainingUsers = selectedUsers.querySelectorAll("[data-uid]");
    const sendBtn = document.getElementById("sendInvitesBtn");
    if (sendBtn && remainingUsers.length === 0) {
      sendBtn.disabled = true;
    }
  }
}

async function saveUsername() {
  const usernameInput = document.getElementById("usernameInput");
  if (!usernameInput) return;
  
  const username = usernameInput.value.trim();
  if (!validateUsername(username)) {
    showToast("Username must be 4-20 characters, letters, numbers, and _ only", "error");
    return;
  }
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser || !window.database) return;
  
  try {
    // Save username to Firebase
    await window.database.ref(`users/${currentUser.uid}`).update({
      username: username,
      name: currentUser.displayName || currentUser.email.split('@')[0],
      email: currentUser.email,
      uid: currentUser.uid,
      updatedAt: Date.now()
    });
    
    // Save username to localStorage to prevent future prompts
    localStorage.setItem(`username_${currentUser.uid}`, username);
    
    hideUsernameModal();
    showToast("Username saved successfully", "success");
  } catch (error) {
    console.error("Error saving username:", error);
    showToast("Error saving username", "error");
  }
}

function validateUsername(username) {
  return username.length >= 4 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
}

async function saveName() {
  const nameInput = document.getElementById("nameInput");
  if (!nameInput) return;
  
  const name = nameInput.value.trim();
  if (name && window.authFunctions?.updateUserName) {
    try {
      await window.authFunctions.updateUserName(name);
      hideNameModal();
      updateSettingsContent();
    } catch (error) {
      showToast("Error updating name", "error");
    }
  }
}

// Settings functions
function loadSettings() {
  const theme = localStorage.getItem("theme") || "system";
  const language = localStorage.getItem("language") || "en";
  
  const themeSelect = document.getElementById("themeSelect");
  const languageSelect = document.getElementById("languageSelect");
  
  if (themeSelect) themeSelect.value = theme;
  if (languageSelect) languageSelect.value = language;
  
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
  document.documentElement.setAttribute("data-theme", theme);
}

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

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'default') {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  
  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }
}

// Global functions for inline event handlers
window.editNote = editNote;
window.toggleNoteCategory = toggleNoteCategory;
window.toggleListItem = toggleListItem;
window.updateListItem = updateListItem;
window.deleteListItem = deleteListItem;
window.addListItemToSection = addListItemToSection;
window.updateListItemInSection = updateListItemInSection;
window.toggleListItemInSection = toggleListItemInSection;
window.deleteListItemInSection = deleteListItemInSection;
window.deleteListSection = deleteListSection;
window.deleteImage = deleteImage;
window.selectUser = selectUser;
window.removeSelectedUser = removeSelectedUser;
window.showUsernameModal = showUsernameModal;

// Real-time collaborative editing functions
function setupRealtimeCollaboration(sharedId) {
  if (!window.database || !sharedId) return;
  
  // Remove existing listener if any
  cleanupRealtimeCollaboration(sharedId);
  
  const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
  
  // Listen for changes to the shared note
  const listener = sharedNoteRef.on('value', (snapshot) => {
    if (isReceivingUpdate) return; // Prevent infinite loops
    
    const sharedNote = snapshot.val();
    if (!sharedNote) return;
    
    // Update the current note with shared data
    if (currentNote && currentNote.sharedId === sharedId) {
      isReceivingUpdate = true;
      
      // Update note content
      currentNote.title = sharedNote.title || '';
      currentNote.content = sharedNote.content || '';
      currentNote.categories = sharedNote.categories || [];
      currentNote.images = sharedNote.images || [];
      currentNote.listSections = sharedNote.listSections || [];
      // Handle legacy list format
      if (sharedNote.list && !sharedNote.listSections) {
        currentNote.listSections = [{
          id: generateId(),
          type: sharedNote.listType || 'bulleted',
          items: sharedNote.list
        }];
      }
      currentNote.updatedAt = sharedNote.updatedAt;
      
      // Update current list type for UI
      if (sharedNote.listType) {
        currentListType = sharedNote.listType;
      }
      
      // Update UI elements only if user is not actively typing
      const titleInput = document.getElementById("titleInput");
      const contentTextarea = document.getElementById("contentTextarea");
      
      // Only update fields that user is not currently editing
      if (titleInput && document.activeElement !== titleInput) {
        titleInput.value = currentNote.title || '';
      }
      
      if (contentTextarea && document.activeElement !== contentTextarea) {
        contentTextarea.value = currentNote.content || '';
      }
      
      updateCategoryChips();
      updateListSection();
      updateImagesSection();
      
      // Update the note in local notes array
      const noteIndex = notes.findIndex(n => n.id === currentNote.id);
      if (noteIndex !== -1) {
        notes[noteIndex] = { ...currentNote };
        localStorage.setItem("notes", JSON.stringify(notes));
      }
      
      isReceivingUpdate = false;
      
      // Update collaborator presence indicators
      updateCollaboratorPresence(sharedNote.activeUsers || {});
    }
  });
  
  // Store the listener for cleanup
  sharedNoteListeners.set(sharedId, listener);
  
  // Update presence to show user is actively editing
  updatePresence(sharedId, { status: 'editing' });
  
  // Show collaboration status indicator
  showCollaborationStatus();
  
  // Setup faster auto-save for collaborative editing
  setupFastAutoSave();
  
  // Setup user activity tracking
  trackUserActivity();
  
  collaborativeEditingEnabled = true;
  console.log('Real-time collaboration enabled for shared note:', sharedId);
}

function cleanupRealtimeCollaboration(sharedId) {
  if (sharedNoteListeners.has(sharedId)) {
    const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
    sharedNoteRef.off('value', sharedNoteListeners.get(sharedId));
    sharedNoteListeners.delete(sharedId);
  }
  
  // Update presence to show user is no longer editing
  if (window.authFunctions?.updatePresence) {
    window.authFunctions.updatePresence(sharedId, { status: 'idle' });
  }
  
  // Hide collaboration status indicator
  hideCollaborationStatus();
  
  collaborativeEditingEnabled = false;
}

function updatePresence(sharedId, data) {
  if (window.authFunctions?.updatePresence) {
    window.authFunctions.updatePresence(sharedId, data);
  }
}

function trackUserActivity() {
  // Track user typing activity for presence indicators
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  function updateActivityStatus() {
    if (currentNote && currentNote.isShared && currentNote.sharedId) {
      updatePresence(currentNote.sharedId, { 
        status: 'editing',
        lastActive: Date.now(),
        currentField: document.activeElement?.id || null
      });
    }
  }
  
  if (titleInput) {
    titleInput.addEventListener('focus', updateActivityStatus);
    titleInput.addEventListener('input', updateActivityStatus);
  }
  
  if (contentTextarea) {
    contentTextarea.addEventListener('focus', updateActivityStatus);
    contentTextarea.addEventListener('input', updateActivityStatus);
  }
}

function showCollaborationStatus() {
  const collaborationStatus = document.getElementById('collaborationStatus');
  if (collaborationStatus) {
    collaborationStatus.style.display = 'block';
  }
}

function hideCollaborationStatus() {
  const collaborationStatus = document.getElementById('collaborationStatus');
  if (collaborationStatus) {
    collaborationStatus.style.display = 'none';
  }
}

function setupFastAutoSave() {
  // Clear existing auto-save timeout
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }
  
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  function fastSave() {
    if (collaborativeEditingEnabled && !isReceivingUpdate) {
      isAutoSave = true;
      saveCurrentNote();
      isAutoSave = false;
    }
  }
  
  // Save every 200ms for near real-time collaborative editing
  const fastAutoSave = debounce(fastSave, 200);
  
  if (titleInput) {
    titleInput.removeEventListener('input', fastAutoSave);
    titleInput.addEventListener('input', fastAutoSave);
  }
  
  if (contentTextarea) {
    contentTextarea.removeEventListener('input', fastAutoSave);
    contentTextarea.addEventListener('input', fastAutoSave);
  }
}

function setupHomePageSync() {
  // Clear any existing sync interval
  if (homePageSyncInterval) {
    clearInterval(homePageSyncInterval);
  }
  
  // Only sync if we're on the notes page and user is signed in
  const notesPage = document.getElementById("notesPage");
  if (!notesPage || !notesPage.classList.contains("active") || !getCurrentUser() || isUserGuest()) {
    return;
  }
  
  // Use Firebase real-time listener for shared notes updates
  const currentUser = getCurrentUser();
  if (!currentUser || !window.database) return;
  
  try {
    // Listen for changes to shared notes where user is owner or collaborator
    const sharedNotesRef = window.database.ref('sharedNotes');
    
    homePageSyncInterval = sharedNotesRef.on('child_changed', (snapshot) => {
      try {
        const sharedNoteId = snapshot.key;
        const sharedNoteData = snapshot.val();
        
        // Check if current user is involved in this shared note
        if (!sharedNoteData) {
          return;
        }
        
        // Check if user is owner
        if (sharedNoteData.ownerId === currentUser.uid) {
          // User is owner, continue with update
        } else {
          // Check if user is a collaborator (handle both array and object formats)
          let isCollaborator = false;
          if (sharedNoteData.collaborators) {
            if (Array.isArray(sharedNoteData.collaborators)) {
              isCollaborator = sharedNoteData.collaborators.includes(currentUser.uid);
            } else if (typeof sharedNoteData.collaborators === 'object') {
              isCollaborator = sharedNoteData.collaborators[currentUser.uid] === true;
            }
          }
          
          if (!isCollaborator) {
            return;
          }
        }
        
        // Update local notes with the changed shared note
        const existingIndex = notes.findIndex(n => n.sharedId === sharedNoteId);
        if (existingIndex !== -1) {
          notes[existingIndex] = {
            ...notes[existingIndex],
            title: sharedNoteData.title || '',
            content: sharedNoteData.content || '',
            lastModified: sharedNoteData.lastModified,
            categories: sharedNoteData.categories || [],
            images: sharedNoteData.images || [],
            listSections: sharedNoteData.listSections || []
          };
          
          // Re-render notes to show the update
          renderNotes();
        }
      } catch (error) {
        console.error("Error processing shared note update:", error);
      }
    });
    
    console.log("Home page real-time sync enabled");
  } catch (error) {
    console.error("Error setting up home page sync:", error);
  }
}

function cleanupHomePageSync() {
  if (homePageSyncInterval && window.database) {
    try {
      // Remove Firebase listener
      const sharedNotesRef = window.database.ref('sharedNotes');
      sharedNotesRef.off('child_changed', homePageSyncInterval);
      console.log("Home page sync listener removed");
    } catch (error) {
      console.error("Error removing sync listener:", error);
    }
    homePageSyncInterval = null;
  }
}

function updateCollaboratorPresence(activeUsers) {
  const activeCollaborators = document.getElementById('activeCollaborators');
  const collaborationText = document.querySelector('.collaboration-text');
  if (!activeCollaborators) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;
  
  // Filter out current user and get only active collaborators
  const collaborators = Object.entries(activeUsers)
    .filter(([uid, userData]) => uid !== currentUser.uid && userData.status === 'editing')
    .slice(0, 3); // Show max 3 collaborators
  
  if (collaborators.length === 0) {
    activeCollaborators.innerHTML = '';
    if (collaborationText) {
      collaborationText.textContent = 'Real-time collaboration active';
    }
    return;
  }
  
  // Update collaboration text with count
  if (collaborationText) {
    const count = collaborators.length;
    collaborationText.textContent = `${count} other${count > 1 ? 's' : ''} editing`;
  }
  
  activeCollaborators.innerHTML = collaborators.map(([uid, userData]) => {
    const initials = (userData.name || 'U').charAt(0).toUpperCase();
    const fieldIndicator = userData.currentField === 'titleInput' ? '📝' : 
                          userData.currentField === 'contentTextarea' ? '✏️' : '';
    return `<div class="collaborator-avatar" title="${userData.name || 'Unknown'} ${fieldIndicator}">${initials}</div>`;
  }).join('');
}

// Export for window global
window.renderNotes = renderNotes;
window.renderCategories = renderCategories;