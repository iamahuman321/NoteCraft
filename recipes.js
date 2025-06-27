// Recipe management functionality
let recipes = [];
let currentRecipe = null;
let isAppInitialized = false;

// Initialize the recipes page
function initializePage() {
  console.log('Initializing recipes page...');
  
  // Wait for Firebase to be ready if available
  if (typeof window.firebase !== 'undefined') {
    waitForFirebase();
  } else {
    // Load from localStorage immediately if Firebase not available
    loadLocalRecipes();
    setupEventListeners();
    renderRecipes();
    isAppInitialized = true;
    console.log('Recipes page initialized without Firebase');
  }
}

function waitForFirebase() {
  function checkAndRender() {
    if (window.authFunctions && window.authFunctions.getCurrentUser) {
      const user = window.authFunctions.getCurrentUser();
      if (user) {
        console.log('User authenticated, loading recipes from Firebase');
        loadUserRecipes();
      } else {
        console.log('No user authenticated, using local storage');
        loadLocalRecipes();
      }
      setupEventListeners();
      renderRecipes();
      updateSidebarAuth();
      isAppInitialized = true;
    } else {
      setTimeout(checkAndRender, 100);
    }
  }
  checkAndRender();
}

// Load recipes from localStorage
function loadLocalRecipes() {
  try {
    const savedRecipes = localStorage.getItem('recipes');
    if (savedRecipes) {
      recipes = JSON.parse(savedRecipes);
      console.log('Loaded', recipes.length, 'recipes from localStorage');
    }
  } catch (error) {
    console.error('Error loading recipes from localStorage:', error);
    recipes = [];
  }
}

// Load recipes from Firebase for authenticated users
async function loadUserRecipes() {
  if (!window.database || !window.authFunctions) {
    loadLocalRecipes();
    return;
  }

  const user = window.authFunctions.getCurrentUser();
  if (!user) {
    loadLocalRecipes();
    return;
  }

  try {
    const snapshot = await window.database.ref(`users/${user.uid}/recipes`).once('value');
    const firebaseRecipes = snapshot.val();
    
    if (firebaseRecipes) {
      recipes = Object.values(firebaseRecipes);
      console.log('Loaded', recipes.length, 'recipes from Firebase');
    } else {
      // Migrate localStorage data to Firebase if user just signed in
      loadLocalRecipes();
      if (recipes.length > 0) {
        await saveRecipesToFirebase();
      }
    }
  } catch (error) {
    console.error('Error loading recipes from Firebase:', error);
    loadLocalRecipes();
  }
}

// Save recipes to Firebase
async function saveRecipesToFirebase() {
  if (!window.database || !window.authFunctions) return;

  const user = window.authFunctions.getCurrentUser();
  if (!user) return;

  try {
    const recipesObject = {};
    recipes.forEach(recipe => {
      recipesObject[recipe.id] = recipe;
    });
    
    await window.database.ref(`users/${user.uid}/recipes`).set(recipesObject);
    console.log('Recipes saved to Firebase successfully');
  } catch (error) {
    console.error('Error saving recipes to Firebase:', error);
  }
}

// Save recipes to localStorage
function saveRecipesToLocal() {
  try {
    localStorage.setItem('recipes', JSON.stringify(recipes));
  } catch (error) {
    console.error('Error saving recipes to localStorage:', error);
  }
}

// Save recipes to both sources
async function saveRecipes() {
  saveRecipesToLocal();
  if (window.authFunctions?.getCurrentUser()) {
    await saveRecipesToFirebase();
  }
}

// Setup event listeners
function setupEventListeners() {
  // Auth state change listener
  if (window.firebase && window.firebase.auth) {
    window.firebase.auth().onAuthStateChanged((user) => {
      updateSidebarAuth();
      if (user && isAppInitialized) {
        loadUserRecipes().then(() => renderRecipes());
      }
    });
  }
}

// Update sidebar authentication display
function updateSidebarAuth() {
  const userInfo = document.getElementById('userInfo');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const authButtons = document.getElementById('authButtons');
  const signedInOptions = document.getElementById('signedInOptions');

  if (window.authFunctions?.getCurrentUser) {
    const user = window.authFunctions.getCurrentUser();
    if (user) {
      userName.textContent = user.displayName || 'User';
      userEmail.textContent = user.email || '';
      authButtons.style.display = 'none';
      signedInOptions.style.display = 'block';
    } else {
      userName.textContent = 'Guest User';
      userEmail.textContent = 'Continue as guest';
      authButtons.style.display = 'block';
      signedInOptions.style.display = 'none';
    }
  }
}

// Toggle sidebar
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

// Close sidebar
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

// Show shopping page (redirect to main app)
function showShoppingPage() {
  window.location.href = 'index.html#shopping';
}

// Create new recipe
function createNewRecipe() {
  currentRecipe = {
    id: generateId(),
    title: '',
    description: '',
    ingredients: [],
    method: [],
    media: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  showRecipeEditor();
}

// Show recipe editor
function showRecipeEditor() {
  document.getElementById('recipesView').style.display = 'none';
  document.getElementById('recipeEditor').style.display = 'block';
  
  if (currentRecipe) {
    populateRecipeEditor();
    if (currentRecipe.title) {
      document.getElementById('deleteRecipeBtn').style.display = 'block';
    }
  }
}

// Show recipes view
function showRecipesView() {
  document.getElementById('recipesView').style.display = 'block';
  document.getElementById('recipeEditor').style.display = 'none';
  currentRecipe = null;
  
  renderRecipes();
}

// Populate recipe editor with current recipe data
function populateRecipeEditor() {
  if (!currentRecipe) return;
  
  document.getElementById('recipeTitleInput').value = currentRecipe.title || '';
  document.getElementById('recipeDescriptionInput').value = currentRecipe.description || '';
  
  renderIngredients();
  renderMethodSteps();
  renderMediaGallery();
}

// Render ingredients
function renderIngredients() {
  const ingredientsList = document.getElementById('ingredientsList');
  ingredientsList.innerHTML = '';
  
  if (!currentRecipe.ingredients || currentRecipe.ingredients.length === 0) {
    addIngredient();
    return;
  }
  
  currentRecipe.ingredients.forEach((ingredient, index) => {
    const ingredientItem = document.createElement('div');
    ingredientItem.className = 'ingredient-item';
    ingredientItem.innerHTML = `
      <input type="text" value="${escapeHtml(ingredient)}" placeholder="Ingredient" 
             onchange="updateIngredient(${index}, this.value)" class="form-input">
      <button class="remove-btn" onclick="removeIngredient(${index})">
        <i class="fas fa-times"></i>
      </button>
    `;
    ingredientsList.appendChild(ingredientItem);
  });
}

// Add ingredient
function addIngredient() {
  if (!currentRecipe.ingredients) currentRecipe.ingredients = [];
  currentRecipe.ingredients.push('');
  renderIngredients();
  
  // Focus on the new ingredient input
  const inputs = document.querySelectorAll('#ingredientsList input');
  if (inputs.length > 0) {
    inputs[inputs.length - 1].focus();
  }
}

// Update ingredient
function updateIngredient(index, value) {
  if (currentRecipe.ingredients) {
    currentRecipe.ingredients[index] = value;
  }
}

// Remove ingredient
function removeIngredient(index) {
  if (currentRecipe.ingredients) {
    currentRecipe.ingredients.splice(index, 1);
    renderIngredients();
  }
}

// Render method steps
function renderMethodSteps() {
  const methodSteps = document.getElementById('methodSteps');
  methodSteps.innerHTML = '';
  
  if (!currentRecipe.method || currentRecipe.method.length === 0) {
    addMethodStep();
    return;
  }
  
  currentRecipe.method.forEach((step, index) => {
    const stepItem = document.createElement('div');
    stepItem.className = 'method-step';
    stepItem.innerHTML = `
      <div class="step-number">${index + 1}</div>
      <textarea placeholder="Method step" onchange="updateMethodStep(${index}, this.value)" 
                class="form-textarea" rows="2">${escapeHtml(step)}</textarea>
      <button class="remove-btn" onclick="removeMethodStep(${index})">
        <i class="fas fa-times"></i>
      </button>
    `;
    methodSteps.appendChild(stepItem);
  });
}

// Add method step
function addMethodStep() {
  if (!currentRecipe.method) currentRecipe.method = [];
  currentRecipe.method.push('');
  renderMethodSteps();
  
  // Focus on the new step textarea
  const textareas = document.querySelectorAll('#methodSteps textarea');
  if (textareas.length > 0) {
    textareas[textareas.length - 1].focus();
  }
}

// Update method step
function updateMethodStep(index, value) {
  if (currentRecipe.method) {
    currentRecipe.method[index] = value;
  }
}

// Remove method step
function removeMethodStep(index) {
  if (currentRecipe.method) {
    currentRecipe.method.splice(index, 1);
    renderMethodSteps();
  }
}

// Handle media upload
function handleMediaUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  if (!currentRecipe.media) currentRecipe.media = [];
  
  for (let file of files) {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      showToast('File too large. Maximum size is 10MB.', 'error');
      continue;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const mediaItem = {
        id: generateId(),
        name: file.name,
        type: file.type,
        data: e.target.result,
        size: file.size,
        addedAt: Date.now()
      };
      
      currentRecipe.media.push(mediaItem);
      renderMediaGallery();
    };
    reader.readAsDataURL(file);
  }
  
  // Clear the input
  event.target.value = '';
}

// Render media gallery
function renderMediaGallery() {
  const mediaGallery = document.getElementById('mediaGallery');
  mediaGallery.innerHTML = '';
  
  if (!currentRecipe.media || currentRecipe.media.length === 0) {
    return;
  }
  
  currentRecipe.media.forEach((media, index) => {
    const mediaItem = document.createElement('div');
    mediaItem.className = 'media-item';
    
    const isVideo = media.type.startsWith('video/');
    const mediaElement = isVideo ? 
      `<video src="${media.data}" controls></video>` :
      `<img src="${media.data}" alt="${media.name}">`;
    
    mediaItem.innerHTML = `
      <div class="media-preview" onclick="showMediaViewer('${media.id}')">
        ${mediaElement}
        <div class="media-overlay">
          <i class="fas fa-${isVideo ? 'play' : 'expand'}"></i>
        </div>
      </div>
      <div class="media-info">
        <span class="media-name">${escapeHtml(media.name)}</span>
        <button class="remove-media-btn" onclick="removeMedia(${index})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    
    mediaGallery.appendChild(mediaItem);
  });
}

// Remove media
function removeMedia(index) {
  if (currentRecipe.media) {
    currentRecipe.media.splice(index, 1);
    renderMediaGallery();
  }
}

// Show media viewer
function showMediaViewer(mediaId) {
  const media = currentRecipe.media.find(m => m.id === mediaId);
  if (!media) return;
  
  const modal = document.getElementById('mediaViewerModal');
  const content = document.getElementById('mediaContent');
  
  const isVideo = media.type.startsWith('video/');
  content.innerHTML = isVideo ?
    `<video src="${media.data}" controls autoplay></video>` :
    `<img src="${media.data}" alt="${media.name}">`;
  
  modal.style.display = 'flex';
}

// Close media viewer
function closeMediaViewer() {
  document.getElementById('mediaViewerModal').style.display = 'none';
}

// Save current recipe
async function saveCurrentRecipe() {
  if (!currentRecipe) return;
  
  // Get current values from form
  currentRecipe.title = document.getElementById('recipeTitleInput').value.trim();
  currentRecipe.description = document.getElementById('recipeDescriptionInput').value.trim();
  
  if (!currentRecipe.title) {
    showToast('Please enter a recipe title', 'error');
    return;
  }
  
  // Clean up empty ingredients and method steps
  currentRecipe.ingredients = (currentRecipe.ingredients || []).filter(ingredient => ingredient.trim());
  currentRecipe.method = (currentRecipe.method || []).filter(step => step.trim());
  
  currentRecipe.updatedAt = Date.now();
  
  // Add or update recipe in the list
  const existingIndex = recipes.findIndex(r => r.id === currentRecipe.id);
  if (existingIndex >= 0) {
    recipes[existingIndex] = currentRecipe;
  } else {
    recipes.push(currentRecipe);
  }
  
  // Save to storage
  await saveRecipes();
  
  showToast('Recipe saved successfully!', 'success');
  showRecipesView();
}

// Delete current recipe
function deleteCurrentRecipe() {
  if (!currentRecipe || !currentRecipe.title) return;
  
  document.getElementById('deleteRecipeModal').style.display = 'flex';
}

// Hide delete recipe modal
function hideDeleteRecipeModal() {
  document.getElementById('deleteRecipeModal').style.display = 'none';
}

// Confirm delete recipe
async function confirmDeleteRecipe() {
  if (!currentRecipe) return;
  
  const index = recipes.findIndex(r => r.id === currentRecipe.id);
  if (index >= 0) {
    recipes.splice(index, 1);
    await saveRecipes();
    showToast('Recipe deleted successfully', 'success');
  }
  
  hideDeleteRecipeModal();
  showRecipesView();
}

// Render recipes grid
function renderRecipes() {
  const recipesGrid = document.getElementById('recipesGrid');
  const noRecipes = document.getElementById('noRecipes');
  
  if (!recipes || recipes.length === 0) {
    recipesGrid.innerHTML = '';
    noRecipes.style.display = 'block';
    return;
  }
  
  noRecipes.style.display = 'none';
  
  const filteredRecipes = getFilteredRecipes();
  
  if (filteredRecipes.length === 0) {
    recipesGrid.innerHTML = '<div class="no-results">No recipes match your search</div>';
    return;
  }
  
  recipesGrid.innerHTML = filteredRecipes.map(recipe => `
    <div class="recipe-card" onclick="editRecipe('${recipe.id}')">
      <div class="recipe-media">
        ${recipe.media && recipe.media.length > 0 ? 
          `<img src="${recipe.media[0].data}" alt="${recipe.title}">` :
          '<div class="recipe-placeholder"><i class="fas fa-utensils"></i></div>'
        }
      </div>
      <div class="recipe-content">
        <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
        <p class="recipe-description">${escapeHtml(recipe.description || '').substring(0, 100)}${recipe.description && recipe.description.length > 100 ? '...' : ''}</p>
        <div class="recipe-meta">
          <span class="recipe-ingredients">
            <i class="fas fa-list"></i>
            ${(recipe.ingredients || []).length} ingredients
          </span>
          <span class="recipe-steps">
            <i class="fas fa-clipboard-list"></i>
            ${(recipe.method || []).length} steps
          </span>
        </div>
      </div>
    </div>
  `).join('');
}

// Edit recipe
function editRecipe(recipeId) {
  currentRecipe = recipes.find(r => r.id === recipeId);
  if (currentRecipe) {
    showRecipeEditor();
  }
}

// Handle recipe search
function handleRecipeSearch() {
  const searchInput = document.getElementById('recipeSearchInput');
  const clearBtn = document.getElementById('clearRecipeSearch');
  
  if (searchInput.value.trim()) {
    clearBtn.style.display = 'block';
  } else {
    clearBtn.style.display = 'none';
  }
  
  renderRecipes();
}

// Clear recipe search
function clearRecipeSearch() {
  document.getElementById('recipeSearchInput').value = '';
  document.getElementById('clearRecipeSearch').style.display = 'none';
  renderRecipes();
}

// Get filtered recipes based on search
function getFilteredRecipes() {
  const searchTerm = document.getElementById('recipeSearchInput')?.value?.toLowerCase().trim();
  
  if (!searchTerm) {
    return recipes;
  }
  
  return recipes.filter(recipe => {
    return (
      recipe.title.toLowerCase().includes(searchTerm) ||
      recipe.description.toLowerCase().includes(searchTerm) ||
      (recipe.ingredients || []).some(ingredient => 
        ingredient.toLowerCase().includes(searchTerm)
      ) ||
      (recipe.method || []).some(step => 
        step.toLowerCase().includes(searchTerm)
      )
    );
  });
}

// Utility functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePage);