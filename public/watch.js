/**
 * Loom Clone - Video Watch, Share, & Collaboration Player
 */

// IndexedDB Fallback helper
const IDB_NAME = 'LoomCloneDB';
const IDB_STORE = 'videos';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getVideoFromIDB(id) {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Extract Video ID
function getVideoId() {
  const pathParts = window.location.pathname.split('/');
  const vIndex = pathParts.indexOf('v');
  if (vIndex !== -1 && pathParts[vIndex + 1]) {
    return pathParts[vIndex + 1];
  }
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id') || 'demo-loom-welcome';
}

const currentVideoId = getVideoId();
let currentVideoData = null;

// DOM Elements
const videoElem = document.getElementById('video-element');
const playerContainer = document.getElementById('player-container');
const centerPlayBtn = document.getElementById('center-play-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const rewindBtn = document.getElementById('rewind-btn');
const forwardBtn = document.getElementById('forward-btn');
const timeDisplay = document.getElementById('time-display');
const timelineScrubber = document.getElementById('timeline-scrubber');
const volumeSlider = document.getElementById('volume-slider');
const muteBtn = document.getElementById('mute-btn');
const speedBtn = document.getElementById('speed-btn');
const speedMenu = document.getElementById('speed-menu');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pipBtn = document.getElementById('pip-btn');
const reactionsCanvas = document.getElementById('reactions-canvas');

// Metadata elements
const videoTitle = document.getElementById('video-title');
const videoDescription = document.getElementById('video-description');
const saveMetadataBtn = document.getElementById('save-metadata-btn');
const authorAvatar = document.getElementById('author-avatar');
const authorName = document.getElementById('author-name');
const videoDate = document.getElementById('video-date');
const viewCount = document.getElementById('view-count');
const videoFilesize = document.getElementById('video-filesize');

// Comments & Summary elements
const tabBtnComments = document.getElementById('tab-btn-comments');
const tabBtnSummary = document.getElementById('tab-btn-summary');
const tabContentComments = document.getElementById('tab-content-comments');
const tabContentSummary = document.getElementById('tab-content-summary');
const commentsList = document.getElementById('comments-list');
const commentsBadge = document.getElementById('comments-badge');
const commentInput = document.getElementById('comment-input');
const sendCommentBtn = document.getElementById('send-comment-btn');
const currentTimestampBadge = document.getElementById('current-timestamp-badge');

// Share & Actions elements
const copyLinkBtn = document.getElementById('copy-link-btn');
const copyLinkText = document.getElementById('copy-link-text');
const downloadVideoBtn = document.getElementById('download-video-btn');
const shareModalBtn = document.getElementById('share-modal-btn');
const shareModal = document.getElementById('share-modal');
const closeShareModal = document.getElementById('close-share-modal');
const shareLinkInput = document.getElementById('share-link-input');
const modalCopyBtn = document.getElementById('modal-copy-btn');
const embedCodeInput = document.getElementById('embed-code-input');
const modalCopyEmbedBtn = document.getElementById('modal-copy-embed-btn');

document.addEventListener('DOMContentLoaded', async () => {
  await loadVideoData();
  setupPlayerControls();
  setupReactions();
  setupComments();
  setupShareAndActions();
});

// Load Video Data
async function loadVideoData() {
  try {
    const res = await fetch(`/api/videos/${currentVideoId}`);
    if (res.ok) {
      const data = await res.json();
      currentVideoData = data.video;
    }
  } catch (err) {
    console.warn("Backend fetch failed, checking IndexedDB...");
  }

  // Fallback to IndexedDB if offline or locally recorded
  if (!currentVideoData) {
    const idbVideo = await getVideoFromIDB(currentVideoId);
    if (idbVideo) {
      currentVideoData = idbVideo;
      if (idbVideo.blob) {
        currentVideoData.videoUrl = URL.createObjectURL(idbVideo.blob);
      }
    }
  }

  if (!currentVideoData) {
    alert("Video no encontrado");
    window.location.href = '/';
    return;
  }

  renderVideoDetails(currentVideoData);
}

// Render Video Details to UI
function renderVideoDetails(video) {
  document.title = `${video.title} - Loom`;
  videoTitle.textContent = video.title;
  videoDescription.textContent = video.description || 'Sin descripción';

  if (video.author) {
    authorName.textContent = video.author.name || 'Samantha Vance';
    if (video.author.avatar) authorAvatar.src = video.author.avatar;
  }

  videoDate.textContent = `Grabado el ${new Date(video.createdAt).toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  viewCount.textContent = video.views || 1;

  if (video.size) {
    const mb = (video.size / (1024 * 1024)).toFixed(1);
    videoFilesize.textContent = `${mb} MB`;
  }

  // Set video source
  const src = video.videoUrl || (video.filename ? `/uploads/${video.filename}` : video.demoUrl);
  videoElem.src = src;

  // Render reactions counts
  (video.reactions || []).forEach(r => {
    const badge = document.querySelector(`.reaction-count[data-emoji="${r.emoji}"]`);
    if (badge) badge.textContent = r.count;
  });

  // Render comments
  renderCommentsList(video.comments || []);

  // Update Share links
  shareLinkInput.value = window.location.href;
  embedCodeInput.value = `<iframe src="${window.location.origin}/v/${video.id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;

  lucide.createIcons();
}

// Setup Custom Video Player Controls
function setupPlayerControls() {
  // Center play button
  centerPlayBtn.addEventListener('click', togglePlay);
  playPauseBtn.addEventListener('click', togglePlay);
  videoElem.addEventListener('click', togglePlay);

  function togglePlay() {
    if (videoElem.paused || videoElem.ended) {
      videoElem.play();
      centerPlayBtn.classList.add('hidden');
      playPauseBtn.innerHTML = '<i data-lucide="pause" class="w-5 h-5 fill-current"></i>';
    } else {
      videoElem.pause();
      centerPlayBtn.classList.remove('hidden');
      playPauseBtn.innerHTML = '<i data-lucide="play" class="w-5 h-5 fill-current"></i>';
    }
    lucide.createIcons();
  }

  videoElem.addEventListener('play', () => {
    centerPlayBtn.classList.add('hidden');
    playPauseBtn.innerHTML = '<i data-lucide="pause" class="w-5 h-5 fill-current"></i>';
    lucide.createIcons();
  });

  videoElem.addEventListener('pause', () => {
    centerPlayBtn.classList.remove('hidden');
    playPauseBtn.innerHTML = '<i data-lucide="play" class="w-5 h-5 fill-current"></i>';
    lucide.createIcons();
  });

  // Time & Scrubber updates
  videoElem.addEventListener('timeupdate', () => {
    const current = videoElem.currentTime;
    const duration = videoElem.duration || 1;
    const percent = (current / duration) * 100;
    
    timelineScrubber.value = percent;
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    currentTimestampBadge.textContent = formatTime(current);
  });

  timelineScrubber.addEventListener('input', () => {
    const duration = videoElem.duration || 1;
    videoElem.currentTime = (timelineScrubber.value / 100) * duration;
  });

  // Rewind / Forward 5s
  rewindBtn.addEventListener('click', () => {
    videoElem.currentTime = Math.max(0, videoElem.currentTime - 5);
  });
  forwardBtn.addEventListener('click', () => {
    videoElem.currentTime = Math.min(videoElem.duration || 0, videoElem.currentTime + 5);
  });

  // Volume & Mute
  volumeSlider.addEventListener('input', () => {
    videoElem.volume = volumeSlider.value;
    videoElem.muted = volumeSlider.value == 0;
    updateVolumeIcon();
  });

  muteBtn.addEventListener('click', () => {
    videoElem.muted = !videoElem.muted;
    if (videoElem.muted) {
      volumeSlider.value = 0;
    } else {
      volumeSlider.value = videoElem.volume || 1;
    }
    updateVolumeIcon();
  });

  function updateVolumeIcon() {
    if (videoElem.muted || videoElem.volume == 0) {
      muteBtn.innerHTML = '<i data-lucide="volume-x" class="w-4 h-4 text-red-400"></i>';
    } else if (videoElem.volume < 0.5) {
      muteBtn.innerHTML = '<i data-lucide="volume-1" class="w-4 h-4"></i>';
    } else {
      muteBtn.innerHTML = '<i data-lucide="volume-2" class="w-4 h-4"></i>';
    }
    lucide.createIcons();
  }

  // Playback Speed Menu
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speedMenu.classList.toggle('hidden');
  });

  document.querySelectorAll('.speed-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const spd = parseFloat(opt.getAttribute('data-speed'));
      videoElem.playbackRate = spd;
      speedBtn.textContent = `${spd}x`;
      
      document.querySelectorAll('.speed-opt').forEach(o => {
        o.className = 'speed-opt px-2 py-1 text-left rounded text-xs hover:bg-white/10 text-gray-300';
      });
      opt.className = 'speed-opt px-2 py-1 text-left rounded text-xs bg-[#625df5] text-white font-semibold';
      speedMenu.classList.add('hidden');
    });
  });

  window.addEventListener('click', () => speedMenu.classList.add('hidden'));

  // Picture in picture
  pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoElem.requestPictureInPicture();
      }
    } catch (e) {
      console.warn("PiP not supported or failed:", e);
    }
  });

  // Fullscreen
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      playerContainer.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Keyboard shortcuts (Space = play/pause, Left/Right = skip, F = fullscreen)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft') {
      videoElem.currentTime = Math.max(0, videoElem.currentTime - 5);
    } else if (e.code === 'ArrowRight') {
      videoElem.currentTime = Math.min(videoElem.duration || 0, videoElem.currentTime + 5);
    } else if (e.code === 'KeyF') {
      fullscreenBtn.click();
    }
  });
}

// Setup Interactive Emoji Reactions
function setupReactions() {
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const emoji = btn.getAttribute('data-emoji');
      
      // Floating reaction visual effect
      spawnFloatingReaction(emoji);

      // Optimistic update
      const countSpan = btn.querySelector('.reaction-count');
      const cur = parseInt(countSpan.textContent) || 0;
      countSpan.textContent = cur + 1;

      // API request
      try {
        await fetch(`/api/videos/${currentVideoId}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji })
        });
      } catch (err) {
        console.warn("Reaction sync failed:", err);
      }
    });
  });
}

function spawnFloatingReaction(emoji) {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;

  // Random horizontal position inside player
  const randX = Math.random() * (playerContainer.offsetWidth - 60) + 30;
  el.style.left = `${randX}px`;
  el.style.bottom = '80px';

  reactionsCanvas.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// Setup Comments
function setupComments() {
  // Tabs switching
  tabBtnComments.addEventListener('click', () => {
    tabBtnComments.className = 'flex-1 py-2 rounded-lg bg-white text-gray-900 shadow-2xs font-bold transition-colors';
    tabBtnSummary.className = 'flex-1 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition-colors';
    tabContentComments.classList.remove('hidden');
    tabContentSummary.classList.add('hidden');
  });

  tabBtnSummary.addEventListener('click', () => {
    tabBtnSummary.className = 'flex-1 py-2 rounded-lg bg-white text-gray-900 shadow-2xs font-bold transition-colors';
    tabBtnComments.className = 'flex-1 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition-colors';
    tabContentSummary.classList.remove('hidden');
    tabContentComments.classList.add('hidden');
  });

  // Current timestamp badge click updates input
  currentTimestampBadge.addEventListener('click', () => {
    currentTimestampBadge.textContent = formatTime(videoElem.currentTime);
  });

  // Send comment
  sendCommentBtn.addEventListener('click', submitComment);
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitComment();
  });

  async function submitComment() {
    const text = commentInput.value.trim();
    if (!text) return;

    const timestamp = Math.floor(videoElem.currentTime);
    commentInput.value = '';

    try {
      const res = await fetch(`/api/videos/${currentVideoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          timestamp,
          authorName: "Samantha Vance",
          authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
        })
      });

      const data = await res.json();
      if (data.success) {
        renderCommentsList(data.comments);
      }
    } catch (err) {
      console.error("Submit comment error:", err);
    }
  }
}

function renderCommentsList(comments) {
  commentsBadge.textContent = comments.length;

  if (comments.length === 0) {
    commentsList.innerHTML = `
      <div class="text-center py-10 text-gray-400 text-xs">
        <i data-lucide="message-square" class="w-6 h-6 mx-auto mb-2 text-gray-300"></i>
        <span>No hay comentarios aún. ¡Escribe tus impresiones o comentarios!</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  commentsList.innerHTML = comments.map(c => `
    <div class="p-2.5 rounded-xl bg-gray-50/70 border border-gray-100 hover:bg-gray-50 transition-colors text-xs space-y-1">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <img src="${c.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'}" alt="${c.author}" class="w-5 h-5 rounded-full object-cover">
          <span class="font-semibold text-gray-800">${escapeHtml(c.author)}</span>
        </div>
        <!-- Clickable timestamp badge that jumps video! -->
        <button onclick="seekVideo(${c.timestamp})" class="font-mono text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-[#625df5] px-1.5 py-0.5 rounded transition-colors" title="Saltar al segundo ${c.timestampFormatted}">
          ${c.timestampFormatted || formatTime(c.timestamp)}
        </button>
      </div>
      <p class="text-gray-700 pl-7 leading-relaxed">${escapeHtml(c.text)}</p>
    </div>
  `).join('');

  lucide.createIcons();
}

// Global seek video function
window.seekVideo = function(seconds) {
  videoElem.currentTime = seconds;
  videoElem.play();
};

// Setup Share & Actions
function setupShareAndActions() {
  // Copy Link button in top header
  copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    copyLinkText.textContent = '¡Copiado!';
    setTimeout(() => copyLinkText.textContent = 'Copiar enlace', 2000);
  });

  // Download video button
  downloadVideoBtn.addEventListener('click', () => {
    if (!currentVideoData) return;
    const url = currentVideoData.videoUrl || `/uploads/${currentVideoData.filename}` || currentVideoData.demoUrl;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentVideoData.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // Share modal
  shareModalBtn.addEventListener('click', () => shareModal.classList.remove('hidden'));
  closeShareModal.addEventListener('click', () => shareModal.classList.add('hidden'));

  modalCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkInput.value);
    modalCopyBtn.textContent = '¡Copiado!';
    setTimeout(() => modalCopyBtn.textContent = 'Copiar', 2000);
  });

  modalCopyEmbedBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(embedCodeInput.value);
    modalCopyEmbedBtn.textContent = '¡Copiado!';
    setTimeout(() => modalCopyEmbedBtn.textContent = 'Copiar', 2000);
  });

  // Save edited title and description
  saveMetadataBtn.addEventListener('click', async () => {
    const newTitle = videoTitle.textContent.trim();
    const newDesc = videoDescription.textContent.trim();

    try {
      const res = await fetch(`/api/videos/${currentVideoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDesc })
      });
      const data = await res.json();
      if (data.success) {
        saveMetadataBtn.textContent = '¡Guardado!';
        saveMetadataBtn.className = 'px-3 py-1.5 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg transition-colors';
        setTimeout(() => {
          saveMetadataBtn.textContent = 'Guardar edición';
          saveMetadataBtn.className = 'px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors';
        }, 2000);
      }
    } catch (err) {
      alert("No se pudieron guardar los cambios.");
    }
  });
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
