var currentPin = "1234";
var pinInput = "";
var isSelectMode = false;
var selectedIds = new Set();
var db = null; 

try {
if (localStorage.getItem("vault_pin")) {
currentPin = localStorage.getItem("vault_pin");
} else {
localStorage.setItem("vault_pin", "1234");
}
} catch (e) {
console.log("Local browser privacy lock active.");
} 

var dbRequest = indexedDB.open("PhotoVaultDB", 1);
dbRequest.onupgradeneeded = function(e) {
var localDb = e.target.result;
if (!localDb.objectStoreNames.contains("media")) {
localDb.createObjectStore("media", { keyPath: "id", autoIncrement: true });
}
};
dbRequest.onsuccess = function(e) {
db = e.target.result;
loadGallery();
}; 

if ('serviceWorker' in navigator) {
navigator.serviceWorker.register('sw.js').catch(function(e) {});
} 

function pressKey(num) {
if (pinInput.length < 4) {
pinInput += num;
updateDots();
if (pinInput.length === 4) {
setTimeout(verifyPin, 100);
}
}
} 

function clearPin() {
pinInput = "";
updateDots();
} 

function changePin() {
var newPin = prompt("Enter a new 4-digit code:");
if(newPin && newPin.length === 4 && !isNaN(newPin)) {
localStorage.setItem("vault_pin", newPin);
currentPin = newPin;
alert("PIN updated!");
window.location.reload();
} else if(newPin) {
alert("Invalid layout. PIN must be 4 numbers.");
}
} 

function updateDots() {
var pinDots = document.querySelectorAll('.dot');
pinDots.forEach(function(dot, index) {
if (index < pinInput.length) dot.classList.add('filled');
else dot.classList.remove('filled');
});
} 

function verifyPin() {
if (pinInput === currentPin) {
document.getElementById('pin-screen').classList.remove('active');
document.getElementById('vault-screen').classList.add('active');
} else {
alert("Incorrect PIN code.");
}
pinInput = "";
updateDots();
} 

function lockVault() {
document.getElementById('vault-screen').classList.remove('active');
document.getElementById('pin-screen').classList.add('active');
} 

function handleUpload(e) {
var files = Array.from(e.target.files);
if(!db) return alert("Storage loading..."); 

var transaction = db.transaction(["media"], "readwrite");
var store = transaction.objectStore("media");

files.forEach(function(file) {
var reader = new FileReader();
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

} 

function toggleSelectMode() {
isSelectMode = !isSelectMode;
document.getElementById('select-mode-btn').innerText = isSelectMode ? "Cancel" : "Select";
document.getElementById('delete-btn').classList.add('hidden');
selectedIds.clear();
loadGallery();
} 

function deleteSelected() {
if (confirm("Permanently wipe out item(s)?")) {
var transaction = db.transaction(["media"], "readwrite");
var store = transaction.objectStore("media");
selectedIds.forEach(function(id) { store.delete(Number(id)); });
transaction.oncomplete = function() {
isSelectMode = false;
document.getElementById('select-mode-btn').innerText = "Select";
document.getElementById('delete-btn').classList.add('hidden');
selectedIds.clear();
loadGallery();
};
}
} 

function closeViewer() {
document.getElementById('viewer-screen').classList.remove('active');
document.getElementById('viewer-content').innerHTML = "";
} 

function loadGallery() {
var grid = document.getElementById('gallery-grid');
if (!db || !grid) return;
grid.innerHTML = ""; 

var store = db.transaction("media", "readonly").objectStore("media");
store.openCursor(null, "prev").onsuccess = function(e) {
var cursor = e.target.result;
if (cursor) {
var item = cursor.value;
var wrapper = document.createElement('div');
wrapper.className = isSelectMode ? 'thumbnail-wrapper selectable' : 'thumbnail-wrapper';
    var media = document.createElement(item.type === 'video' ? 'video' : 'img');
    media.src = item.data;
    wrapper.appendChild(media);

    wrapper.addEventListener('click', (function(id, type, data, el) {
        return function() {
            if (isSelectMode) {
                if (selectedIds.has(id)) {
                    selectedIds.delete(id);
                    el.classList.remove('selected');
                } else {
                    selectedIds.add(id);
                    el.classList.add('selected');
                }
                document.getElementById('delete-btn').classList.toggle('hidden', selectedIds.size === 0);
            } else {
                var viewer = document.getElementById('viewer-screen');
                var target = document.getElementById('viewer-content');
                target.innerHTML = "";
                var viewMedia = document.createElement(type === 'video' ? 'video' : 'img');
                viewMedia.src = data;
                if(type === 'video') viewMedia.controls = true;
                target.appendChild(viewMedia);
                viewer.classList.add('active');
            }
        };
    })(item.id, item.type, item.data, wrapper));

    grid.appendChild(wrapper);
    cursor.continue();
}

};

}
