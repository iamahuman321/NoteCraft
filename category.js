// Categories page JavaScript for category.html

// Global variables
let categories = [{ id: "all", name: "All" }]
let notes = JSON.parse(localStorage.getItem("notes")) || []

// Initialize the page with CategoryManager
async function initializePage() {
  console.log("Initializing category page...")
  
  // Load notes from localStorage
  notes = JSON.parse(localStorage.getItem("notes")) || []
  console.log("Loaded notes:", notes.length)
  
  // Wait for CategoryManager to be available
  if (window.CategoryManager) {
    try {
      await window.CategoryManager.init()
      categories = window.CategoryManager.getCategories()
      renderCategories()
      console.log("Categories loaded via CategoryManager:", categories.length)
    } catch (error) {
      console.error("Error initializing CategoryManager:", error)
      // Fallback to localStorage
      categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }]
      renderCategories()
    }
  } else {
    // Retry if CategoryManager not ready
    setTimeout(initializePage, 100)
  }
}



// Start initialization when page loads
document.addEventListener("DOMContentLoaded", () => {
  initializePage()
  setupEventListeners()
})

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
  toast.classList.add("open")
  setTimeout(() => {
    toast.classList.remove("open")
  }, 3000)
}

function saveData() {
  // Save to localStorage and sessionStorage
  localStorage.setItem("categories", JSON.stringify(categories))
  localStorage.setItem("categoriesLastModified", Date.now().toString())
  sessionStorage.setItem("categoriesBackup", JSON.stringify(categories))
  
  // Force update global categories if available
  if (window.categories) {
    window.categories.length = 0
    window.categories.push(...categories)
  }
  
  // Immediately save to Firebase - this is critical
  if (window.authFunctions && typeof window.authFunctions.getCurrentUser === 'function') {
    const currentUser = window.authFunctions.getCurrentUser()
    const isGuest = window.authFunctions.isUserGuest()
    
    if (currentUser && !isGuest && window.database) {
      // Save directly to Firebase immediately
      const userRef = window.database.ref(`users/${currentUser.uid}`)
      userRef.update({
        categories: categories,
        categoriesLastModified: Date.now(),
        lastUpdated: Date.now()
      }).then(() => {
        console.log("Categories saved to Firebase successfully")
      }).catch((error) => {
        console.error("Error saving categories to Firebase:", error)
      })
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

  console.log("Rendering categories:", userCategories.length)
  console.log("Total notes available:", notes.length)

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

        console.log(`Category ${category.name} has ${notesInCategory.length} notes`)

        // Render notes list or empty message
        const notesHtml =
          notesInCategory.length === 0
            ? `<div class="empty-state"><p>${t("noNotes")}</p></div>`
            : `<ul class="notes-list">${notesInCategory.map((note) => `<li class="note-item" onclick="openNoteEditor('${note.id}')">${escapeHtml(note.title || "Untitled")}</li>`).join("")}</ul>`

        return `
          <div class="category-item">
            <div class="category-header" onclick="toggleCategoryNotes(this)">
              <span class="category-name">${escapeHtml(category.name)}</span>
              <span class="note-count">(${notesInCategory.length})</span>
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

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
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

async function addCategory() {
  const input = document.getElementById("categoryInput")
  if (!input) return
  
  const name = input.value.trim()
  if (!name) return

  if (window.CategoryManager) {
    const success = await window.CategoryManager.addCategory(name)
    if (success) {
      categories = window.CategoryManager.getCategories()
      renderCategories()
      input.value = ""
      showToast(t("categoryAdded"))
    } else {
      showToast(t("categoryExists"))
    }
  } else {
    // Fallback to original method
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      showToast(t("categoryExists"))
      return
    }

    const newCategory = {
      id: generateId(),
      name: name,
      createdAt: Date.now()
    }

    categories.push(newCategory)
    saveData()
    renderCategories()
    input.value = ""
    showToast(t("categoryAdded"))
  }
}

async function deleteCategoryItem(categoryId) {
  // Don't allow deletion of "all" category
  if (categoryId === "all") return
  
  if (window.CategoryManager) {
    const success = await window.CategoryManager.deleteCategory(categoryId)
    if (success) {
      categories = window.CategoryManager.getCategories()
      renderCategories()
      showToast(t("categoryDeleted"))
    }
  } else {
    // Fallback to original method
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

// Global functions for inline event handlers
window.toggleCategoryNotes = toggleCategoryNotes
window.deleteCategoryItem = deleteCategoryItem
window.openNoteEditor = openNoteEditor
