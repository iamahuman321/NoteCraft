// Shared Notes Page JavaScript
// currentUser is managed by firebase-config.js
let invitations = [];
let sharedNotes = [];

// Translations
const translations = {
  en: {
    noInvitations: "No pending invitations",
    noSharedNotes: "No shared notes yet",
    invitationAccepted: "Invitation accepted",
    invitationDeclined: "Invitation declined",
    errorAccepting: "Error accepting invitation",
    errorDeclining: "Error declining invitation",
    errorLoading: "Error loading data",
    offlineWarning: "This feature requires internet connection",
    signInRequired: "Please sign in to view shared notes"
  }
};

let currentLanguage = localStorage.getItem("language") || "en";

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  initializePage();
});

function initializePage() {
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
    console.log("Firebase ready for share page");
    
    // Always setup event listeners first
    setupEventListeners();
    
    const currentUser = window.authFunctions.getCurrentUser();
    const isGuest = window.authFunctions.isUserGuest();
    
    if (isGuest || !currentUser) {
      showSignInRequired();
      return;
    }

    loadSharedContent();
    
    // Listen for auth state changes
    if (window.auth) {
      window.auth.onAuthStateChanged((user) => {
        window.currentUser = user;
        const isGuest = window.authFunctions.isUserGuest();
        
        if (isGuest || !user) {
          showSignInRequired();
        } else {
          loadSharedContent();
        }
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

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", toggleSidebar);
  }
  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  // Navigation links
  const navNotes = document.getElementById("navNotes");
  const navCategories = document.getElementById("navCategories");
  const navSettings = document.getElementById("navSettings");
  const navSignIn = document.getElementById("navSignIn");

  if (navNotes) {
    navNotes.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "Note/index.html";
    });
  }

  if (navCategories) {
    navCategories.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "Note/category.html";
    });
  }

  if (navSettings) {
    navSettings.addEventListener("click", (e) => {
      e.preventDefault();
      // Show settings or navigate as needed
    });
  }

  if (navSignIn) {
    navSignIn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "Note/login.html";
    });
  }
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  console.log("Toggle sidebar clicked"); // Debug log
  
  if (sidebar && hamburgerBtn) {
    sidebar.classList.toggle("open");
    hamburgerBtn.classList.toggle("active");
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  if (sidebar && hamburgerBtn) {
    sidebar.classList.remove("open");
    hamburgerBtn.classList.remove("active");
  }
}

function showSignInRequired() {
  const container = document.querySelector('.shared-container');
  container.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-sign-in-alt"></i>
      <p>${t("signInRequired")}</p>
      <a href="Note/login.html" class="btn btn-primary" style="margin-top: 1rem;">Sign In</a>
    </div>
  `;
}

async function loadSharedContent() {
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;

  try {
    await Promise.all([
      loadInvitations(),
      loadSharedNotes()
    ]);
    
    renderInvitations();
    renderSharedNotes();
    
  } catch (error) {
    console.error("Error loading shared content:", error);
    showToast(t("errorLoading"), "error");
  }
}

async function loadInvitations() {
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;

  try {
    const snapshot = await window.database.ref(`users/${currentUser.uid}/invitations`).once('value');
    const invitationsData = snapshot.val() || {};
    
    invitations = Object.values(invitationsData).filter(inv => inv.status === 'pending');
    
    // Cache in localStorage for offline access
    localStorage.setItem('cachedInvitations', JSON.stringify(invitations));
    
  } catch (error) {
    console.error("Error loading invitations:", error);
    
    // Try to load from cache if offline
    const cached = localStorage.getItem('cachedInvitations');
    if (cached) {
      invitations = JSON.parse(cached);
    }
  }
}

async function loadSharedNotes() {
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;

  try {
    const snapshot = await window.database.ref('sharedNotes').orderByChild('collaborators').once('value');
    const sharedNotesData = snapshot.val() || {};
    
    sharedNotes = Object.entries(sharedNotesData)
      .filter(([id, note]) => 
        note.owner === currentUser.uid || 
        (note.collaborators && note.collaborators[currentUser.uid])
      )
      .map(([id, note]) => ({ id, ...note }));
    
    // Cache in localStorage for offline access
    localStorage.setItem('cachedSharedNotes', JSON.stringify(sharedNotes));
    
  } catch (error) {
    console.error("Error loading shared notes:", error);
    
    // Try to load from cache if offline
    const cached = localStorage.getItem('cachedSharedNotes');
    if (cached) {
      sharedNotes = JSON.parse(cached);
    }
  }
}

function renderInvitations() {
  const invitationsList = document.getElementById('invitationsList');
  const invitationsEmpty = document.getElementById('invitationsEmpty');
  
  if (!invitations || invitations.length === 0) {
    invitationsList.innerHTML = '';
    invitationsList.appendChild(invitationsEmpty);
    return;
  }
  
  invitationsEmpty.style.display = 'none';
  
  invitationsList.innerHTML = invitations.map(invitation => `
    <div class="invitation-card">
      <div class="invitation-header">
        <div class="invitation-title">${invitation.noteTitle || 'Untitled Note'}</div>
        <small class="text-muted">${new Date(invitation.createdAt).toLocaleDateString()}</small>
      </div>
      <div class="invitation-from">
        <i class="fas fa-user"></i> From: ${invitation.senderName}
      </div>
      <div class="invitation-actions">
        <button class="btn btn-success" onclick="acceptInvitation('${invitation.id}', '${invitation.sharedId}')" 
                ${!navigator.onLine ? 'disabled title="Requires internet connection"' : ''}>
          <i class="fas fa-check"></i> ${t("accept")}
        </button>
        <button class="btn btn-secondary" onclick="declineInvitation('${invitation.id}')"
                ${!navigator.onLine ? 'disabled title="Requires internet connection"' : ''}>
          <i class="fas fa-times"></i> ${t("decline")}
        </button>
      </div>
    </div>
  `).join('');
}

function renderSharedNotes() {
  const sharedNotesList = document.getElementById('sharedNotesList');
  const sharedNotesEmpty = document.getElementById('sharedNotesEmpty');
  
  if (!sharedNotes || sharedNotes.length === 0) {
    sharedNotesList.innerHTML = '';
    sharedNotesList.appendChild(sharedNotesEmpty);
    return;
  }
  
  sharedNotesEmpty.style.display = 'none';
  
  sharedNotesList.innerHTML = sharedNotes.map(note => {
    const isOwner = note.ownerId === currentUser.uid;
    const collaboratorCount = note.collaborators ? note.collaborators.length : 0;
    
    return `
      <div class="shared-note-card" onclick="openSharedNote('${note.id}')">
        <div class="shared-note-header">
          <div class="shared-note-title">${note.title || 'Untitled Note'}</div>
          <small class="text-muted">${new Date(note.updatedAt).toLocaleDateString()}</small>
        </div>
        <div class="shared-note-owner">
          <i class="fas fa-${isOwner ? 'crown' : 'user'}"></i> 
          ${isOwner ? 'Owned by you' : `Shared by ${note.ownerName}`}
        </div>
        <div class="shared-note-collaborators">
          <i class="fas fa-users"></i> ${collaboratorCount} collaborator${collaboratorCount !== 1 ? 's' : ''}
        </div>
        <div class="shared-note-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation(); openSharedNote('${note.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          ${isOwner ? `
            <button class="btn btn-secondary" onclick="event.stopPropagation(); manageSharedNote('${note.id}')">
              <i class="fas fa-cog"></i> Manage
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function acceptInvitation(invitationId, sharedId) {
  if (!navigator.onLine) {
    showToast(t("offlineWarning"));
    return;
  }

  if (!currentUser) return;

  try {
    const button = event.target.closest('button');
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';

    // Remove invitation from user's invitations
    await window.database.ref(`users/${currentUser.uid}/invitations/${invitationId}`).remove();
    
    // Add user to shared note collaborators if not already there
    const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
    const snapshot = await sharedNoteRef.once('value');
    const sharedNote = snapshot.val();
    
    if (sharedNote && sharedNote.collaborators && !sharedNote.collaborators.includes(currentUser.uid)) {
      sharedNote.collaborators.push(currentUser.uid);
      await sharedNoteRef.update({ collaborators: sharedNote.collaborators });
    }
    
    // Refresh the page
    await loadSharedContent();
    renderInvitations();
    renderSharedNotes();
    
    showToast(t("invitationAccepted"));
    
  } catch (error) {
    console.error("Error accepting invitation:", error);
    showToast(t("errorAccepting"));
  }
}

async function declineInvitation(invitationId) {
  if (!navigator.onLine) {
    showToast(t("offlineWarning"));
    return;
  }

  if (!currentUser) return;

  try {
    const button = event.target.closest('button');
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Declining...';

    // Remove invitation from user's invitations
    await window.database.ref(`users/${currentUser.uid}/invitations/${invitationId}`).remove();
    
    // Refresh invitations
    await loadInvitations();
    renderInvitations();
    
    showToast(t("invitationDeclined"));
    
  } catch (error) {
    console.error("Error declining invitation:", error);
    showToast(t("errorDeclining"));
  }
}

function openSharedNote(sharedId) {
  // Find the shared note
  const sharedNote = sharedNotes.find(note => note.id === sharedId);
  if (!sharedNote) return;

  // Create a note object compatible with the main app
  const noteForEditor = {
    id: sharedNote.noteId || sharedId,
    title: sharedNote.title || '',
    content: sharedNote.content || '',
    categories: sharedNote.categories || [],
    images: sharedNote.images || [],
    listItems: sharedNote.listItems || [],
    listType: sharedNote.listType || 'bulleted',
    password: '', // Shared notes don't use passwords
    createdAt: sharedNote.createdAt,
    updatedAt: sharedNote.updatedAt,
    isShared: true,
    sharedId: sharedId
  };

  // Store in localStorage for the main app to pick up
  localStorage.setItem('openSharedNote', JSON.stringify(noteForEditor));
  
  // Navigate to main app
  window.location.href = 'Note/index.html';
}

function manageSharedNote(sharedId) {
  // TODO: Implement shared note management (add/remove collaborators, etc.)
  showToast("Management features coming soon");
}

// Global functions for inline event handlers
window.acceptInvitation = acceptInvitation;
window.declineInvitation = declineInvitation;
window.openSharedNote = openSharedNote;
window.manageSharedNote = manageSharedNote;

// Utility functions
function showToast(message, type = 'default') {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Check for offline status
window.addEventListener('online', () => {
  if (currentUser && !isGuest) {
    loadSharedContent();
  }
});

window.addEventListener('offline', () => {
  showToast("You're offline. Some features may not be available.");
});
