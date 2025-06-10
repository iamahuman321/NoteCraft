// Categories page JavaScript for category.html

// Load categories and notes from localStorage or initialize with default
let categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }]
const notes = JSON.parse(localStorage.getItem("notes")) || []

// Translations
const translations = {
  en: {
    noCategories: "You don't have any categories yet",
    categoryAdded: "Category added",
    categoryDeleted: "Category deleted",
    noNotes: "No notes in this category",
    categoryExists: "Category already exists"
  }
}

let currentLanguage = localStorage.getItem("language") || "en"

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key
}

function showToast(message) {
  const toast = document.getElementById("toast")
  const toastMessage = document.getElementById("toastMessage")
  
  if (!toast || !toastMessage) return
  
  toastMessage.textContent = message
  toast.classList.add("show")
  setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}

function saveData() {
  localStorage.setItem("categories", JSON.stringify(categories))
  
  // Save to Firebase if user is authenticated and not a guest
  if (window.authFunctions && typeof window.authFunctions.getCurrentUser === 'function') {
    const currentUser = window.authFunctions.getCurrentUser()
    const isGuest = window.authFunctions.isUserGuest()
    
    if (currentUser && !isGuest) {
      window.authFunctions.saveUserData()
    }
  }
}

// Open note editor in SPA or alert if not supported
function openNoteEditor(noteId) {
  // Try to open note in SPA if available
  if (window.opener && window.opener.editNote) {
    window.opener.editNote(notes.find((n) => n.id === noteId))
    window.close()
  } else {
    // Navigate to main page with note ID
    localStorage.setItem('openNoteId', noteId)
    window.location.href = 'index.html'
  }
}

function renderCategories() {
  const categoriesList = document.getElementById("categoriesList")
  
  if (!categoriesList) return

  const userCategories = categories.filter((c) => c.id !== "all")

  if (userCategories.length === 0) {
    categoriesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder"></i>
        <p>${t("noCategories")}</p>
      </div>
    `
  } else {
    categoriesList.innerHTML = userCategories
      .map((category) => {
        // Find notes in this category
        const notesInCategory = notes.filter(
          (note) => Array.isArray(note.categories) && note.categories.includes(category.id),
        )

        // Render notes list or empty message
        const notesHtml =
          notesInCategory.length === 0
            ? `<div class="empty-state"><p>${t("noNotes")}</p></div>`
            : `<ul class="notes-list">${notesInCategory.map((note) => `<li class="note-item" onclick="openNoteEditor('${note.id}')">${note.title || "Untitled"}</li>`).join("")}</ul>`

        return `
          <div class="category-item">
            <div class="category-header" onclick="toggleCategoryNotes(this)">
              <span class="category-name">${category.name}</span>
              <button class="category-delete" onclick="event.stopPropagation(); deleteCategoryItem('${category.id}')" title="Delete category">
                <i class="fas fa-times"></i>
              </button>
              <span class="toggle-icon">▼</span>
            </div>
            <div class="category-notes" style="display:none;">
              ${notesHtml}
            </div>
          </div>
        `
      })
      .join("")
  }
}

function toggleCategoryNotes(headerElement) {
  const notesDiv = headerElement.nextElementSibling
  if (!notesDiv) return
  if (notesDiv.style.display === "none") {
    notesDiv.style.display = "block"
    headerElement.querySelector(".toggle-icon").textContent = "▲"
  } else {
    notesDiv.style.display = "none"
    headerElement.querySelector(".toggle-icon").textContent = "▼"
  }
}

function addCategory() {
  const input = document.getElementById("categoryInput")
  if (!input) return
  
  const name = input.value.trim()

  if (!name) return

  if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    showToast(t("categoryExists"))
    return
  }

  const newCategory = {
    id: generateId(),
    name: name,
  }

  categories.push(newCategory)
  saveData()
  renderCategories()
  input.value = ""
  showToast(t("categoryAdded"))
}

function deleteCategoryItem(categoryId) {
  // Don't allow deletion of "all" category
  if (categoryId === "all") return
  
  categories = categories.filter((c) => c.id !== categoryId)
  
  // Remove category from all notes
  const updatedNotes = notes.map(note => {
    if (note.categories && note.categories.includes(categoryId)) {
      note.categories = note.categories.filter(catId => catId !== categoryId)
    }
    return note
  })
  
  localStorage.setItem("notes", JSON.stringify(updatedNotes))
  
  saveData()
  renderCategories()
  showToast(t("categoryDeleted"))
}

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
}

// Hamburger menu functions
function setupHamburgerMenu() {
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const sidebarClose = document.getElementById("sidebarClose");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", toggleSidebar);
  }
  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }
}

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

// Event listeners
function setupEventListeners() {
  const addBtn = document.getElementById("addCategoryFormBtn")
  const input = document.getElementById("categoryInput")
  
  if (addBtn) {
    addBtn.addEventListener("click", addCategory)
  }
  
  if (input) {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addCategory()
      }
    })
  }
  
  setupHamburgerMenu()
}

// Initialize page
function init() {
  // Wait for potential Firebase initialization
  setTimeout(() => {
    // Reload categories from localStorage in case they were updated
    categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }]
    
    renderCategories()
    setupEventListeners()
  }, 100)
}

// Global functions for inline event handlers
window.toggleCategoryNotes = toggleCategoryNotes
window.deleteCategoryItem = deleteCategoryItem
window.openNoteEditor = openNoteEditor

document.addEventListener("DOMContentLoaded", init)
