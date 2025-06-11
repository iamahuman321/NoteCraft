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
let shoppingLists = JSON.parse(localStorage.getItem("shoppingLists")) || {
  grocery: [],
  pharmacy: [],
  other: []
};
let currentShoppingCategory = null;
let searchQuery = "";
let filteredNotes = [];

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
    
    // Clear search on page load
    clearSearch();
    
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
        
        // Load shared shopping lists for all users (signed in and guest)
        loadSharedShoppingLists();
        
        // Check for shared note to open
        checkForSharedNoteToOpen();
        
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
    try {
      const parsedNotes = JSON.parse(savedNotes);
      notes = Array.isArray(parsedNotes) ? parsedNotes : [];
    } catch (error) {
      console.error("Error parsing saved notes:", error);
      notes = [];
    }
  } else {
    notes = [];
  }
  
  // Load categories from localStorage
  const savedCategories = localStorage.getItem("categories");
  if (savedCategories) {
    try {
      const parsedCategories = JSON.parse(savedCategories);
      categories = Array.isArray(parsedCategories) ? parsedCategories : [{ id: "all", name: "All" }];
    } catch (error) {
      console.error("Error parsing saved categories:", error);
      categories = [{ id: "all", name: "All" }];
    }
  } else {
    categories = [{ id: "all", name: "All" }];
  }
  
  // Load settings from localStorage
  const savedFilter = localStorage.getItem("currentFilter");
  if (savedFilter) {
    currentFilter = savedFilter;
  }
  
  console.log("Local data loaded - notes:", notes.length, "categories:", categories.length);
}

function checkForSharedNoteToOpen() {
  const sharedNoteData = localStorage.getItem('openSharedNote');
  if (sharedNoteData) {
    try {
      const sharedNote = JSON.parse(sharedNoteData);
      
      // Ensure proper list structure - convert legacy format to new format
      if (sharedNote.listItems && !sharedNote.listSections) {
        sharedNote.listSections = [{
          id: generateId(),
          type: sharedNote.listType || 'bulleted',
          items: sharedNote.listItems
        }];
      }
      
      // Ensure all required properties exist
      sharedNote.categories = sharedNote.categories || [];
      sharedNote.images = sharedNote.images || [];
      sharedNote.listSections = sharedNote.listSections || [];
      
      // Force reload from Firebase to get latest data
      if (sharedNote.sharedId && window.database) {
        const sharedNoteRef = window.database.ref(`sharedNotes/${sharedNote.sharedId}`);
        sharedNoteRef.once('value').then((snapshot) => {
          const latestData = snapshot.val();
          if (latestData) {
            // Update with latest Firebase data
            Object.assign(sharedNote, {
              title: latestData.title || '',
              content: latestData.content || '',
              categories: latestData.categories || [],
              images: latestData.images || [],
              listSections: latestData.listSections || [],
              updatedAt: latestData.updatedAt
            });
            
            // Handle legacy list format from Firebase
            if (latestData.list && !latestData.listSections) {
              sharedNote.listSections = [{
                id: generateId(),
                type: latestData.listType || 'bulleted',
                items: latestData.list
              }];
            }
          }
          
          // Open the note in editor
          editNote(sharedNote);
          localStorage.removeItem('openSharedNote');
        }).catch((error) => {
          console.error("Error loading latest shared note data:", error);
          // Fallback to cached data
          editNote(sharedNote);
          localStorage.removeItem('openSharedNote');
        });
      } else {
        // No Firebase or sharedId, use cached data
        editNote(sharedNote);
        localStorage.removeItem('openSharedNote');
      }
    } catch (error) {
      console.error("Error parsing shared note data:", error);
      localStorage.removeItem('openSharedNote');
    }
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
  if (backBtn) backBtn.addEventListener("click", () => {
    // Handle different back navigation contexts
    const shoppingCategoryPage = document.getElementById("shoppingCategoryPage");
    if (shoppingCategoryPage && shoppingCategoryPage.classList.contains("active")) {
      showShoppingPage();
    } else {
      showNotesPage();
    }
  });

  // Search functionality
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const searchClear = document.getElementById("searchClear");

  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    });
  }
  if (searchBtn) searchBtn.addEventListener("click", handleSearch);
  if (searchClear) searchClear.addEventListener("click", clearSearch);
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
  
  // Shopping Lists Navigation
  const navShopping = document.getElementById("navShopping");
  if (navShopping) navShopping.addEventListener("click", (e) => {
    e.preventDefault();
    showShoppingPage();
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

  // Image viewer modal
  const imageViewerClose = document.getElementById("imageViewerClose");
  const imageViewerOverlay = document.getElementById("imageViewerOverlay");
  const downloadImageBtn = document.getElementById("downloadImageBtn");

  if (imageViewerClose) imageViewerClose.addEventListener("click", closeImageViewer);
  if (imageViewerOverlay) imageViewerOverlay.addEventListener("click", closeImageViewer);
  if (downloadImageBtn) downloadImageBtn.addEventListener("click", downloadImage);

  // Close image viewer with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("imageViewerModal");
      if (modal && modal.classList.contains("show")) {
        closeImageViewer();
      }
    }
  });

  // Shopping Lists
  const groceryBtn = document.getElementById("groceryBtn");
  const pharmacyBtn = document.getElementById("pharmacyBtn");
  const otherBtn = document.getElementById("otherBtn");
  const addShoppingItemBtn = document.getElementById("addShoppingItemBtn");

  if (groceryBtn) groceryBtn.addEventListener("click", () => showShoppingCategoryPage("grocery"));
  if (pharmacyBtn) pharmacyBtn.addEventListener("click", () => showShoppingCategoryPage("pharmacy"));
  if (otherBtn) otherBtn.addEventListener("click", () => showShoppingCategoryPage("other"));
  if (addShoppingItemBtn) addShoppingItemBtn.addEventListener("click", () => {
    if (currentShoppingCategory) {
      addShoppingItem(currentShoppingCategory);
    }
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
  
  // Ensure proper list structure before editing
  if (!currentNote.listSections && currentNote.listItems) {
    // Convert legacy format
    currentNote.listSections = [{
      id: generateId(),
      type: currentNote.listType || 'bulleted',
      items: currentNote.listItems
    }];
  }
  
  // Ensure all required arrays exist
  currentNote.categories = currentNote.categories || [];
  currentNote.images = currentNote.images || [];
  currentNote.listSections = currentNote.listSections || [];
  
  showEditorPage();
  updateEditorContent();
  
  // Force update list section after a brief delay to ensure DOM is ready
  setTimeout(() => {
    updateListSection();
  }, 100);
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
        listSections: currentNote.listSections || [],
        // Keep legacy list support for backwards compatibility
        list: currentNote.list || [],
        listType: currentNote.listType || 'bulleted'
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

  // Apply both search and filter
  let filteredNotes = getFilteredNotes();
  
  // Additional safety check
  if (!Array.isArray(filteredNotes)) {
    console.error("getFilteredNotes returned non-array:", filteredNotes);
    filteredNotes = [];
  }

  if (filteredNotes.length === 0) {
    let emptyMessage;
    if (searchQuery) {
      emptyMessage = { icon: "fas fa-search", title: `No results for "${searchQuery}"`, text: "Try different search terms" };
    } else if (currentFilter === "shared") {
      emptyMessage = { icon: "fas fa-users", title: "No shared notes", text: "Notes shared with others will appear here" };
    } else {
      emptyMessage = { icon: "fas fa-sticky-note", title: "No notes yet", text: "Tap the + button to create your first note" };
    }
    
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="${emptyMessage.icon}"></i>
        <h3>${emptyMessage.title}</h3>
        <p>${emptyMessage.text}</p>
      </div>
    `;
    return;
  }
  
  try {
    notesContainer.innerHTML = `
      <div class="notes-grid">
        ${filteredNotes.map(note => {
          if (!note) return '';
          
          const preview = note.content ? (note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content) : "No content";
          const dateStr = formatDate(note.updatedAt || note.createdAt || Date.now());
          
          const categoryTags = Array.isArray(note.categories) ? note.categories.map(catId => {
            const category = Array.isArray(categories) ? categories.find(c => c.id === catId) : null;
            return category ? `<span class="category-chip">${category.name}</span>` : "";
          }).join("") : "";

          const isShared = note.sharedId || (note.collaborators && Object.keys(note.collaborators).length > 0);
          const collaboratorCount = note.collaborators ? Object.keys(note.collaborators).length : 0;

          // Highlight search terms
          const highlightedTitle = highlightSearchTerms(note.title || "Untitled", searchQuery);
          const highlightedPreview = highlightSearchTerms(preview, searchQuery);

          return `
            <div class="note-card" onclick="editNote(notes.find(n => n.id === '${note.id}'))">
              <div class="note-title">
                ${highlightedTitle}
                ${isShared ? `<i class="fas fa-users share-icon" title="Shared with ${collaboratorCount} people"></i>` : ""}
              </div>
              <div class="note-preview">${highlightedPreview}</div>
              <div class="note-meta">
                <span>${dateStr}</span>
                ${note.categories && note.categories.length > 0 ? `<span>${note.categories.length} categories</span>` : ""}
                ${isShared ? `<span class="shared-indicator"><i class="fas fa-share-alt"></i> Shared</span>` : ""}
              </div>
              ${categoryTags ? `<div class="category-chips">${categoryTags}</div>` : ""}
            </div>
          `;
        }).filter(html => html !== '').join("")}
      </div>
    `;
  } catch (error) {
    console.error("Error rendering notes:", error);
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error loading notes</h3>
        <p>Please refresh the page</p>
      </div>
    `;
  }
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
  
  // Search section is now part of notes page, so it shows automatically
  
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
  
  // Search section is hidden automatically when notes page is not active
  
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

function showShoppingPage() {
  // Clean up home page sync when leaving notes page
  cleanupHomePageSync();
  
  // Force refresh shopping lists from Firebase to prevent stale data
  loadSharedShoppingLists();
  
  // Setup real-time shopping list sync
  setupShoppingListSync();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const shoppingPage = document.getElementById("shoppingPage");
  if (shoppingPage) shoppingPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "SHOPPING LISTS";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.add("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
}

function showShoppingCategoryPage(category) {
  currentShoppingCategory = category;
  
  // Force refresh from Firebase before showing category
  if (window.database) {
    window.database.ref('sharedNotes/family_shopping_lists').once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        if (data && data.shoppingLists) {
          shoppingLists = data.shoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
        }
        renderShoppingList(category);
      })
      .catch((error) => {
        console.error("Error refreshing shopping list:", error);
        renderShoppingList(category);
      });
  } else {
    renderShoppingList(category);
  }
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const shoppingCategoryPage = document.getElementById("shoppingCategoryPage");
  if (shoppingCategoryPage) shoppingCategoryPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  const categoryTitle = document.getElementById("shoppingCategoryTitle");
  const displayName = category.toUpperCase();
  
  if (headerTitle) headerTitle.textContent = displayName;
  if (categoryTitle) categoryTitle.textContent = displayName;
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
}

function renderShoppingList(category) {
  const shoppingListItems = document.getElementById("shoppingListItems");
  if (!shoppingListItems) return;
  
  const items = shoppingLists[category] || [];
  
  shoppingListItems.innerHTML = items.map((item, index) => `
    <div class="shopping-item ${item.completed ? 'completed' : ''}">
      <input type="checkbox" ${item.completed ? 'checked' : ''} 
             onchange="toggleShoppingItem('${category}', ${index})" />
      <input type="text" value="${escapeHtml(item.text)}" 
             onchange="updateShoppingItem('${category}', ${index}, this.value)" 
             placeholder="Add item..." />
      <button class="btn-icon" onclick="deleteShoppingItem('${category}', ${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function addShoppingItem(category) {
  if (!shoppingLists[category]) shoppingLists[category] = [];
  
  shoppingLists[category].push({
    text: "",
    completed: false
  });
  
  forceSyncShoppingLists();
  renderShoppingList(category);
}

function updateShoppingItem(category, index, text) {
  if (shoppingLists[category] && shoppingLists[category][index]) {
    shoppingLists[category][index].text = text;
    forceSyncShoppingLists();
  }
}

function toggleShoppingItem(category, index) {
  if (shoppingLists[category] && shoppingLists[category][index]) {
    shoppingLists[category][index].completed = !shoppingLists[category][index].completed;
    forceSyncShoppingLists();
    renderShoppingList(category);
  }
}

function deleteShoppingItem(category, index) {
  if (shoppingLists[category]) {
    shoppingLists[category].splice(index, 1);
    forceSyncShoppingLists();
    renderShoppingList(category);
  }
}

function saveShoppingLists() {
  localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
  
  // Save to Firebase with a universal shared shopping list ID
  const currentUser = window.authFunctions?.getCurrentUser();
  if (currentUser && window.authFunctions?.updateSharedNote) {
    try {
      // Use a universal shopping list ID that all users share
      const universalShoppingListId = "family_shopping_lists";
      window.authFunctions.updateSharedNote(universalShoppingListId, {
        shoppingLists: shoppingLists,
        type: 'shoppingList',
        updatedAt: Date.now(),
        lastUpdatedBy: currentUser.displayName || currentUser.email
      });
    } catch (error) {
      console.error("Error saving shopping lists to Firebase:", error);
    }
  }
}

// Debounced sync to prevent overwhelming Firebase
let shoppingSyncTimeout = null;

// Force immediate sync with retry mechanism for shopping lists
function forceSyncShoppingLists(retryCount = 0) {
  const maxRetries = 3;
  
  // Record timestamp of local change
  const now = Date.now();
  localStorage.setItem("lastShoppingListUpdate", now.toString());
  
  // Always save to local storage first
  localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
  
  // Clear any pending sync
  if (shoppingSyncTimeout) {
    clearTimeout(shoppingSyncTimeout);
  }
  
  // For critical operations (delete, toggle), sync immediately
  // For text updates, use short debounce
  const isTextUpdate = new Error().stack.includes('updateShoppingItem');
  const delay = isTextUpdate ? 200 : 0;
  
  shoppingSyncTimeout = setTimeout(() => {
    performShoppingSyncWithRetry(retryCount, now);
  }, delay);
}

function performShoppingSyncWithRetry(retryCount = 0, timestamp) {
  const maxRetries = 3;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser || !window.authFunctions?.updateSharedNote) {
    // If no user or Firebase not available, try again in 1 second
    if (retryCount < maxRetries) {
      setTimeout(() => performShoppingSyncWithRetry(retryCount + 1, timestamp), 1000);
    }
    return;
  }
  
  const universalShoppingListId = "family_shopping_lists";
  const syncData = {
    shoppingLists: shoppingLists,
    type: 'shoppingList',
    updatedAt: timestamp || Date.now(),
    lastUpdatedBy: currentUser.displayName || currentUser.email,
    syncAttempt: retryCount + 1
  };
  
  try {
    // Force immediate Firebase update
    const promise = window.authFunctions.updateSharedNote(universalShoppingListId, syncData);
    
    // If updateSharedNote returns a promise, handle it
    if (promise && typeof promise.then === 'function') {
      promise.then(() => {
        console.log("Shopping list synced successfully");
      }).catch((error) => {
        console.error(`Shopping list sync failed (attempt ${retryCount + 1}):`, error);
        if (retryCount < maxRetries) {
          setTimeout(() => performShoppingSyncWithRetry(retryCount + 1, timestamp), 2000);
        }
      });
    }
    
  } catch (error) {
    console.error(`Shopping list sync error (attempt ${retryCount + 1}):`, error);
    if (retryCount < maxRetries) {
      setTimeout(() => performShoppingSyncWithRetry(retryCount + 1, timestamp), 2000);
    }
  }
}

let shoppingListListener = null;

function setupShoppingListSync() {
  if (!window.database) {
    // Retry setup if database not ready
    setTimeout(setupShoppingListSync, 1000);
    return;
  }
  
  // Clean up existing listener
  if (shoppingListListener) {
    cleanupShoppingListSync();
  }
  
  const shoppingListRef = window.database.ref('sharedNotes/family_shopping_lists');
  
  shoppingListListener = shoppingListRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.shoppingLists && data.updatedAt) {
      // Only update if Firebase data is newer than our last local change
      const lastLocalUpdate = localStorage.getItem("lastShoppingListUpdate");
      const localUpdateTime = lastLocalUpdate ? parseInt(lastLocalUpdate) : 0;
      
      // If Firebase data is newer than our last local change, accept it
      if (data.updatedAt > localUpdateTime + 500) { // 500ms buffer to prevent race conditions
        const currentDataString = JSON.stringify(shoppingLists);
        const newDataString = JSON.stringify(data.shoppingLists);
        
        if (currentDataString !== newDataString) {
          shoppingLists = data.shoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
          
          // Re-render current shopping category if user is viewing one
          if (currentShoppingCategory) {
            renderShoppingList(currentShoppingCategory);
          }
          
          console.log("Shopping lists updated from Firebase:", data.lastUpdatedBy || 'Unknown user');
        }
      }
    } else if (!data) {
      // Initialize empty shopping lists if none exist
      const defaultShoppingLists = {
        grocery: [],
        pharmacy: [],
        other: []
      };
      
      // Only initialize if current lists are also empty
      const hasAnyItems = Object.values(shoppingLists).some(list => list.length > 0);
      if (!hasAnyItems) {
        shoppingLists = defaultShoppingLists;
        localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
        forceSyncShoppingLists(); // Create the shared list in Firebase
      }
    }
  }, (error) => {
    console.error("Shopping list sync error:", error);
    // Retry connection after error
    setTimeout(setupShoppingListSync, 3000);
  });
}

function cleanupShoppingListSync() {
  if (shoppingListListener && window.database) {
    window.database.ref('sharedNotes/family_shopping_lists').off('value', shoppingListListener);
    shoppingListListener = null;
  }
}

// Load shared shopping lists for all users with forced refresh
function loadSharedShoppingLists() {
  if (window.database) {
    // Clear local timestamp to force accept of Firebase data
    localStorage.removeItem("lastShoppingListUpdate");
    
    window.database.ref('sharedNotes/family_shopping_lists').once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        if (data && data.shoppingLists) {
          // Always accept Firebase data on fresh load
          shoppingLists = data.shoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
          console.log("Fresh shopping lists loaded from Firebase");
        } else {
          // Initialize empty shopping lists if none exist
          const defaultShoppingLists = {
            grocery: [],
            pharmacy: [],
            other: []
          };
          
          // Save default lists to Firebase for all users to access
          const currentUser = window.authFunctions?.getCurrentUser();
          if (currentUser && window.authFunctions?.updateSharedNote) {
            const now = Date.now();
            localStorage.setItem("lastShoppingListUpdate", now.toString());
            window.authFunctions.updateSharedNote("family_shopping_lists", {
              shoppingLists: defaultShoppingLists,
              type: 'shoppingList',
              createdAt: now,
              updatedAt: now,
              createdBy: currentUser.displayName || currentUser.email
            });
          }
          
          shoppingLists = defaultShoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
        }
      })
      .catch((error) => {
        console.error("Error loading shared shopping lists:", error);
        // Fallback to local storage if Firebase fails
        const localShoppingLists = localStorage.getItem("shoppingLists");
        if (localShoppingLists) {
          shoppingLists = JSON.parse(localShoppingLists);
        }
      });
  }
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
  
  // Handle migration from old single list to new multiple list sections
  if (currentNote.list && !currentNote.listSections) {
    const hasCheckboxes = currentNote.list.some(item => item.hasOwnProperty('completed'));
    currentNote.listSections = [{
      id: generateId(),
      type: hasCheckboxes ? 'checklist' : 'bulleted',
      items: currentNote.list
    }];
    delete currentNote.list;
    delete currentNote.listType;
    saveCurrentNote(); // Save the migration
  }
  
  updateCategoryChips();
  updateShareButtonVisibility();
  updateListSection();
  updateImagesSection();
  updatePasswordButton();
  
  // Ensure list section is visible if there are list sections
  const listSection = document.getElementById("listSection");
  if (listSection && currentNote.listSections && currentNote.listSections.length > 0) {
    listSection.classList.remove("hidden");
  }
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
        <span class="list-type-label">${section.type === 'checklist' ? 'Checklist' : section.type === 'numbered' ? 'Numbered List' : 'Bulleted List'}</span>
        <button class="btn-icon delete-section-btn" data-section-id="${section.id}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${section.items.map((item, itemIndex) => `
        <div class="list-item ${item.completed ? 'completed' : ''} list-item-${section.type}">
          ${section.type === 'checklist' ? `<input type="checkbox" ${item.completed ? 'checked' : ''} class="item-checkbox" data-section-id="${section.id}" data-item-index="${itemIndex}" />` : ''}
          ${section.type === 'numbered' ? `<span class="list-number">${itemIndex + 1}.</span>` : ''}
          ${section.type === 'bulleted' ? `<span class="list-bullet">•</span>` : ''}
          <input type="text" value="${escapeHtml(item.text || '')}" class="item-input" data-section-id="${section.id}" data-item-index="${itemIndex}" />
          <button class="btn-icon delete-item-btn" data-section-id="${section.id}" data-item-index="${itemIndex}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `).join("")}
      <div class="list-item">
        <button class="btn-icon add-item-btn" data-section-id="${section.id}">
          <i class="fas fa-plus"></i>
        </button>
        <span>Add item</span>
      </div>
    </div>
  `).join("");
  
  // Add event listeners after rendering
  setupListEventListeners();
}

function setupListEventListeners() {
  // Add item buttons
  const addButtons = document.querySelectorAll('.add-item-btn');
  
  addButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sectionId = e.target.closest('.add-item-btn').dataset.sectionId;
      addListItemToSection(sectionId);
    });
  });

  // Delete section buttons
  document.querySelectorAll('.delete-section-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sectionId = e.target.closest('.delete-section-btn').dataset.sectionId;
      deleteListSection(sectionId);
    });
  });

  // Delete item buttons
  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const button = e.target.closest('.delete-item-btn');
      const sectionId = button.dataset.sectionId;
      const itemIndex = parseInt(button.dataset.itemIndex);
      deleteListItemInSection(sectionId, itemIndex);
    });
  });

  // Item checkboxes
  document.querySelectorAll('.item-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const sectionId = e.target.dataset.sectionId;
      const itemIndex = parseInt(e.target.dataset.itemIndex);
      toggleListItemInSection(sectionId, itemIndex);
    });
  });

  // Item text inputs
  document.querySelectorAll('.item-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const sectionId = e.target.dataset.sectionId;
      const itemIndex = parseInt(e.target.dataset.itemIndex);
      updateListItemInSection(sectionId, itemIndex, e.target.value);
    });
  });
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
        
        // Create a completely unique image object for this specific note
        const uniqueImageId = `${currentNote.id}_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const imageData = {
          id: uniqueImageId,
          name: file.name,
          data: e.target.result,
          timestamp: Date.now(),
          noteId: currentNote.id // Tie image to specific note
        };
        
        currentNote.images.push(imageData);
        updateImagesSection();
        saveCurrentNote();
        showToast("Image added successfully", "success");
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Clear the input so the same file can be uploaded again
  event.target.value = '';
}

function updateImagesSection() {
  const imagesSection = document.getElementById("imagesSection");
  const imageGrid = document.getElementById("imageGrid");
  
  // Safety check for currentNote
  if (!currentNote) {
    if (imagesSection) imagesSection.classList.add("hidden");
    return;
  }
  
  // Filter images that belong only to this note
  const noteImages = currentNote.images?.filter(img => 
    !img.noteId || img.noteId === currentNote.id
  ) || [];
  
  if (noteImages.length === 0) {
    if (imagesSection) imagesSection.classList.add("hidden");
    return;
  }
  
  if (imagesSection) imagesSection.classList.remove("hidden");
  
  if (imageGrid) {
    // Clear existing content and event listeners
    imageGrid.innerHTML = '';
    
    noteImages.forEach((image, index) => {
      const imageSrc = typeof image === 'string' ? image : (image?.data || '');
      const imageId = typeof image === 'object' && image?.id ? image.id : `img_${currentNote.id}_${index}`;
      
      if (!imageSrc) return;
      
      // Create image container
      const imageContainer = document.createElement('div');
      imageContainer.className = 'image-item';
      imageContainer.setAttribute('data-image-id', imageId);
      
      // Create image element
      const imgElement = document.createElement('img');
      imgElement.src = imageSrc;
      imgElement.alt = 'Note Image';
      imgElement.style.cursor = 'pointer';
      imgElement.setAttribute('data-index', index.toString());
      
      // Add click event listener directly to the image
      imgElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Image clicked:", index, "for note:", currentNote.id);
        openImageViewer(imageSrc, index);
      });
      
      // Create delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'image-delete';
      deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteImage(index);
      });
      
      // Assemble the container
      imageContainer.appendChild(imgElement);
      imageContainer.appendChild(deleteBtn);
      imageGrid.appendChild(imageContainer);
    });
    
    console.log("Updated images section with", noteImages.length, "images for note:", currentNote.id);
  }
}

function deleteImage(index) {
  if (!currentNote?.images) return;
  
  // Filter images that belong to this note
  const noteImages = currentNote.images.filter(img => 
    !img.noteId || img.noteId === currentNote.id
  );
  
  if (!noteImages[index]) return;
  
  // Find the actual index in the full images array
  const imageToDelete = noteImages[index];
  const actualIndex = currentNote.images.findIndex(img => 
    (img.id && img.id === imageToDelete.id) || 
    (img.data === imageToDelete.data && img.timestamp === imageToDelete.timestamp)
  );
  
  if (actualIndex >= 0) {
    currentNote.images.splice(actualIndex, 1);
    updateImagesSection();
    saveCurrentNote();
    showToast("Image deleted successfully", "success");
  }
}

// Image viewer functions
let currentImageSrc = null;
let currentImageIndex = null;

function openImageViewer(imageSrc, imageIndex) {
  console.log("Opening image viewer:", imageSrc, imageIndex);
  currentImageSrc = imageSrc;
  currentImageIndex = imageIndex;
  
  const modal = document.getElementById("imageViewerModal");
  const img = document.getElementById("imageViewerImg");
  
  console.log("Modal found:", !!modal, "Image found:", !!img);
  
  if (modal && img) {
    img.src = imageSrc;
    modal.classList.add("show");
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";
    
    console.log("Image viewer opened successfully");
  } else {
    console.error("Modal or image element not found");
  }
}

function closeImageViewer() {
  const modal = document.getElementById("imageViewerModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "";
    currentImageSrc = null;
    currentImageIndex = null;
  }
}

function downloadImage() {
  if (!currentImageSrc) return;
  
  try {
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = currentImageSrc;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const noteTitle = currentNote?.title || 'Note';
    const filename = `${noteTitle}_Image_${timestamp}.png`;
    
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Image downloaded successfully", "success");
  } catch (error) {
    console.error("Error downloading image:", error);
    showToast("Error downloading image", "error");
  }
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
window.updateShoppingItem = updateShoppingItem;
window.toggleShoppingItem = toggleShoppingItem;
window.deleteShoppingItem = deleteShoppingItem;

// Search functionality
function handleSearch() {
  const searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear");
  
  if (!searchInput) return;
  
  searchQuery = searchInput.value.trim();
  
  if (searchQuery) {
    searchClear.classList.remove("hidden");
  } else {
    searchClear.classList.add("hidden");
  }
  
  renderNotes();
}

function clearSearch() {
  const searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear");
  
  if (searchInput) searchInput.value = "";
  searchQuery = "";
  searchClear.classList.add("hidden");
  
  renderNotes();
}

function getFilteredNotes() {
  // Ensure notes is always an array
  if (!Array.isArray(notes)) {
    console.warn("Notes array is not initialized, returning empty array");
    return [];
  }
  
  let filteredNotes = [...notes]; // Create a copy to avoid mutations
  
  // Apply category filter first
  if (currentFilter === "shared") {
    filteredNotes = filteredNotes.filter(note => 
      note.sharedId || (note.collaborators && Object.keys(note.collaborators).length > 0)
    );
  } else if (currentFilter !== "all") {
    filteredNotes = filteredNotes.filter(note => 
      note.categories && Array.isArray(note.categories) && note.categories.includes(currentFilter)
    );
  }
  
  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredNotes = filteredNotes.filter(note => {
      // Search in title
      if (note.title && note.title.toLowerCase().includes(query)) return true;
      
      // Search in content
      if (note.content && note.content.toLowerCase().includes(query)) return true;
      
      // Search in categories
      if (Array.isArray(note.categories) && Array.isArray(categories)) {
        const categoryNames = note.categories.map(catId => {
          const category = categories.find(c => c.id === catId);
          return category ? category.name.toLowerCase() : catId.toLowerCase();
        });
        if (categoryNames.some(name => name.includes(query))) return true;
      }
      
      // Search in list items
      if (note.list && Array.isArray(note.list.items)) {
        const listText = note.list.items.map(item => item.text || "").join(" ").toLowerCase();
        if (listText.includes(query)) return true;
      }
      
      // Search in list sections
      if (Array.isArray(note.listSections)) {
        const sectionsText = note.listSections.map(section => 
          Array.isArray(section.items) ? section.items.map(item => item.text || "").join(" ") : ""
        ).join(" ").toLowerCase();
        if (sectionsText.includes(query)) return true;
      }
      
      return false;
    });
  }
  
  return filteredNotes;
}

function highlightSearchTerms(text, query) {
  if (!query || !text) return escapeHtml(text);
  
  const escapedText = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  
  return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

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
      
      // Only update list section if user is not actively interacting with it
      const listItems = document.getElementById("listItems");
      const isListFocused = listItems && listItems.contains(document.activeElement);
      if (!isListFocused) {
        updateListSection();
      }
      
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
  
  // Force initial list section update to ensure everything renders properly
  setTimeout(() => {
    updateListSection();
  }, 200);
  
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