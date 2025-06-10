// Categories page JavaScript for category.html

// Load categories and notes from localStorage or initialize with default
let categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }]
const notes = JSON.parse(localStorage.getItem("notes")) || []

function t(key) {
  const translations = {
    noCategories: "You don't have any categories yet",
    categoryAdded: "Category added",
    categoryDeleted: "Category deleted",
    noNotes: "No notes in this category",
  }
  return translations[key] || key
}

function showToast(message) {
  const toast = document.getElementById("toast")
  const toastMessage = document.getElementById("toastMessage")
  toastMessage.textContent = message
  toast.classList.add("show")
  setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}

function saveData() {
  localStorage.setItem("categories", JSON.stringify(categories))
}

// Open note editor in SPA or alert if not supported
function openNoteEditor(noteId) {
  // Try to open note in SPA if available
  if (window.opener && window.opener.editNote) {
    window.opener.editNote(notes.find((n) => n.id === noteId))
    window.close()
  } else {
    alert("Note editor is not available in this context.")
  }
}

function renderCategories() {
  const categoriesList = document.getElementById("categoriesList")

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
  const name = input.value.trim()

  if (!name) return

  if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    showToast("Category already exists")
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
  categories = categories.filter((c) => c.id !== categoryId)
  saveData()
  renderCategories()
  showToast(t("categoryDeleted"))
}

function generateId() {
  return Math.random().toString(36).substr(2, 9)
}

// Settings button click to go back to previous page or referrer
function setupSettingsButton() {
  const settingsBtn = document.getElementById("settingsBtn")
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (document.referrer) {
        window.location.href = document.referrer
      } else {
        window.history.back()
      }
    })
  }
}

// Event listeners
function setupEventListeners() {
  document.getElementById("addCategoryFormBtn").addEventListener("click", addCategory)
  document.getElementById("categoryInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addCategory()
    }
  })
  setupSettingsButton()
}

// Initialize page
function init() {
  renderCategories()
  setupEventListeners()
}

document.addEventListener("DOMContentLoaded", init)
