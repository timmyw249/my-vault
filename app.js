let db;
let currentPin = '';
let isSelectMode = false;
let selectedItems = new Set();
let pinState = 'verify'; // 'verify', 'set-old', 'set-new'
let tempNewPin = '';

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

// File Storage Engine
function handleFiles(files) {
  const transaction = db.transaction(["media"], "readwrite");
  const store = transaction.objectStore("media");

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      store.add({
        type: file.type,
        data: e.target.result,
        timestamp: Date.now()
      });
    };
    reader.readAsDataURL(file);
  });

  transaction.oncomplete = () => {
    setTimeout(loadGallery, 300);
  };
}

function loadGallery() {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  selectedItems.clear();
  
  const transaction = db.transaction(["media"], "readonly");
  const store = transaction.objectStore("media");
  
  store.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const record = cursor.value;
      const wrapper = document.createElement('div');
      wrapper.className = `thumbnail-wrapper ${isSelectMode ? 'selectable' : ''}`;
      wrapper.dataset.id = record.id;
      
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
      
      wrapper.addEventListener('click', () => handleItemClick(record, wrapper));
      gallery.appendChild(wrapper);
      cursor.continue();
    }
  };
}

// Interactive Features
function handleItemClick(record, wrapper) {
  if (isSelectMode) {
    if (selectedItems.has(record.id)) {
      selectedItems.delete(record.id);
      wrapper.classList.remove('selected');
    } else {
      selectedItems.add(record.id);
      wrapper.classList.add('selected');
    }
  } else {
    openViewer(record);
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

function openViewer(record) {
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
}

function closeViewer() {
  document.getElementById('viewer').classList.add('hidden');
  document.getElementById('viewer-content').innerHTML = '';
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
