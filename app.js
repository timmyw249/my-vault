// Simple local database wrapper using IndexedDB (handles large photo/video data smoothly)
const dbName = "PhotoVaultDB";
let db;

const initDB = () => {
    return new Promise((resolve) => {
        let request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            db.createObjectStore("media", { keyPath: "id", autoIncrement: true });
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
    });
};

// Application State
let currentPin = "";
let isSelectMode = false;
let selectedIds = new Set();
let isResettingPin = false;

// New State Variables for Swipe and Zoom Tracking
let galleryItems = [];
let currentViewerIndex = -1;
let touchStartX = 0;
let touchEndX = 0;
let initialDistance = 0;
let currentScale = 1;
let lastScale = 1;

// Elements
const pinScreen = document.getElementById('pin-screen');
const vaultScreen = document.getElementById('vault-screen');
const viewerScreen = document.getElementById('viewer-screen');
const pinTitle = document.getElementById('pin-title');
const dots = document.querySelectorAll('.dot');
const mediaGrid = document.getElementById('media-grid');
const bulkBar = document.getElementById('bulk-bar');
const selectedCountText = document.getElementById('selected-count');
const viewerContent = document.getElementById('viewer-content');

// Initialize App
window.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    
    // Check if a PIN is already configured; default to '1234' if none exists
    if (!localStorage.getItem('vault_pin')) {
        localStorage.setItem('vault_pin', '1234');
    }
    
    setupKeypad();
    renderGallery();
    setupGestures(); // Activates touch tracking mechanics
});

// Keypad logic
function setupKeypad() {
    document.querySelectorAll('.key').forEach(button => {
        button.addEventListener('click', () => {
            if (button.id === 'clear-btn') {
                currentPin = "";
            } else if (button.id === 'back-btn') {
                currentPin = currentPin.slice(0, -1);
            } else if (currentPin.length < 4 && !button.id) {
                currentPin += button.innerText;
            }
            
            updatePinDots();

            if (currentPin.length === 4) {
                setTimeout(handlePinEntry, 200);
            }
        });
    });
}

function updatePinDots() {
    dots.forEach((dot, index) => {
        if (index < currentPin.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
    });
}

function handlePinEntry() {
    const savedPin = localStorage.getItem('vault_pin');

    if (isResettingPin) {
        localStorage.setItem('vault_pin', currentPin);
        alert("PIN changed successfully!");
        isResettingPin = false;
        pinTitle.innerText = "Enter PIN";
        currentPin = "";
        updatePinDots();
        return;
    }

    if (currentPin === savedPin) {
        pinScreen.classList.remove('active');
        vaultScreen.classList.add('active');
        currentPin = "";
        updatePinDots();
    } else {
        alert("Incorrect PIN");
        currentPin = "";
        updatePinDots();
    }
}

// Settings (Change PIN Option)
document.getElementById('settings-btn').addEventListener('click', () => {
    if (confirm("Would you like to change your 4-digit PIN?")) {
        vaultScreen.classList.remove('active');
        pinScreen.classList.add('active');
        pinTitle.innerText = "Enter New PIN";
        isResettingPin = true;
    }
});

// File Handling (Upload)
document.getElementById('file-upload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const processFile = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function () {
                const tx = db.transaction("media", "readwrite");
                tx.objectStore("media").add({
                    type: file.type.startsWith('video/') ? 'video' : 'image',
                    data: reader.result,
                    timestamp: Date.now()
                });
                tx.oncomplete = () => resolve();
            };
        });
    };

    // Upload files sequentially to prevent layout duplicates
    for (let file of files) {
        await processFile(file);
    }
    renderGallery();
    e.target.value = "";
});

// Render Items from Database
function renderGallery() {
    mediaGrid.innerHTML = "";
    galleryItems = []; // Clear old items track
    const tx = db.transaction("media", "readonly");
    const store = tx.objectStore("media");
    
    store.openCursor(null, "prev").onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
            const item = cursor.value;
            galleryItems.push(item); // Build list array structure for left/right swiping
            
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail-wrapper';
            wrapper.dataset.id = item.id;

            if (item.type === 'video') {
                const video = document.createElement('video');
                video.src = item.data;
                video.muted = true;
                video.playsInline = true;
                wrapper.appendChild(video);
                
                const badge = document.createElement('div');
                badge.className = 'video-badge';
                badge.innerText = '▶';
                wrapper.appendChild(badge);
            } else {
                const img = document.createElement('img');
                img.src = item.data;
                wrapper.appendChild(img);
            }

            // Selection indicator overlay
            const overlay = document.createElement('div');
            overlay.className = 'select-overlay';
            overlay.innerHTML = '<div class="checkbox-indicator"></div>';
            wrapper.appendChild(overlay);

            wrapper.addEventListener('click', () => handleItemClick(item, wrapper));
            mediaGrid.appendChild(wrapper);
            cursor.continue();
        }
    };
}

// Interaction Logic
function handleItemClick(item, element) {
    if (isSelectMode) {
        const id = parseInt(element.dataset.id);
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
            element.classList.remove('selected');
        } else {
            selectedIds.add(id);
            element.classList.add('selected');
        }
        selectedCountText.innerText = `${selectedIds.size} items selected`;
    } else {
        // Find our position in the gallery track
        currentViewerIndex = galleryItems.findIndex(g => g.id === item.id);
        openFullScreenViewer(item);
    }
}

function openFullScreenViewer(item) {
    viewerContent.innerHTML = "";
    
    // Always reset zoom tracking levels on view entry
    currentScale = 1;
    lastScale = 1;

    let mediaElement;
    if (item.type === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.src = item.data;
        mediaElement.controls = true;
        mediaElement.autoplay = true;
    } else {
        mediaElement = document.createElement('img');
        mediaElement.src = item.data;
    }
    
    mediaElement.style.transform = "scale(" + currentScale + ")";
    mediaElement.style.transition = "transform 0.1s ease-out";
    viewerContent.appendChild(mediaElement);
    viewerScreen.classList.remove('hidden');
}

// Clear math setup that maps touch tracking vectors cleanly without layout errors
function setupGestures() {
    viewerScreen.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && currentScale === 1) {
            touchStartX = e.touches.item(0).clientX;
        }
        
        if (e.touches.length === 2) {
            const mediaElement = viewerContent.querySelector('img');
            if (mediaElement) { 
                const f1 = e.touches.item(0);
                const f2 = e.touches.item(1);
                const dx = f1.clientX - f2.clientX;
                const dy = f1.clientY - f2.clientY;
                initialDistance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
            }
        }
    }, { passive: true });

    viewerScreen.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && currentScale === 1) {
            touchEndX = e.touches.item(0).clientX;
        }

        if (e.touches.length === 2 && initialDistance > 0) {
            const mediaElement = viewerContent.querySelector('img');
            if (mediaElement) {
                const f1 = e.touches.item(0);
                const f2 = e.touches.item(1);
                const dx = f1.clientX - f2.clientX;
                const dy = f1.clientY - f2.clientY;
                const currentDistance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
                
                const zoomFactor = currentDistance / initialDistance;
                currentScale = Math.min(Math.max(1, lastScale * zoomFactor), 4);
                mediaElement.style.transform = "scale(" + currentScale + ")";
            }
        }
    }, { passive: true });

    viewerScreen.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialDistance = 0;
            lastScale = currentScale;
        }

        if (currentScale === 1 && touchStartX !== 0 && touchEndX !== 0) {
            const swipeDistance = touchEndX - touchStartX;
            const threshold = 60; // Slid pixel count limit

            if (Math.abs(swipeDistance) > threshold) {
                if (swipeDistance > 0) {
                    // Swipe Right -> Show previous file index
                    if (currentViewerIndex > 0) {
                        currentViewerIndex--;

openFullScreenViewer(galleryItems[currentViewerIndex]);
}
} else {
// Swipe Left -> Show next file index
if (currentViewerIndex < galleryItems.length - 1) {
currentViewerIndex++;
openFullScreenViewer(galleryItems[currentViewerIndex]);
}
}
}
}
touchStartX = 0;
touchEndX = 0;
}, { passive: true });
}
// Close full screen viewer
document.getElementById('close-viewer').addEventListener('click', () => {
viewerScreen.classList.add('hidden');
viewerContent.innerHTML = ""; // Stop playing video if active
currentScale = 1;
lastScale = 1;
});
// Selection Mode Configuration
const selectModeBtn = document.getElementById('select-mode-btn');
selectModeBtn.addEventListener('click', () => {
isSelectMode = true;
mediaGrid.classList.add('select-mode');
bulkBar.classList.remove('hidden');
selectedIds.clear();
selectedCountText.innerText = "0 items selected";
});
function exitSelectMode() {
isSelectMode = false;
mediaGrid.classList.remove('select-mode');
bulkBar.classList.add('hidden');
document.querySelectorAll('.thumbnail-wrapper').forEach(el => el.classList.remove('selected'));
selectedIds.clear();
}
document.getElementById('cancel-select-btn').addEventListener('click', exitSelectMode);
// Bulk Delete Action
document.getElementById('delete-selected-btn').addEventListener('click', () => {
if (selectedIds.size === 0) return;
if (confirm(Are you sure you want to permanently delete these ${selectedIds.size} items?)) {
const tx = db.transaction("media", "readwrite");
const store = tx.objectStore("media");
selectedIds.forEach(id => store.delete(id));
tx.oncomplete = () => {
exitSelectMode();
renderGallery();
};
}
});
