// IndexedDB Setup
let db;
const request = indexedDB.open("PhotoVaultDB", 1);
request.onupgradeneeded = (e) => {
db = e.target.result;
if (!db.objectStoreNames.contains("media")) {
db.createObjectStore("media", { keyPath: "id", autoIncrement: true });
}
};
request.onsuccess = (e) => { db = e.target.result; loadGallery(); };
// Application State
let currentPin = localStorage.getItem("vault_pin") || "1234";
let isSettingNewPin = !localStorage.getItem("vault_pin");
let pinInput = "";
let isSelectMode = false;
let selectedIds = new Set();
if(isSettingNewPin) document.getElementById('pin-title').innerText = "Create Your 4-Digit PIN";
// Elements
const pinDots = document.querySelectorAll('.dot');
const pinScreen = document.getElementById('pin-screen');
const vaultScreen = document.getElementById('vault-screen');
const galleryGrid = document.getElementById('gallery-grid');
// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
}
// PIN Keypad Management
document.querySelectorAll('.key').forEach(button => {
button.addEventListener('click', () => {
const value = button.innerText;
if (!isNaN(value) && pinInput.length < 4) {
pinInput += value;
updateDots();
if (pinInput.length === 4) setTimeout(verifyPin, 250);
}
});
});
document.getElementById('pin-clear').addEventListener('click', () => {
pinInput = "";
updateDots();
});
document.getElementById('pin-mode-btn').addEventListener('click', () => {
if(confirm("Do you want to change your PIN? You will need to enter your current one first.")) {
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
if (isSettingNewPin) {
localStorage.setItem("vault_pin", pinInput);
currentPin = pinInput;
isSettingNewPin = false;
document.getElementById('pin-title').innerText = "Enter PIN";
alert("PIN saved successfully!");
unlockVault();
} else if (pinInput === currentPin) {
unlockVault();
} else {
alert("Incorrect PIN");
pinInput = "";
updateDots();
}
}
function unlockVault() {
pinScreen.classList.remove('active');
vaultScreen.classList.add('active');
pinInput = "";
updateDots();
}
document.getElementById('lock-btn').addEventListener('click', () => {
vaultScreen.classList.remove('active');
pinScreen.classList.add('active');
});
// Import Media to IndexedDB
document.getElementById('file-upload').addEventListener('change', (e) => {
const files = Array.from(e.target.files);
const transaction = db.transaction(["media"], "readwrite");
const store = transaction.objectStore("media");
files.forEach(file => {
const reader = new FileReader();
reader.onload = (event) => {
store.add({
type: file.type.startsWith('video') ? 'video' : 'image',
data: event.target.result,
timestamp: Date.now()
});
};
reader.readAsDataURL(file);
});
transaction.oncomplete = () => { setTimeout(loadGallery, 500); };});
// Load Gallery from Database
function loadGallery() {
if (!db) return;
galleryGrid.innerHTML = "";
const store = db.transaction("media", "readonly").objectStore("media");
store.openCursor(null, "prev").onsuccess = (e) => {
const cursor = e.target.result;
if (cursor) {
const item = cursor.value;
const wrapper = document.createElement('div');
wrapper.className = thumbnail-wrapper ${isSelectMode ? 'selectable' : ''};
wrapper.dataset.id = item.id;
    const mediaElement = item.type === 'video' ? document.createElement('video') : document.createElement('img');
    mediaElement.src = item.data;
    wrapper.appendChild(mediaElement);

    wrapper.addEventListener('click', () => handleMediaClick(item.id, item.type, item.data, wrapper));
    galleryGrid.appendChild(wrapper);
    cursor.continue();
}
};}
// Click / Multi-Select Management
function handleMediaClick(id, type, data, element) {
if (isSelectMode) {
if (selectedIds.has(id)) {
selectedIds.delete(id);
element.classList.remove('selected');
} else {
selectedIds.add(id);
element.classList.add('selected');
}
document.getElementById('delete-btn').classList.toggle('hidden', selectedIds.size === 0);
} else {
openFullscreen(type, data);
}
}
// Select Mode Toggle
document.getElementById('select-mode-btn').addEventListener('click', function() {
isSelectMode = !isSelectMode;
this.innerText = isSelectMode ? "Cancel" : "Select";
document.getElementById('delete-btn').classList.add('hidden');
selectedIds.clear();
loadGallery();
});
// Batch Deletion
document.getElementById('delete-btn').addEventListener('click', () => {
if (confirm(Delete ${selectedIds.size} item(s) permanently?)) {
const transaction = db.transaction(["media"], "readwrite");
const store = transaction.objectStore("media");
selectedIds.forEach(id => store.delete(Number(id)));
transaction.oncomplete = () => {
    isSelectMode = false;
    document.getElementById('select-mode-btn').innerText = "Select";
    document.getElementById('delete-btn').classList.add('hidden');
    selectedIds.clear();
    loadGallery();
};
}});
// Fullscreen Viewer
function openFullscreen(type, data) {
const viewer = document.getElementById('viewer-screen');
const container = document.getElementById('viewer-content');
container.innerHTML = "";
const media = document.createElement(type === 'video' ? 'video' : 'img');
media.src = data;
if(type === 'video') media.controls = true;
container.appendChild(media);
viewer.classList.remove('hidden');}
document.getElementById('viewer-close').addEventListener('click', () => {
document.getElementById('viewer-screen').classList.add('hidden');
document.getElementById('viewer-content').innerHTML = "";
});
