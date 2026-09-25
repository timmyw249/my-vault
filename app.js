// Global App Variables
let currentPin = "1234";
let pinInput = "";
let isSelectMode = false;
let selectedIds = new Set();

// Safely pull PIN from local memory if it exists
try {
    if (localStorage.getItem("vault_pin")) {
        currentPin = localStorage.getItem("vault_pin");
    } else {
        localStorage.setItem("vault_pin", "1234");
    }
} catch (e) {
    console.log("Storage restricted. Using temporary PIN: 1234");
}

// Database Setup
let db;
const dbRequest = indexedDB.open("PhotoVaultDB", 1);

dbRequest.onupgradeneeded = function(e) {
    db = e.target.result;
    if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "id", autoIncrement: true });
    }
};

dbRequest.onsuccess = function(e) { 
    db = e.target.result; 
    loadGallery(); 
};

dbRequest.onerror = function(e) {
    console.error("Database failed to initialize.");
};

// PWA Service Worker (Bypassed if local environment restrictions occur)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log("SW registration bypassed"));
}

// Set up UI interactions safely after DOM finishes building
document.addEventListener("DOMContentLoaded", function() {
    const pinDots = document.querySelectorAll('.dot');
    const pinScreen = document.getElementById('pin-screen');
    const vaultScreen = document.getElementById('vault-screen');
    const galleryGrid = document.getElementById('gallery-grid');

    // Attach numbers to keypad
    document.querySelectorAll('.key').forEach(button => {
        button.addEventListener('click', function() {
            const value = button.innerText;
            if (!isNaN(value) && pinInput.length < 4) {
                pinInput += value;
                updateDots();
                if (pinInput.length === 4) {
                    setTimeout(verifyPin, 200);
                }
            }
        });
    });

    document.getElementById('pin-clear').addEventListener('click', function() {
        pinInput = "";
        updateDots();
    });

    document.getElementById('pin-mode-btn').addEventListener('click', function() {
        if(confirm("Reset vault configuration PIN? You will reset to default setup code '1234'.")) {
            localStorage.removeItem("vault_pin");
            window.location.reload();
        }
    });

    function updateDots() {
        pinDots.forEach((dot, index) => {
            if (index < pinInput.length) dot.classList.add('filled');
            else dot.classList.remove('filled');
        });
    }

    function verifyPin() {
        if (pinInput === currentPin) {
            pinScreen.classList.remove('active');
            vaultScreen.classList.add('active');
        } else {
            alert("Incorrect PIN code. Try again.");
        }
        pinInput = "";
        updateDots();
    }

    document.getElementById('lock-btn').addEventListener('click', function() {
        vaultScreen.classList.remove('active');
        pinScreen.classList.add('active');
    });

    // File Upload Engine
    document.getElementById('file-upload').addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        if(!db) return alert("Database not ready yet.");
        
        const transaction = db.transaction(["media"], "readwrite");
        const store = transaction.objectStore("media");

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(event) {
                store.add({
                    type: file.type.startsWith('video') ? 'video' : 'image',
                    data: event.target.result,
                    timestamp: Date.now()
                });
            };
            reader.readAsDataURL(file);
        });

        transaction.oncomplete = function() { 
            setTimeout(loadGallery, 400); 
        };
    });

    // Multi-Select Action Panel
    document.getElementById('select-mode-btn').addEventListener('click', function() {
        isSelectMode = !isSelectMode;
        this.innerText = isSelectMode ? "Cancel" : "Select";
        document.getElementById('delete-btn').classList.add('hidden');
        selectedIds.clear();
        loadGallery();
    });

    document.getElementById('delete-btn').addEventListener('click', function() {
        if (confirm(`Permanently wipe out these ${selectedIds.size} file(s)?`)) {
            const transaction = db.transaction(["media"], "readwrite");
            const store = transaction.objectStore("media");
            selectedIds.forEach(id => store.delete(Number(id)));

            transaction.oncomplete = function() {
                isSelectMode = false;
                document.getElementById('select-mode-btn').innerText = "Select";
                document.getElementById('delete-btn').classList.add('hidden');
                selectedIds.clear();
                loadGallery();
            };
        }
    });

    document.getElementById('viewer-close').addEventListener('click', function() {
        document.getElementById('viewer-screen').classList.add('hidden');
        document.getElementById('viewer-content').innerHTML = "";
    });
});

// Structural Gallery Sync
function loadGallery() {
    const grid = document.getElementById('gallery-grid');
    if (!db || !grid) return;
    grid.innerHTML = "";
    
    const store = db.transaction("media", "readonly").objectStore("media");
    store.openCursor(null, "prev").onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
            const item = cursor.value;
            const wrapper = document.createElement('div');
            wrapper.className = `thumbnail-wrapper ${isSelectMode ? 'selectable' : ''}`;
            wrapper.dataset.id = item.id;

            const media = item.type === 'video' ? document.createElement('video') : document.createElement('img');
            media.src = item.data;
            wrapper.appendChild(media);

            wrapper.addEventListener('click', function() {
                if (isSelectMode) {
                    if (selectedIds.has(item.id)) {
                        selectedIds.delete(item.id);
                        wrapper.classList.remove('selected');
                    } else {
                        selectedIds.add(item.id);
                        wrapper.classList.add('selected');
                    }
                    document.getElementById('delete-btn').classList.toggle('hidden', selectedIds.size === 0);
                } else {
                    const viewer = document.getElementById('viewer-screen');
                    const target = document.getElementById('viewer-content');
                    target.innerHTML = "";
                    const viewMedia = item.type === 'video' ? document.createElement('video') : document.createElement('img');
                    viewMedia.src = item.data;
                    if(item.type === 'video') viewMedia.controls = true;
                    target.appendChild(viewMedia);
                    viewer.classList.remove('hidden');
                }
            });

            grid.appendChild(wrapper);
            cursor.continue();
        }
    };
}
