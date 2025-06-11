// Unified Category Management System
window.CategoryManager = {
  // Internal storage
  _categories: [{ id: "all", name: "All" }],
  _initialized: false,
  
  // Initialize the category manager
  async init() {
    if (this._initialized) return;
    
    // Try to load from multiple sources
    await this._loadFromBestSource();
    this._initialized = true;
    console.log("CategoryManager initialized with", this._categories.length, "categories");
  },
  
  // Load categories from the best available source
  async _loadFromBestSource() {
    const sources = [
      this._loadFromFirebase,
      this._loadFromLocalStorage,
      this._loadFromSessionStorage
    ];
    
    let bestCategories = [{ id: "all", name: "All" }];
    let maxLength = 1;
    
    for (const loadFn of sources) {
      try {
        const cats = await loadFn.call(this);
        if (cats && Array.isArray(cats) && cats.length > maxLength) {
          bestCategories = cats;
          maxLength = cats.length;
        }
      } catch (error) {
        console.warn("Failed to load from source:", error);
      }
    }
    
    this._categories = bestCategories;
    return bestCategories;
  },
  
  // Load from Firebase
  async _loadFromFirebase() {
    if (!window.database || !window.authFunctions) return null;
    
    const currentUser = window.authFunctions.getCurrentUser();
    const isGuest = window.authFunctions.isUserGuest();
    
    if (!currentUser || isGuest) return null;
    
    const snapshot = await window.database.ref(`users/${currentUser.uid}`).once('value');
    const userData = snapshot.val();
    
    return userData?.categories || null;
  },
  
  // Load from localStorage
  _loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem("categories");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  
  // Load from sessionStorage
  _loadFromSessionStorage() {
    try {
      const stored = sessionStorage.getItem("categoriesBackup");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  
  // Get all categories
  getCategories() {
    return [...this._categories];
  },
  
  // Add a new category
  async addCategory(name) {
    if (!name || this._categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return false;
    }
    
    const newCategory = {
      id: this._generateId(),
      name: name.trim(),
      createdAt: Date.now()
    };
    
    this._categories.push(newCategory);
    await this._saveToAllSources();
    return true;
  },
  
  // Delete a category
  async deleteCategory(categoryId) {
    if (categoryId === "all") return false;
    
    this._categories = this._categories.filter(c => c.id !== categoryId);
    await this._saveToAllSources();
    return true;
  },
  
  // Save to all storage sources
  async _saveToAllSources() {
    const categoriesJson = JSON.stringify(this._categories);
    const timestamp = Date.now();
    
    // Save to localStorage
    localStorage.setItem("categories", categoriesJson);
    localStorage.setItem("categoriesLastModified", timestamp.toString());
    
    // Save to sessionStorage
    sessionStorage.setItem("categoriesBackup", categoriesJson);
    
    // Update global variables
    if (window.categories) {
      window.categories.length = 0;
      window.categories.push(...this._categories);
    }
    
    // Save to Firebase
    await this._saveToFirebase();
  },
  
  // Save to Firebase
  async _saveToFirebase() {
    if (!window.database || !window.authFunctions) return;
    
    const currentUser = window.authFunctions.getCurrentUser();
    const isGuest = window.authFunctions.isUserGuest();
    
    if (!currentUser || isGuest) return;
    
    try {
      await window.database.ref(`users/${currentUser.uid}`).update({
        categories: this._categories,
        categoriesLastModified: Date.now(),
        lastUpdated: Date.now()
      });
      console.log("Categories saved to Firebase successfully");
    } catch (error) {
      console.error("Error saving categories to Firebase:", error);
    }
  },
  
  // Generate unique ID
  _generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
};