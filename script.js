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
  if (userSearchInput) userSearchInput.addEventListener("input", debounce(searchUsers, 300));

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
  if (!currentNote) return;
  
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  if (titleInput) currentNote.title = titleInput.value;
  if (contentTextarea) currentNote.content = contentTextarea.value;
  
  currentNote.updatedAt = Date.now();
  
  if (currentNote.isShared) {
    saveSharedNote();
  } else {
    saveLocalNote();
  }
}

function saveLocalNote() {
  const existingIndex = notes.findIndex(n => n.id === currentNote.id);
  
  if (existingIndex >= 0) {
    notes[existingIndex] = currentNote;
    showToast(t("noteUpdated"), "success");
  } else {
    notes.push(currentNote);
    showToast(t("noteAdded"), "success");
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
    window.authFunctions.updateSharedNote(currentNote.sharedId, {
      title: currentNote.title,
      content: currentNote.content,
      categories: currentNote.categories,
      images: currentNote.images,
      list: currentNote.list
    });
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
        const preview = note.content ? (note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content) : "No content";
        const dateStr = formatDate(note.updatedAt || note.createdAt || Date.now());
        
        const categoryTags = note.categories?.map(catId => {
          const category = categories.find(c => c.id === catId);
          return category ? `<span class="category-chip">${category.name}</span>` : "";
        }).join("") || "";

        return `
          <div class="note-card" onclick="editNote(notes.find(n => n.id === '${note.id}'))">
            <div class="note-title">${note.title || "Untitled"}</div>
            <div class="note-preview">${preview}</div>
            <div class="note-meta">
              <span>${dateStr}</span>
              ${note.categories && note.categories.length > 0 ? `<span>${note.categories.length} categories</span>` : ""}
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
  
  filterChips.innerHTML = categories.map(category => `
    <button class="filter-chip ${currentFilter === category.id ? 'active' : ''}" 
            data-filter="${category.id}">
      ${category.name}
    </button>
  `).join("");
  
  // Add event listeners to filter chips
  filterChips.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      currentFilter = e.target.dataset.filter;
      renderNotes();
    });
  });
}

// UI functions
function showNotesPage() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const notesPage = document.getElementById("notesPage");
  if (notesPage) notesPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "NOTES";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.add("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.remove("hidden");
}

function showEditorPage() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const editorPage = document.getElementById("editorPage");
  if (editorPage) editorPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "EDIT NOTE";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
}

function showSettingsPage() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) settingsPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "SETTINGS";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
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
  
  updateCategoryChips();
  updateShareButtonVisibility();
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
  } else {
    shareBtn.style.display = "none";
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
    showToast(t("guestCannotShare"), "warning");
    return;
  }
  
  const shareModal = document.getElementById("shareModal");
  if (shareModal) shareModal.classList.add("show");
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
  currentListType = listType;
  hideListTypeModal();
  
  const listSection = document.getElementById("listSection");
  if (listSection) listSection.classList.remove("hidden");
  
  updateListSection();
}

function updateListSection() {
  // List functionality implementation
  const listItems = document.getElementById("listItems");
  if (!listItems || !currentNote) return;
  
  if (!currentNote.list) currentNote.list = [];
  
  listItems.innerHTML = currentNote.list.map((item, index) => `
    <div class="list-item ${item.completed ? 'completed' : ''}">
      ${currentListType === 'checklist' ? `<input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleListItem(${index})" />` : ''}
      <input type="text" value="${item.text || ''}" onchange="updateListItem(${index}, this.value)" />
      <button class="btn-icon" onclick="deleteListItem(${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join("");
}

function addListItem() {
  if (!currentNote) return;
  
  if (!currentNote.list) currentNote.list = [];
  
  currentNote.list.push({
    text: "",
    completed: false
  });
  
  updateListSection();
  saveCurrentNote();
}

function updateListItem(index, value) {
  if (!currentNote?.list?.[index]) return;
  
  currentNote.list[index].text = value;
  saveCurrentNote();
}

function toggleListItem(index) {
  if (!currentNote?.list?.[index]) return;
  
  currentNote.list[index].completed = !currentNote.list[index].completed;
  updateListSection();
  saveCurrentNote();
}

function deleteListItem(index) {
  if (!currentNote?.list) return;
  
  currentNote.list.splice(index, 1);
  updateListSection();
  saveCurrentNote();
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

// Sharing functions
async function searchUsers(query) {
  // Implementation for user search
  const searchResults = document.getElementById("searchResults");
  if (!searchResults) return;
  
  if (query.length < 2) {
    searchResults.classList.remove("show");
    return;
  }
  
  // Placeholder for actual user search implementation
  searchResults.classList.add("show");
  searchResults.innerHTML = "<div class='user-search-item'>Search functionality requires Firebase setup</div>";
}

async function sendInvitations() {
  // Implementation for sending invitations
  showToast("Invitation feature requires Firebase setup", "warning");
  hideShareModal();
}

function selectUser(uid, name, username) {
  // Implementation for selecting users for sharing
}

function removeSelectedUser(uid) {
  // Implementation for removing selected users
}

async function saveUsername() {
  const usernameInput = document.getElementById("usernameInput");
  if (!usernameInput) return;
  
  const username = usernameInput.value.trim();
  if (!validateUsername(username)) {
    showToast(t("usernameInvalid"), "error");
    return;
  }
  
  // Implementation for saving username
  hideUsernameModal();
  showToast("Username saved", "success");
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
window.deleteImage = deleteImage;
window.selectUser = selectUser;
window.removeSelectedUser = removeSelectedUser;
window.showUsernameModal = showUsernameModal;

// Export for window global
window.renderNotes = renderNotes;
window.renderCategories = renderCategories;