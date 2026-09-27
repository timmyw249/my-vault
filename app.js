// Private Vault Database Initialization
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

// Application Global State variables
let currentPin = "";
let isSelectMode = false;
let selectedIds = new Set();
let isResettingPin = false;

let galleryItems = [];
let currentViewerIndex = -1;
let touchStartX = 0;
let touchEndX = 0;
let currentScale = 1;

const pinScreen = document.getElementById('pin-screen');
const vaultScreen = document.getElementById('vault-screen');
const viewerScreen = document.getElementById('viewer-screen');
const pinTitle = document.getElementById('pin-title');
const dots = document.querySelectorAll('.dot');
const mediaGrid = document.getElementById('media-grid');
const bulkBar = document.getElementById('bulk-bar');
const selectedCountText = document.getElementById('selected-count');
const viewerContent = document.getElementById('viewer-content');

window.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    if (!localStorage.getItem('vault_pin')) {
        localStorage.setItem('vault_pin', '1234');
    }
    setupKeypad();
    renderGallery();
    setupGestures();
});

// Programmatic Keypad Attachment
function setupKeypad() {
    const keys = document.querySelectorAll('.key');
    keys.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.innerText.trim();
            if (val === 'C') {
                currentPin = "";
            } else if (val === '⌫') {
                currentPin = currentPin.slice(0, -1);
            } else if (currentPin.length < 4 && val.length === 1) {
                currentPin += val;
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

document.getElementById('settings-btn').addEventListener('click', () => {
    if (confirm("Would you like to change your 4-digit PIN?")) {
        vaultScreen.classList.remove('active');
        pinScreen.classList.add('active');
        pinTitle.innerText = "Enter New PIN";
        isResettingPin = true;
    }
});

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

    for (let file of files) {
        await processFile(file);
    }
    renderGallery();
    e.target.value = "";
});

function renderGallery() {
    mediaGrid.innerHTML = "";
    galleryItems = [];
    const tx = db.transaction("media", "readonly");
    const store = tx.objectStore("media");
    
    store.openCursor(null, "prev").onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
            const item = cursor.value;
            galleryItems.push(item);
            
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
        selectedCountText.innerText = selectedIds.size + " items selected";
    } else {
        currentViewerIndex = galleryItems.findIndex(g => g.id === item.id);
        openFullScreenViewer(item);
    }
}

function openFullScreenViewer(item) {
    viewerContent.innerHTML = "";
    currentScale = 1;

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

// Clean, Syntax-Proof Gesture Architecture
function setupGestures() {
    // Single finger horizontal touch points for navigation
    viewerScreen.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1 && currentScale === 1) {
            touchStartX = e.touches.item(0).clientX;
        }
    }, { passive: true });

    viewerScreen.addEventListener('touchmove', function(e) {
        if (e.touches.length === 1 && currentScale === 1) {
            touchEndX = e.touches.item(0).clientX;
        }
    }, { passive: true });

    viewerScreen.addEventListener('touchend', function(e) {
        if (currentScale === 1 && touchStartX !== 0 && touchEndX !== 0) {
            const diff = touchEndX - touchStartX;
            if (Math.abs(diff) > 60) {
                if (diff > 0) {
                    if (currentViewerIndex > 0) {
                        currentViewerIndex = currentViewerIndex - 1;
                        openFullScreenViewer(galleryItems[currentViewerIndex]);
                    }
                } else {
                    if (currentViewerIndex < galleryItems.length - 1) {
                        currentViewerIndex = currentViewerIndex + 1;
                        openFullScreenViewer(galleryItems[currentViewerIndex]);
                    }
                }
            }
        }
        touchStartX = 0;
        touchEndX = 0;
    }, { passive: true });

    // Handles double-tap to zoom sequentially on mobile screens cleanly without breaking code compile paths
    viewerScreen.addEventListener('click', function() {
        const mediaElement = viewerContent.querySelector('img');
        if (!mediaElement) return;

        if (currentScale === 1) {
            currentScale = 2.5;
        } else {
            currentScale = 1;
        }
        mediaElement.style.transform = "scale(" + currentScale + ")";
    });
}

document.getElementById('close-viewer').addEventListener('click', () => {
    viewerScreen.classList.add('hidden');
    viewerContent.innerHTML = "";
    currentScale = 1;
});

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

document.getElementById('delete-selected-btn').addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    if (confirm("Are you sure you want to permanently delete these " + selectedIds.size + " items?")) {
const tx = db.transaction("media", "readwrite");
const store = tx.objectStore("media");
selectedIds.forEach(id => store.delete(id));
tx.oncomplete = () => {
exitSelectMode();
renderGallery();
};
}
});
