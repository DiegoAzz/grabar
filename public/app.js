/**
 * Loom Clone - Dashboard & UI Controller
 */

// IndexedDB Helper for offline video backup
const IDB_NAME = 'AppzGrabarDB';
const IDB_STORE = 'videos';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveVideoToIDB(videoObj, blob) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put({ ...videoObj, blob });
  } catch (err) {
    console.warn("IndexedDB save error:", err);
  }
}

// State
let currentVideos = [];
let activeCategory = 'videos';
let selectedRecordingMode = 'screen';
let isCameraMenuOpen = false;

// DOM Elements
const videoGrid = document.getElementById('video-grid');
const emptyState = document.getElementById('empty-state');
const navVideoCount = document.getElementById('nav-video-count');
const libraryTitle = document.getElementById('library-title');
const searchInput = document.getElementById('global-search-input');
const refreshBtn = document.getElementById('refresh-videos-btn');

// Widget Elements
const recordWidget = document.getElementById('loom-record-widget');
const openWidgetBtn = document.getElementById('open-record-widget-btn');
const emptyRecordBtn = document.getElementById('empty-record-btn');
const closeWidgetBtn = document.getElementById('close-widget-btn');
const startRecordBtn = document.getElementById('start-recording-btn');
const modeTabs = document.querySelectorAll('.mode-tab');

// Device & Camera elements
const cameraSelectorRow = document.getElementById('camera-selector-row');
const cameraPopup = document.getElementById('camera-devices-popup');
const cameraList = document.getElementById('camera-devices-list');
const selectedCameraLabel = document.getElementById('selected-camera-label');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const dismissTipBtn = document.getElementById('dismiss-tip-btn');
const selectedMicLabel = document.getElementById('selected-mic-label');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const micAudioCanvas = document.getElementById('mic-audio-wave');

// Floating Controls & Camera Bubble
const floatingControls = document.getElementById('loom-floating-controls');
const barStopBtn = document.getElementById('bar-stop-btn');
const barTimer = document.getElementById('bar-timer');
const barPauseBtn = document.getElementById('bar-pause-btn');
const barRestartBtn = document.getElementById('bar-restart-btn');
const barDiscardBtn = document.getElementById('bar-discard-btn');
const barDrawBtn = document.getElementById('bar-draw-btn');

const cameraBubble = document.getElementById('camera-bubble');
const webcamPreviewVideo = document.getElementById('webcam-preview-video');
const bubbleSizeBtn = document.getElementById('bubble-size-btn');
const bubbleFlipBtn = document.getElementById('bubble-flip-btn');
const bubbleCloseBtn = document.getElementById('bubble-close-btn');

const countdownOverlay = document.getElementById('countdown-overlay');
const countdownDigit = document.getElementById('countdown-digit');
const savingModal = document.getElementById('saving-modal');
const uploadProgressBar = document.getElementById('upload-progress-bar');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndSetupProfile();
  await fetchVideos();
  await setupDeviceSelectors();
  setupRecordingControls();
  setupCameraBubbleDragging();
  setupNavCategories();
});

// Check Authentication & Setup User Profile
async function checkAuthAndSetupProfile() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return;
    }

    const user = data.user;
    const headerUserName = document.getElementById('header-user-name');
    const headerUserAvatar = document.getElementById('header-user-avatar');
    const dropdownUserName = document.getElementById('dropdown-user-name');
    const dropdownUserEmail = document.getElementById('dropdown-user-email');

    if (headerUserName) headerUserName.textContent = user.name || 'Diego';
    if (headerUserAvatar && user.avatar) headerUserAvatar.src = user.avatar;
    if (dropdownUserName) dropdownUserName.textContent = user.name || 'Diego';
    if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || 'diego@appzplay.online';

  } catch (err) {
    console.warn("Auth check error:", err);
  }

  // User Dropdown Menu Toggle
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdownMenu = document.getElementById('user-dropdown-menu');
  const logoutBtn = document.getElementById('logout-btn');
  const changePasswordBtn = document.getElementById('change-password-btn');
  const passwordModal = document.getElementById('password-modal');
  const closePasswordModal = document.getElementById('close-password-modal');
  const changePasswordForm = document.getElementById('change-password-form');

  if (userMenuBtn && userDropdownMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMenu.classList.toggle('hidden');
    });

    window.addEventListener('click', () => {
      userDropdownMenu.classList.add('hidden');
    });
  }

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('appzgrabar_user');
        window.location.href = '/login.html';
      } catch (e) {
        window.location.href = '/login.html';
      }
    });
  }

  // Change Password Modal
  if (changePasswordBtn && passwordModal) {
    changePasswordBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMenu.classList.add('hidden');
      passwordModal.classList.remove('hidden');
    });

    closePasswordModal.addEventListener('click', () => {
      passwordModal.classList.add('hidden');
    });

    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('curr-pass-input').value;
      const newPassword = document.getElementById('new-pass-input').value;

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const d = await res.json();
        if (d.success) {
          showToast("Contraseña cambiada con éxito");
          passwordModal.classList.add('hidden');
          changePasswordForm.reset();
        } else {
          alert(d.error || "Error al cambiar la contraseña");
        }
      } catch (err) {
        alert("Error de conexión");
      }
    });
  }
}

// Fetch videos from backend
async function fetchVideos(query = '') {
  try {
    let url = `/api/videos?category=${activeCategory}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.success) {
      currentVideos = data.videos || [];
      renderVideoGrid(currentVideos);
      if (navVideoCount) navVideoCount.textContent = currentVideos.length;
    }
  } catch (err) {
    console.error("Failed to fetch videos:", err);
  }
}

// Render Video Grid Cards
function renderVideoGrid(videos) {
  if (!videoGrid || !emptyState) return;

  if (videos.length === 0) {
    videoGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  videoGrid.innerHTML = videos.map(video => {
    const timeAgo = formatTimeAgo(new Date(video.createdAt));
    const thumb = video.thumbnail || (video.filename ? `/uploads/${video.filename}` : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80');
    const totalReactions = (video.reactions || []).reduce((acc, r) => acc + (r.count || 0), 0);
    const commentCount = (video.comments || []).length;

    return `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-md transition-all group flex flex-col justify-between">
        <!-- Thumbnail Container -->
        <a href="/v/${video.id}" class="relative aspect-video bg-gray-900 block overflow-hidden cursor-pointer">
          <img 
            src="${thumb}" 
            alt="${escapeHtml(video.title)}" 
            class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'"
          />
          <!-- Duration Badge -->
          <div class="absolute bottom-2.5 right-2.5 bg-black/75 backdrop-blur-xs text-white text-[11px] font-mono font-medium px-2 py-0.5 rounded-md">
            ${video.durationFormatted || '00:00'}
          </div>

          <!-- Play button hover overlay -->
          <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div class="w-12 h-12 rounded-full bg-white/90 text-gray-900 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
              <i data-lucide="play" class="w-5 h-5 ml-0.5 fill-current"></i>
            </div>
          </div>
        </a>

        <!-- Content details -->
        <div class="p-3.5 flex flex-col justify-between flex-1">
          <div>
            <div class="flex items-start justify-between gap-2">
              <a href="/v/${video.id}" class="text-sm font-semibold text-gray-900 line-clamp-1 hover:text-[#625df5] transition-colors">
                ${escapeHtml(video.title)}
              </a>
              <!-- Video menu dropdown button -->
              <button onclick="toggleVideoMenu('${video.id}', event)" class="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
                <i data-lucide="more-vertical" class="w-4 h-4"></i>
              </button>
            </div>
            
            <p class="text-xs text-gray-500 mt-1 line-clamp-1">
              ${escapeHtml(video.description || 'No description')}
            </p>
          </div>

          <!-- Footer Metadata -->
          <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <div class="flex items-center gap-2">
              <img 
                src="${video.author?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'}" 
                alt="Avatar" 
                class="w-5 h-5 rounded-full object-cover"
              />
              <span class="truncate max-w-[100px] text-gray-600 font-medium">${escapeHtml(video.author?.name || 'Samantha')}</span>
              <span>•</span>
              <span>${timeAgo}</span>
            </div>

            <div class="flex items-center gap-3">
              ${totalReactions > 0 ? `
                <span class="flex items-center gap-1 text-gray-500 font-medium">
                  <span>🔥</span>
                  <span>${totalReactions}</span>
                </span>
              ` : ''}
              ${commentCount > 0 ? `
                <span class="flex items-center gap-1 text-gray-500 font-medium">
                  <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
                  <span>${commentCount}</span>
                </span>
              ` : ''}
              <span class="flex items-center gap-1">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                <span>${video.views || 0}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Setup Media Devices & Preview
async function setupDeviceSelectors() {
  const { cameras, mics } = await window.loomRecorder.initDevices();

  // Populate Cameras
  if (cameras.length > 0) {
    selectedCameraLabel.textContent = cameras[0].label || 'Web Camera';
    cameraList.innerHTML = cameras.map((c, i) => `
      <div class="device-opt flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium ${i === 0 ? 'bg-blue-600/30 text-blue-300 font-semibold' : 'text-gray-300 hover:bg-white/10'} cursor-pointer" data-id="${c.deviceId}">
        <div class="flex items-center gap-2.5 truncate">
          <i data-lucide="video" class="w-4 h-4 text-blue-400 shrink-0"></i>
          <span class="truncate">${c.label || `Cámara ${i + 1}`}</span>
        </div>
        ${i === 0 ? '<i data-lucide="check" class="w-3.5 h-3.5 text-blue-400"></i>' : ''}
      </div>
    `).join('');
  } else {
    selectedCameraLabel.textContent = 'Cámara predeterminada';
  }

  // Populate Mics
  if (mics.length > 0) {
    selectedMicLabel.textContent = mics[0].label || 'Micrófono predeterminado';
  }

  // Initialize camera preview & audio visualizer
  await window.loomRecorder.startCameraPreview(webcamPreviewVideo);
  if (!window.loomRecorder.cameraStream || !window.loomRecorder.cameraStream.active) {
    cameraBubble.classList.add('hidden');
    toggleCameraBtn.textContent = 'Desactivada';
    toggleCameraBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30';
  } else {
    cameraBubble.classList.remove('hidden');
    toggleCameraBtn.textContent = 'Activada';
    toggleCameraBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  }
  await window.loomRecorder.startAudioVisualizer(micAudioCanvas);

  // Device options click
  cameraPopup.addEventListener('click', async (e) => {
    const opt = e.target.closest('.device-opt');
    if (!opt) return;

    const deviceId = opt.getAttribute('data-id');
    if (deviceId === 'none') {
      window.loomRecorder.cameraEnabled = false;
      toggleCameraBtn.textContent = 'Desactivada';
      toggleCameraBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30';
      selectedCameraLabel.textContent = 'Sin cámara';
      cameraBubble.classList.add('hidden');
      window.loomRecorder.stopCameraPreview();
    } else {
      window.loomRecorder.cameraEnabled = true;
      window.loomRecorder.selectedCameraId = deviceId;
      toggleCameraBtn.textContent = 'Activada';
      toggleCameraBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      selectedCameraLabel.textContent = opt.querySelector('span').textContent;
      cameraBubble.classList.remove('hidden');
      await window.loomRecorder.startCameraPreview(webcamPreviewVideo);
    }

    cameraPopup.classList.add('hidden');
    isCameraMenuOpen = false;
  });

  // Toggle Camera Row popup
  cameraSelectorRow.addEventListener('click', (e) => {
    if (e.target.closest('#toggle-camera-btn')) {
      toggleCamera();
      return;
    }
    isCameraMenuOpen = !isCameraMenuOpen;
    cameraPopup.classList.toggle('hidden', !isCameraMenuOpen);
  });

  dismissTipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissTipBtn.parentElement.classList.add('hidden');
  });

  // Toggle Mic Button
  toggleMicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.loomRecorder.micEnabled = !window.loomRecorder.micEnabled;
    if (window.loomRecorder.micEnabled) {
      toggleMicBtn.textContent = 'Activado';
      toggleMicBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      window.loomRecorder.startAudioVisualizer(micAudioCanvas);
    } else {
      toggleMicBtn.textContent = 'Desactivado';
      toggleMicBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30';
      window.loomRecorder.stopAudioVisualizer();
    }
  });

  lucide.createIcons();
}

async function toggleCamera() {
  window.loomRecorder.cameraEnabled = !window.loomRecorder.cameraEnabled;
  if (window.loomRecorder.cameraEnabled) {
    toggleCameraBtn.textContent = 'Activada';
    toggleCameraBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    await window.loomRecorder.startCameraPreview(webcamPreviewVideo);
    if (window.loomRecorder.cameraStream && window.loomRecorder.cameraStream.active) {
      cameraBubble.classList.remove('hidden');
    }
  } else {
    toggleCameraBtn.textContent = 'Desactivada';
    toggleCameraBtn.className = 'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30';
    cameraBubble.classList.add('hidden');
    window.loomRecorder.stopCameraPreview();
  }
}

// Setup Recording Controls & Handlers
function setupRecordingControls() {
  // Mode selection tabs (Current tab / Entire screen / Window)
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => {
        t.classList.remove('active', 'bg-[#282d37]', 'text-white', 'shadow-sm', 'font-semibold');
        t.classList.add('text-gray-400', 'font-medium');
      });
      tab.classList.add('active', 'bg-[#282d37]', 'text-white', 'shadow-sm', 'font-semibold');
      tab.classList.remove('text-gray-400', 'font-medium');
      selectedRecordingMode = tab.getAttribute('data-mode');
    });
  });

  // Open/close recorder widget
  openWidgetBtn.addEventListener('click', () => recordWidget.classList.remove('hidden'));
  if (emptyRecordBtn) emptyRecordBtn.addEventListener('click', () => recordWidget.classList.remove('hidden'));
  closeWidgetBtn.addEventListener('click', () => recordWidget.classList.add('hidden'));

  // Start recording button click
  startRecordBtn.addEventListener('click', async () => {
    try {
      // 1. Hide configuration widget
      recordWidget.classList.add('hidden');

      // 2. Start Recording Engine (prompts window/screen picker FIRST, then runs 3..2..1 countdown)
      await window.loomRecorder.startRecording(selectedRecordingMode, async () => {
        await runCountdown();
      });

      // 3. Show left floating control bar
      floatingControls.classList.remove('hidden');
      updateTimerDisplay(0);

    } catch (err) {
      console.warn("Start recording error:", err);
      recordWidget.classList.remove('hidden');
      if (err.message && !err.message.includes("cancelada")) {
        alert(err.message || "No se pudo iniciar la grabación. Por favor concede el permiso para capturar la pantalla.");
      }
    }
  });

  // Duration updates callback from recorder
  window.loomRecorder.onDurationUpdate = (sec) => {
    updateTimerDisplay(sec);
  };

  // Stop Recording
  let isStoppingRecording = false;
  barStopBtn.addEventListener('click', async () => {
    if (isStoppingRecording) return;
    isStoppingRecording = true;

    floatingControls.classList.add('hidden');
    savingModal.classList.remove('hidden');
    uploadProgressBar.style.width = '35%';

    try {
      const result = await window.loomRecorder.stopRecording();
      if (!result || !result.videoBlob || result.videoBlob.size === 0) {
        console.warn("No se generó video o el archivo está vacío.");
        savingModal.classList.add('hidden');
        recordWidget.classList.remove('hidden');
        isStoppingRecording = false;
        return;
      }

      uploadProgressBar.style.width = '70%';

      // Prepare FormData for backend
      const formData = new FormData();
      formData.append('video', result.videoBlob, `appzgrabar-${Date.now()}.webm`);
      if (result.thumbnailBlob) {
        formData.append('thumbnail', result.thumbnailBlob, `thumb-${Date.now()}.jpg`);
      }
      formData.append('duration', result.duration);
      formData.append('title', `Grabación de Pantalla - ${new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
      formData.append('category', activeCategory);

      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      uploadProgressBar.style.width = '100%';

      if (data.success && data.video) {
        // Also backup to IndexedDB
        await saveVideoToIDB(data.video, result.videoBlob);

        // Redirect to watch page
        window.location.href = `/v/${data.video.id}`;
      } else {
        throw new Error(data.error || 'Error al guardar el video en el servidor');
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Aviso: " + (err.message || "Error al subir video. Guardando copia de seguridad..."));
      savingModal.classList.add('hidden');
      await fetchVideos();
    } finally {
      isStoppingRecording = false;
    }
  });

  // Pause / Resume
  barPauseBtn.addEventListener('click', () => {
    if (window.loomRecorder.isPaused) {
      window.loomRecorder.resumeRecording();
      barPauseBtn.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
      barPauseBtn.classList.remove('bg-amber-500/30', 'text-amber-400');
    } else {
      window.loomRecorder.pauseRecording();
      barPauseBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4 ml-0.5"></i>';
      barPauseBtn.classList.add('bg-amber-500/30', 'text-amber-400');
    }
    lucide.createIcons();
  });

  // Restart Recording
  barRestartBtn.addEventListener('click', async () => {
    if (confirm("¿Reiniciar la grabación desde el principio? La grabación actual se descartará.")) {
      window.loomRecorder.discardRecording();
      floatingControls.classList.add('hidden');
      await window.loomRecorder.startRecording(selectedRecordingMode, async () => {
        await runCountdown();
      });
      floatingControls.classList.remove('hidden');
    }
  });

  // Discard Recording
  barDiscardBtn.addEventListener('click', () => {
    if (confirm("¿Descartar esta grabación? El video no se guardará.")) {
      window.loomRecorder.discardRecording();
      floatingControls.classList.add('hidden');
      recordWidget.classList.remove('hidden');
      updateTimerDisplay(0);
    }
  });

  // Draw pen tool toggle & Drawing engine
  const drawPalette = document.getElementById('draw-palette');
  const drawCanvas = document.getElementById('drawing-canvas-overlay');
  const drawClearBtn = document.getElementById('draw-clear-btn');
  let drawColor = '#ff5745';
  let isPainting = false;
  let currentStroke = null;

  if (drawCanvas && barDrawBtn) {
    drawCanvas.width = window.innerWidth;
    drawCanvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      drawCanvas.width = window.innerWidth;
      drawCanvas.height = window.innerHeight;
    });

    const dCtx = drawCanvas.getContext('2d');

    barDrawBtn.addEventListener('click', () => {
      window.loomRecorder.isDrawingActive = !window.loomRecorder.isDrawingActive;
      const active = window.loomRecorder.isDrawingActive;
      barDrawBtn.classList.toggle('active', active);
      barDrawBtn.classList.toggle('bg-[#625df5]', active);
      barDrawBtn.classList.toggle('text-white', active);
      if (drawPalette) drawPalette.classList.toggle('hidden', !active);

      if (active) {
        drawCanvas.style.pointerEvents = 'auto';
        drawCanvas.style.cursor = 'crosshair';
        showToast("Lápiz activado: puedes dibujar y señalar en pantalla");
      } else {
        drawCanvas.style.pointerEvents = 'none';
        drawCanvas.style.cursor = 'default';
      }
    });

    // Select color
    document.querySelectorAll('.draw-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        drawColor = btn.getAttribute('data-color');
        document.querySelectorAll('.draw-color-btn').forEach(b => {
          b.classList.remove('ring-2', 'ring-white', 'scale-110');
        });
        btn.classList.add('ring-2', 'ring-white', 'scale-110');
      });
    });

    // Clear drawings
    if (drawClearBtn) {
      drawClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        window.loomRecorder.drawStrokes = [];
      });
    }

    // Drawing interaction
    drawCanvas.addEventListener('mousedown', (e) => {
      if (!window.loomRecorder.isDrawingActive) return;
      isPainting = true;
      currentStroke = {
        color: drawColor,
        width: 4,
        points: [{ x: e.clientX, y: e.clientY }]
      };
      dCtx.beginPath();
      dCtx.strokeStyle = drawColor;
      dCtx.lineWidth = 4;
      dCtx.lineCap = 'round';
      dCtx.lineJoin = 'round';
      dCtx.moveTo(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPainting || !currentStroke) return;
      currentStroke.points.push({ x: e.clientX, y: e.clientY });
      dCtx.lineTo(e.clientX, e.clientY);
      dCtx.stroke();
      window.loomRecorder.currentStroke = currentStroke;
    });

    window.addEventListener('mouseup', () => {
      if (!isPainting) return;
      isPainting = false;
      if (currentStroke && currentStroke.points.length > 1) {
        window.loomRecorder.drawStrokes.push(currentStroke);
      }
      currentStroke = null;
      window.loomRecorder.currentStroke = null;
    });
  }
}

function updateTimerDisplay(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  if (barTimer) barTimer.textContent = `${m}:${s}`;
}

// 3..2..1 Countdown
function runCountdown() {
  return new Promise((resolve) => {
    countdownOverlay.classList.remove('hidden');
    let count = 3;
    countdownDigit.textContent = count;

    // Beep audio effect
    playBeep(440);

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownDigit.textContent = count;
        playBeep(440);
      } else {
        clearInterval(interval);
        countdownDigit.textContent = "GO!";
        playBeep(880);
        setTimeout(() => {
          countdownOverlay.classList.add('hidden');
          resolve();
        }, 400);
      }
    }, 900);
  });
}

function playBeep(freq = 440) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (e) {}
}

// Draggable Camera Bubble
function setupCameraBubbleDragging() {
  let isDragging = false;
  let startX, startY;
  let bubbleX = 28;
  let bubbleY = window.innerHeight - 200;

  cameraBubble.style.left = `${bubbleX}px`;
  cameraBubble.style.top = `${bubbleY}px`;
  cameraBubble.style.bottom = 'auto';

  cameraBubble.addEventListener('mousedown', (e) => {
    if (e.target.closest('.bubble-tool-btn')) return;
    isDragging = true;
    startX = e.clientX - cameraBubble.offsetLeft;
    startY = e.clientY - cameraBubble.offsetTop;
    cameraBubble.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let newX = e.clientX - startX;
    let newY = e.clientY - startY;

    // Viewport bounds
    newX = Math.max(10, Math.min(window.innerWidth - cameraBubble.offsetWidth - 10, newX));
    newY = Math.max(10, Math.min(window.innerHeight - cameraBubble.offsetHeight - 10, newY));

    cameraBubble.style.left = `${newX}px`;
    cameraBubble.style.top = `${newY}px`;
    window.loomRecorder.bubblePos = { x: newX + cameraBubble.offsetWidth / 2, y: newY + cameraBubble.offsetHeight / 2 };
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      cameraBubble.style.transition = 'box-shadow 0.2s ease, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    }
  });

  // Bubble tools: size cycle (sm -> md -> lg)
  const sizes = ['size-sm', 'size-md', 'size-lg'];
  let currentSizeIdx = 1;
  bubbleSizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cameraBubble.classList.remove(sizes[currentSizeIdx]);
    currentSizeIdx = (currentSizeIdx + 1) % sizes.length;
    cameraBubble.classList.add(sizes[currentSizeIdx]);
    window.loomRecorder.bubbleSize = sizes[currentSizeIdx].replace('size-', '');
  });

  // Flip mirror
  bubbleFlipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.loomRecorder.isMirrored = !window.loomRecorder.isMirrored;
    webcamPreviewVideo.style.transform = window.loomRecorder.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
  });

  // Close bubble
  bubbleCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCamera();
  });
}

// Setup Sidebar Categories & Search
function setupNavCategories() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.remove('active', 'text-indigo-600', 'bg-indigo-50/70');
        i.classList.add('text-gray-600');
      });
      item.classList.add('active', 'text-indigo-600', 'bg-indigo-50/70');
      item.classList.remove('text-gray-600');

      activeCategory = item.getAttribute('data-tab') || 'videos';
      libraryTitle.textContent = activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1);
      fetchVideos();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      fetchVideos(e.target.value.trim());
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => fetchVideos());
  }
}

// Toggle Video Context Menu
window.toggleVideoMenu = function(videoId, event) {
  event.stopPropagation();
  event.preventDefault();

  // Remove existing dropdown if any
  const existing = document.getElementById('active-video-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'active-video-menu';
  menu.className = 'absolute bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 w-44 z-50 text-xs text-gray-700 animate-in fade-in zoom-in-95 duration-100';
  
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.min(window.innerWidth - 180, rect.left + window.scrollX - 140)}px`;

  menu.innerHTML = `
    <button onclick="copyVideoLink('${videoId}')" class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2">
      <i data-lucide="link" class="w-3.5 h-3.5 text-gray-400"></i>
      <span>Copiar enlace</span>
    </button>
    <button onclick="downloadVideoById('${videoId}')" class="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2">
      <i data-lucide="download" class="w-3.5 h-3.5 text-gray-400"></i>
      <span>Descargar</span>
    </button>
    <div class="h-px bg-gray-100 my-1"></div>
    <button onclick="deleteVideo('${videoId}')" class="w-full px-3 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2">
      <i data-lucide="trash-2" class="w-3.5 h-3.5 text-red-500"></i>
      <span>Eliminar video</span>
    </button>
  `;

  document.body.appendChild(menu);
  lucide.createIcons();

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      window.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => window.addEventListener('click', closeMenu), 10);
};

window.copyVideoLink = function(id) {
  const url = `${window.location.origin}/v/${id}`;
  navigator.clipboard.writeText(url);
  showToast("¡Enlace copiado al portapapeles!");
};

window.downloadVideoById = function(id) {
  const vid = currentVideos.find(v => v.id === id);
  if (!vid) return;
  const url = vid.videoUrl || (vid.filename ? `/uploads/${vid.filename}` : vid.demoUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${vid.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("Descargando video...");
};

window.deleteVideo = async function(id) {
  if (!confirm("¿Estás seguro de que deseas eliminar este video?")) return;
  try {
    const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast("Video eliminado con éxito");
      fetchVideos();
    }
  } catch (err) {
    alert("No se pudo eliminar el video");
  }
};

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notice';
  toast.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i><span>${message}</span>`;
  document.body.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => toast.remove(), 2500);
}

// Formato de tiempo relativo en español
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "Hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
