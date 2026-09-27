import PinchZoom from 'https://unpkg.com';

let db;
let currentPin = '';
let isSelectMode = false;
let selectedItems = new Set();
let pinState = 'verify'; // 'verify', 'set-old', 'set-new'
let tempNewPin = '';

// Swipe & sliding selection variables
let allMediaRecords = []; 
let currentViewerIndex = -1;
let touchStartX = 0;
let touchEndX = 0;
let isSlidingToSelect = false;

// Initialize IndexedDB Storage
const request = indexedDB.open("VaultDB", 1);
request.onupgradeneeded = (e) => {
  db = e.target.result;
  db.createObjectStore("media", { keyPath: "id", autoIncrement: true });
  db.createObjectStore("config");
};
request.onsuccess = (e) => {
  db = e.target.result;
  checkSetup();
};

function checkSetup() {
  const transaction = db.transaction(["config"], "readonly");
  const store = transaction.objectStore("config");
  const getReq = store.get("pin");
  
  getReq.onsuccess = () => {
    if (!getReq.result) {
      document.getElementById('pin-title').innerText = "Create Your 4-Digit PIN";
      pinState = 'set-new';
    }
  };
}

// Numpad Controls
function pressKey(num) {
  if (currentPin.length < 4) {
    currentPin += num;
    updateDots();
    if (currentPin.length === 4) {
      setTimeout(processPin, 200);
    }
  }
}

function clearPin() { currentPin = ''; updateDots(); }
function updateDots() {
  const dots = document.querySelectorAll('.dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < currentPin.length);
  });
}

function processPin() {
  const transaction = db.transaction(["config"], "readwrite");
  const store = transaction.objectStore("config");

  if (pinState === 'set-new') {
    store.put(currentPin, "pin");
    alert("PIN successfully set!");
    pinState = 'verify';
    document.getElementById('pin-title').innerText = "Enter Vault PIN";
    unlockVault();
  } else if (pinState === 'verify') {
    const getReq = store.get("pin");
    getReq.onsuccess = () => {
      if (currentPin === getReq.result) {
        unlockVault();
      } else {
        alert("Incorrect PIN");
        clearPin();
      }
    };
  } else if (pinState === 'set-old') {
    const getReq = store.get("pin");
    getReq.onsuccess = () => {
      if (currentPin === getReq.result) {
        pinState = 'set-new';
        document.getElementById('pin-title').innerText = "Enter New PIN";
        showScreen('pin-screen');
        clearPin();
      } else {
        alert("Incorrect current PIN");
        clearPin();
      }
    };
  }
}

function unlockVault() {
  showScreen('vault-screen');
  loadGallery();
  clearPin();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// Enhanced File Storage Engine with HEIC to JPEG conversion
async function handleFiles(files) {
  const fileArray = Array.from(files);
  const recordsToSave = [];

  for (const file of fileArray) {
    try {
      let processedFile = file;
      
      if (file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic")) {
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8
        });
        const finalBlob = Array.isArray(convertedBlob) ? convertedBlob : convertedBlob;
        processedFile = new File([finalBlob], file.name.replace(/\.[^/.]+\$/, ".jpg"), { type: "image/jpeg" });
      }

      const dataUrl = await readFileAsDataURL(processedFile);
      recordsToSave.push({
        type: processedFile.type,
        data: dataUrl,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error("Error processing file:", file.name, err);
    }
  }

  if (recordsToSave.length > 0) {
    const transaction = db.transaction(["media"], "readwrite");
    const store = transaction.objectStore("media");

    recordsToSave.forEach(record => store.add(record));

    transaction.oncomplete = () => {
      loadGallery();
    };
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// Enhanced Gallery Renderer
function loadGallery() {
  const gallery = document.getElementById('gallery');
  if (!gallery) return;
  gallery.innerHTML = '';
  selectedItems.clear();
  allMediaRecords = []; 
  
  if (!db) return;

  const transaction = db.transaction(["media"], "readonly");
  const store = transaction.objectStore("media");
  
  store.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const record = cursor.value;
      allMediaRecords.push(record);
      
      const wrapper = document.createElement('div');
      wrapper.className = `thumbnail-wrapper ${isSelectMode ? 'selectable' : ''}`;
      wrapper.dataset.id = record.id;
      wrapper.dataset.index = allMediaRecords.length - 1;
      
      let element;
      if (record.type.startsWith('video/')) {
        element = document.createElement('video');
        element.muted = true;
        element.playsInline = true;
      } else {
        element = document.createElement('img');
      }
      element.src = record.data;
      wrapper.appendChild(element);
      
      wrapper.addEventListener('click', () => {
        if (!isSlidingToSelect) handleItemClick(record, Number(wrapper.dataset.index), wrapper);
      });
      
      gallery.appendChild(wrapper);
      cursor.continue();
    }
  };
}

// Slide-to-Select Logic
const galleryEl = document.getElementById('gallery');

galleryEl.addEventListener('touchstart', (e) => {
  if (!isSelectMode) return;
  isSlidingToSelect = true;
  processSlideSelection(e);
});

galleryEl.addEventListener('touchmove', (e) => {
  if (!isSelectMode || !isSlidingToSelect) return;
  processSlideSelection(e);
});

galleryEl.addEventListener('touchend', () => {
  setTimeout(() => { isSlidingToSelect = false; }, 50);
});

function processSlideSelection(e) {
  const touch = e.touches[0];
  const target = document.elementFromPoint(touch.clientX, touch.clientY);
  const wrapper = target ? target.closest('.thumbnail-wrapper') : null;
  
  if (wrapper) {
    const id = Number(wrapper.dataset.id);
    if (!selectedItems.has(id)) {
      selectedItems.add(id);
      wrapper.classList.add('selected');
    }
  }
}

function handleItemClick(record, index, wrapper) {
  if (isSelectMode) {
    if (selectedItems.has(record.id)) {
      selectedItems.delete(record.id);
      wrapper.classList.remove('selected');
    } else {
      selectedItems.add(record.id);
      wrapper.classList.add('selected');
    }
  } else {
    openViewer(index);
  }
}

function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  document.getElementById('multi-select-btn').innerText = isSelectMode ? "Cancel" : "Select";
  document.getElementById('delete-btn').classList.toggle('hidden', !isSelectMode);
  loadGallery();
}

function deleteSelected() {
  if (selectedItems.size === 0) return;
  if (confirm(`Delete ${selectedItems.size} items permanently?`)) {
    const transaction = db.transaction(["media"], "readwrite");
    const store = transaction.objectStore("media");
    selectedItems.forEach(id => store.delete(Number(id)));
    transaction.oncomplete = () => {
      toggleSelectMode();
    };
  }
}

// Enhanced Fullscreen Swipe Viewer
function openViewer(index) {
  if (index < 0 || index >= allMediaRecords.length) return;
  currentViewerIndex = index;
  const record = allMediaRecords[index];
  
  const container = document.getElementById('viewer-content');
  container.innerHTML = '';
  
  let element;
  if (record.type.startsWith('video/')) {
    element = document.createElement('video');
    element.controls = true;
    element.autoplay = true;
  } else {
    element = document.createElement('img');
  }
  element.src = record.data;
  
  container.appendChild(element);
  document.getElementById('viewer').classList.remove('hidden');

  // Updated Pinch Zoom Configuration (Overrides iOS touch-action constraints)
  if (!record.type.startsWith('video/')) {
    setTimeout(() => {
      new PinchZoom(element, {
        draggableUnzoomed: false, // Prevents conflict with left/right swiping
        minZoom: 1,
        maxZoom: 4,
        tapZoomFactor: 2
      });
      
      // Forces iOS Safari to drop structural selection locks during active zoom modes
      element.style.touchAction = 'none';
      element.parentElement.style.touchAction = 'none';
    }, 50); // Small delay guarantees the element is fully rendered in the DOM first
  }
}

const viewerEl = document.getElementById('viewer');
viewerEl.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

viewerEl.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
  const swipeThreshold = 60;
  const difference = touchStartX - touchEndX;

  if (Math.abs(difference) > swipeThreshold) {
    if (difference > 0) {
      if (currentViewerIndex < allMediaRecords.length - 1) openViewer(currentViewerIndex + 1);
    } else {
      if (currentViewerIndex > 0) openViewer(currentViewerIndex - 1);
    }
  }
}

function closeViewer() {
  document.getElementById('viewer').classList.add('hidden');
  document.getElementById('viewer-content').innerHTML = '';
  currentViewerIndex = -1;
}

function openSettings() { showScreen('settings-screen'); }
function initiatePinChange() {
  pinState = 'set-old';
  document.getElementById('pin-title').innerText = "Enter Existing PIN";
  showScreen('pin-screen');
  clearPin();
}

// Register Service Worker for absolute offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Vault offline engine ready.'))
      .catch(err => console.log('Offline setup failed: ', err));
  });
}
