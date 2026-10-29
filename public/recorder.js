/**
 * Loom Clone - Advanced Screen & Webcam Recording Engine
 * Fixed & Optimized:
 * - Robust camera & microphone constraints (prevents OverconstrainedError on Windows webcams)
 * - Screen video element attached to DOM for active GPU rendering (prevents black screen)
 * - Canvas compositor with direct fallback to native screen stream when camera is disabled
 * - Safe thumbnail extraction
 */

class LoomRecorder {
  constructor() {
    this.screenStream = null;
    this.cameraStream = null;
    this.audioStream = null;
    this.combinedStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    
    // States
    this.isRecording = false;
    this.isPaused = false;
    this.recordDuration = 0;
    this.timerInterval = null;
    
    // Settings
    this.cameraEnabled = true;
    this.micEnabled = true;
    this.selectedCameraId = '';
    this.selectedMicId = '';
    this.cameraDevices = [];
    this.micDevices = [];
    this.bubbleSize = 'md'; // sm, md, lg
    this.isMirrored = true;
    this.isBlur = false;
    this.facingMode = 'user'; // 'user' (selfie/frontal) or 'environment' (trasera)
    
    // Bubble coordinates
    this.bubblePos = { x: 40, y: window.innerHeight - 220 };
    
    // Audio Visualizer
    this.audioContext = null;
    this.analyser = null;
    this.visualizerCanvas = null;
    this.visualizerCtx = null;
    this.visualizerAnimFrame = null;
    
    // Compositing Canvas
    this.compositeCanvas = null;
    this.compositeCtx = null;
    this.compositeAnimFrame = null;
    this.compositorWorker = null;
    this.screenVideoElem = null;
    this.cameraVideoElem = null;
    this.isCompositing = false;
    
    // Drawing tool
    this.isDrawingActive = false;
    this.drawStrokes = [];
    this.currentStroke = null;
    
    // Callbacks
    this.onDurationUpdate = null;
    this.onStateChange = null;
  }

  // Initialize devices
  async initDevices() {
    try {
      // First try to get permission briefly so devices have labels
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach(t => t.stop());
      } catch (permErr) {
        console.warn("Initial media permission prompt closed or denied:", permErr);
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameraDevices = devices.filter(d => d.kind === 'videoinput');
      this.micDevices = devices.filter(d => d.kind === 'audioinput');
      
      if (this.cameraDevices.length > 0 && !this.selectedCameraId) {
        this.selectedCameraId = this.cameraDevices[0].deviceId;
      }
      if (this.micDevices.length > 0 && !this.selectedMicId) {
        this.selectedMicId = this.micDevices[0].deviceId;
      }
      
      return { cameras: this.cameraDevices, mics: this.micDevices };
    } catch (err) {
      console.warn("Could not enumerate devices:", err);
      return { cameras: [], mics: [] };
    }
  }

  // Start Camera preview with resilient fallback & mobile front/rear camera support
  async startCameraPreview(previewVideoElem, facingMode = null) {
    if (facingMode) {
      this.facingMode = facingMode;
      this.isMirrored = (facingMode === 'user');
    }

    if (!this.cameraEnabled) {
      this.stopCameraPreview();
      return;
    }

    try {
      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(t => t.stop());
      }

      let stream = null;
      try {
        const videoConstraints = this.selectedCameraId 
          ? { deviceId: { ideal: this.selectedCameraId }, facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } };
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      } catch (err1) {
        console.warn("Standard camera constraint failed, falling back to simple facingMode", err1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facingMode }, audio: false });
        } catch (err2) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      this.cameraStream = stream;

      if (previewVideoElem) {
        this.cameraVideoElem = previewVideoElem;
        previewVideoElem.srcObject = this.cameraStream;
        previewVideoElem.muted = true;
        previewVideoElem.setAttribute('playsinline', '');
        previewVideoElem.setAttribute('webkit-playsinline', '');
        previewVideoElem.setAttribute('autoplay', '');
        await previewVideoElem.play().catch(e => console.warn("Camera play error:", e));
      }
      this.cameraEnabled = true;
    } catch (err) {
      console.error("Camera preview completely failed:", err);
      this.cameraEnabled = false;
    }
  }

  stopCameraPreview() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    if (this.cameraVideoElem) {
      this.cameraVideoElem.srcObject = null;
    }
  }

  // Connect microphone and start animated wave visualizer
  async startAudioVisualizer(canvasElem) {
    if (!this.micEnabled) {
      this.stopAudioVisualizer();
      return;
    }

    try {
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(t => t.stop());
      }

      let stream = null;
      try {
        const audioConstraints = this.selectedMicId 
          ? { deviceId: { ideal: this.selectedMicId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true };
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: audioConstraints });
      } catch (err1) {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      }

      this.audioStream = stream;
      this.visualizerCanvas = canvasElem;
      this.visualizerCtx = canvasElem.getContext('2d');

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      this.renderAudioWave();
    } catch (err) {
      console.warn("Microphone access failed:", err);
      this.micEnabled = false;
    }
  }

  renderAudioWave() {
    if (!this.analyser || !this.visualizerCtx || !this.visualizerCanvas) return;

    const canvas = this.visualizerCanvas;
    const ctx = this.visualizerCtx;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.visualizerAnimFrame = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = 3;
      const gap = 2;
      const numBars = 10;
      const totalWidth = numBars * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;

      for (let i = 0; i < numBars; i++) {
        const val = dataArray[i * 2] || 0;
        const percent = val / 255;
        const barHeight = Math.max(3, percent * (canvas.height - 4));
        const x = startX + i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;

        ctx.fillStyle = this.micEnabled ? '#10b981' : '#6b7280';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    };

    draw();
  }

  stopAudioVisualizer() {
    if (this.visualizerAnimFrame) cancelAnimationFrame(this.visualizerAnimFrame);
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
    }
  }

  // Start complete recording with screen + webcam composite or camera-only mobile mode
  async startRecording(recordingMode = 'screen', onReadyCallback = null) {
    this.recordedChunks = [];
    this.recordDuration = 0;

    // A. Camera-Only / Mobile Video Message Mode
    if (recordingMode === 'camera') {
      try {
        if (!this.cameraStream || !this.cameraStream.active) {
          await this.startCameraPreview(this.cameraVideoElem, this.facingMode);
        }
        if (!this.cameraStream || !this.cameraStream.active) {
          throw new Error("No se pudo iniciar la cámara.");
        }
      } catch (camErr) {
        console.error("Camera access error:", camErr);
        throw new Error("Permiso de cámara denegado o no disponible en este dispositivo.");
      }

      // Prepare audio
      if (this.micEnabled) {
        try {
          if (!this.audioStream || !this.audioStream.active) {
            this.audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          }
        } catch (micErr) {
          console.warn("Microphone access failed for camera recording:", micErr);
        }
      }

      // Execute countdown callback
      if (onReadyCallback && typeof onReadyCallback === 'function') {
        try {
          await onReadyCallback();
        } catch (cbErr) {
          console.warn("Ready callback error:", cbErr);
        }
      }

      const camVideoTrack = this.cameraStream.getVideoTracks()[0];
      const audioTracks = (this.micEnabled && this.audioStream) ? this.audioStream.getAudioTracks() : [];
      this.combinedStream = new MediaStream([camVideoTrack, ...audioTracks]);

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/mp4'; // iOS Safari compatibility
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = '';
            }
          }
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      this.mediaRecorder = new MediaRecorder(this.combinedStream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;
      this.isPaused = false;

      this.timerInterval = setInterval(() => {
        if (!this.isPaused) {
          this.recordDuration++;
          if (this.onDurationUpdate) this.onDurationUpdate(this.recordDuration);
        }
      }, 1000);

      if (this.onStateChange) this.onStateChange({ isRecording: true, isPaused: false });
      return;
    }

    // B. Screen / Window / Tab Mode
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      throw new Error("SCREEN_NOT_SUPPORTED_ON_DEVICE");
    }

    // 1. Get Screen Stream (with modern surface hints and resilient fallback)
    try {
      const getOptions = (includeAudio) => {
        const opts = {
          video: {
            cursor: 'always'
          },
          audio: includeAudio
        };
        if (recordingMode === 'window') {
          opts.video.displaySurface = 'window';
        } else if (recordingMode === 'tab') {
          opts.video.displaySurface = 'browser';
        } else {
          opts.video.displaySurface = 'monitor';
        }

        // Avoid capturing the current AppzGrabar tab by default when user wants window/screen
        opts.preferCurrentTab = (recordingMode === 'tab');
        opts.selfBrowserSurface = (recordingMode === 'tab') ? 'include' : 'exclude';
        opts.surfaceSwitching = 'include';
        opts.systemAudio = includeAudio ? 'include' : 'exclude';
        return opts;
      };

      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia(getOptions(true));
      } catch (audioErr) {
        console.warn("Screen capture with system audio not supported or denied, falling back to video-only capture:", audioErr);
        this.screenStream = await navigator.mediaDevices.getDisplayMedia(getOptions(false));
      }
    } catch (err) {
      console.error("Screen capture cancelled or denied:", err);
      throw new Error("Captura de pantalla cancelada o permiso denegado.");
    }

    // Now that the user selected their screen/window, execute any preparatory callback (e.g. 3..2..1 countdown)
    if (onReadyCallback && typeof onReadyCallback === 'function') {
      try {
        await onReadyCallback();
      } catch (cbErr) {
        console.warn("Ready callback error:", cbErr);
      }
    }

    // Handle user clicking "Stop sharing" on browser native ribbon
    const screenTrack = this.screenStream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.onended = () => {
        if (this.isRecording) {
          console.log("Flujo de pantalla finalizado por el navegador. Guardando video grabado...");
          const stopBtn = document.getElementById('bar-stop-btn');
          if (stopBtn) stopBtn.click();
        }
      };
    }

    // 2. Prepare screen video element ATTACHED TO DOM for active GPU rendering
    // Remove any previous element to guarantee a fresh stream with no frozen frames
    if (this.screenVideoElem) {
      try {
        this.screenVideoElem.pause();
        this.screenVideoElem.srcObject = null;
        this.screenVideoElem.remove();
      } catch (e) {}
      this.screenVideoElem = null;
    }

    this.screenVideoElem = document.createElement('video');
    this.screenVideoElem.id = 'loom-internal-screen-stream';
    this.screenVideoElem.setAttribute('playsinline', '');
    this.screenVideoElem.setAttribute('autoplay', '');
    this.screenVideoElem.muted = true;
    // Keep it in DOM with slight opacity so Chrome's GPU compositor decodes all frames even in background
    this.screenVideoElem.style.cssText = 'position:fixed;bottom:0;right:0;width:4px;height:4px;opacity:0.01;pointer-events:none;z-index:-999;';
    document.body.appendChild(this.screenVideoElem);

    this.screenVideoElem.srcObject = this.screenStream;

    // Wait for the video element to have valid frames and be playing
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      this.screenVideoElem.onloadedmetadata = () => {
        this.screenVideoElem.play().then(done).catch(done);
      };
      setTimeout(done, 500);
    });

    const trackSettings = screenTrack ? screenTrack.getSettings() : {};
    const screenWidth = this.screenVideoElem.videoWidth || trackSettings.width || 1920;
    const screenHeight = this.screenVideoElem.videoHeight || trackSettings.height || 1080;

    // 3. Create Compositing Canvas
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = screenWidth;
    this.compositeCanvas.height = screenHeight;
    this.compositeCtx = this.compositeCanvas.getContext('2d', { alpha: false });

    // Check if webcam is actively producing live frames
    const hasLiveCamera = this.cameraEnabled && this.cameraStream && this.cameraStream.getVideoTracks().some(t => t.readyState === 'live');

    let videoTrackToRecord;

    if (hasLiveCamera) {
      // 4. Start compositor loop with background worker: draws screen + circular webcam + annotations
      this.isCompositing = true;
      this.startCanvasCompositor(screenWidth, screenHeight);
      const canvasStream = this.compositeCanvas.captureStream(30);
      videoTrackToRecord = canvasStream.getVideoTracks()[0];
    } else {
      // Direct Screen Track: Guarantees 100% native quality, flawless colors, and zero black screen risk!
      this.isCompositing = false;
      videoTrackToRecord = this.screenStream.getVideoTracks()[0];
    }

    // 5. Persistent Audio Mixing (Mic + Screen audio) - Kept on instance to prevent Garbage Collection
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (this.mixAudioContext && this.mixAudioContext.state !== 'closed') {
      try { this.mixAudioContext.close(); } catch (e) {}
    }
    this.mixAudioContext = new AudioCtx();
    this.audioDestination = this.mixAudioContext.createMediaStreamDestination();

    // Add screen audio if present
    const screenAudioTracks = this.screenStream.getAudioTracks();
    if (screenAudioTracks.length > 0) {
      try {
        this.screenAudioSource = this.mixAudioContext.createMediaStreamSource(new MediaStream([screenAudioTracks[0]]));
        this.screenAudioSource.connect(this.audioDestination);
      } catch (e) {
        console.warn("Screen audio mix error:", e);
      }
    }

    // Add microphone audio if enabled
    if (this.micEnabled && this.audioStream) {
      try {
        this.micAudioSource = this.mixAudioContext.createMediaStreamSource(this.audioStream);
        this.micAudioSource.connect(this.audioDestination);
      } catch (e) {
        console.warn("Mic audio mix error:", e);
      }
    }

    // Combine video track + mixed audio tracks
    const audioTracks = this.audioDestination ? this.audioDestination.stream.getAudioTracks() : [];
    const mixedTracks = [videoTrackToRecord, ...audioTracks];
    this.combinedStream = new MediaStream(mixedTracks);

    // 6. Initialize MediaRecorder with fault tolerance
    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = new MediaRecorder(this.combinedStream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onerror = (e) => {
      console.error("MediaRecorder error caught:", e);
      if (this.isRecording) {
        const stopBtn = document.getElementById('bar-stop-btn');
        if (stopBtn) stopBtn.click();
      }
    };

    // Slice in 1-second intervals
    this.mediaRecorder.start(1000);
    this.isRecording = true;
    this.isPaused = false;

    // Start timer
    this.timerInterval = setInterval(() => {
      if (!this.isPaused) {
        this.recordDuration++;
        if (this.onDurationUpdate) this.onDurationUpdate(this.recordDuration);
      }
    }, 1000);

    if (this.onStateChange) this.onStateChange({ isRecording: true, isPaused: false });
  }

  // Draw screen + circular camera bubble in real time onto canvas
  // Background-proof: uses requestAnimationFrame for foreground + Web Worker ticker for background tabs
  startCanvasCompositor(width, height) {
    const ctx = this.compositeCtx;

    const renderFrame = () => {
      if (!this.isRecording || !this.isCompositing) return;

      const curW = this.screenVideoElem ? (this.screenVideoElem.videoWidth || width) : width;
      const curH = this.screenVideoElem ? (this.screenVideoElem.videoHeight || height) : height;

      if (this.compositeCanvas.width !== curW || this.compositeCanvas.height !== curH) {
        this.compositeCanvas.width = curW;
        this.compositeCanvas.height = curH;
      }

      // Draw active screen / window
      if (this.screenVideoElem && this.screenVideoElem.readyState >= 1) {
        try {
          ctx.drawImage(this.screenVideoElem, 0, 0, curW, curH);
        } catch (e) {}
      }

      // Draw active annotations if any
      this.drawAnnotationsOnCanvas(ctx, curW, curH);

      // Draw Draggable Circular Webcam Bubble
      if (this.cameraEnabled && this.cameraVideoElem && this.cameraVideoElem.readyState >= 1) {
        this.drawCameraBubbleOnCanvas(ctx, curW, curH);
      }
    };

    // 1. Web Worker ticker ensures rendering NEVER stops when user focuses another window/tab
    try {
      if (this.compositorWorker) {
        try { this.compositorWorker.terminate(); } catch (e) {}
      }
      const workerBlob = new Blob([`
        let id = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (id) clearInterval(id);
            id = setInterval(() => { postMessage('tick'); }, 33);
          } else if (e.data === 'stop') {
            if (id) clearInterval(id);
            id = null;
          }
        };
      `], { type: 'application/javascript' });
      this.compositorWorker = new Worker(URL.createObjectURL(workerBlob));
      this.compositorWorker.onmessage = () => {
        if (document.hidden) {
          renderFrame();
        }
      };
      this.compositorWorker.postMessage('start');
    } catch (workerErr) {
      console.warn("Worker compositor ticker fallback:", workerErr);
    }

    // 2. High-performance requestAnimationFrame loop for foreground
    const animLoop = () => {
      if (!this.isRecording || !this.isCompositing) return;
      this.compositeAnimFrame = requestAnimationFrame(animLoop);
      if (!document.hidden) {
        renderFrame();
      }
    };
    this.compositeAnimFrame = requestAnimationFrame(animLoop);
  }

  drawCameraBubbleOnCanvas(ctx, canvasW, canvasH) {
    let radius = 90;
    if (this.bubbleSize === 'sm') radius = 65;
    if (this.bubbleSize === 'lg') radius = 135;

    const scaleX = canvasW / window.innerWidth;
    const scaleY = canvasH / window.innerHeight;

    const bubbleElem = document.getElementById('camera-bubble');
    let bx = this.bubblePos.x;
    let by = this.bubblePos.y;

    if (bubbleElem) {
      const rect = bubbleElem.getBoundingClientRect();
      bx = rect.left + rect.width / 2;
      by = rect.top + rect.height / 2;
    }

    const cx = bx * scaleX;
    const cy = by * scaleY;
    const r = radius * ((scaleX + scaleY) / 2);

    ctx.save();

    // Outer shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    // White border ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Circular clip for webcam
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // Draw webcam video mirrored
    const cam = this.cameraVideoElem;
    const vidW = cam.videoWidth || 640;
    const vidH = cam.videoHeight || 480;
    const minDim = Math.min(vidW, vidH);
    const sx = (vidW - minDim) / 2;
    const sy = (vidH - minDim) / 2;

    ctx.save();
    if (this.isMirrored) {
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.drawImage(cam, sx, sy, minDim, minDim, -r, -r, r * 2, r * 2);
    } else {
      ctx.drawImage(cam, sx, sy, minDim, minDim, cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();

    ctx.restore();
  }

  drawAnnotationsOnCanvas(ctx, canvasW, canvasH) {
    if (this.drawStrokes.length === 0 && !this.currentStroke) return;

    const scaleX = canvasW / window.innerWidth;
    const scaleY = canvasH / window.innerHeight;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = [...this.drawStrokes];
    if (this.currentStroke) allStrokes.push(this.currentStroke);

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color || '#ff5745';
      ctx.lineWidth = (stroke.width || 5) * scaleX;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      if (this.onStateChange) this.onStateChange({ isRecording: true, isPaused: true });
    }
  }

  resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ isRecording: true, isPaused: false });
    }
  }

  async stopRecording() {
    return new Promise(async (resolve) => {
      clearInterval(this.timerInterval);
      this.isCompositing = false;
      if (this.compositeAnimFrame) cancelAnimationFrame(this.compositeAnimFrame);

      const buildAndFinish = async () => {
        // As long as we captured chunks, we never throw them away
        if (!this.recordedChunks || this.recordedChunks.length === 0) {
          this.cleanupStreams();
          this.isRecording = false;
          this.isPaused = false;
          if (this.onStateChange) this.onStateChange({ isRecording: false, isPaused: false });
          resolve(null);
          return;
        }

        const finalBlob = new Blob(this.recordedChunks, { type: 'video/webm' });

        // Generate crisp thumbnail
        let thumbBlob = null;
        try {
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = 640;
          thumbCanvas.height = 360;
          const tCtx = thumbCanvas.getContext('2d');
          
          if (this.compositeCanvas && this.compositeCanvas.width > 0) {
            tCtx.drawImage(this.compositeCanvas, 0, 0, 640, 360);
          } else if (this.screenVideoElem && this.screenVideoElem.videoWidth > 0) {
            tCtx.drawImage(this.screenVideoElem, 0, 0, 640, 360);
          } else if (this.cameraVideoElem && this.cameraVideoElem.videoWidth > 0) {
            tCtx.drawImage(this.cameraVideoElem, 0, 0, 640, 360);
          }
          thumbBlob = await new Promise(r => thumbCanvas.toBlob(r, 'image/jpeg', 0.85));
        } catch (e) {
          console.warn("Thumbnail capture error:", e);
        }

        const dur = Math.max(1, this.recordDuration);

        // Cleanup tracks
        this.cleanupStreams();

        this.isRecording = false;
        this.isPaused = false;
        if (this.onStateChange) this.onStateChange({ isRecording: false, isPaused: false });

        resolve({
          videoBlob: finalBlob,
          thumbnailBlob: thumbBlob,
          duration: dur
        });
      };

      if (!this.mediaRecorder) {
        await buildAndFinish();
        return;
      }

      if (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused') {
        try {
          this.mediaRecorder.requestData();
        } catch (e) {}

        this.mediaRecorder.onstop = buildAndFinish;
        try {
          this.mediaRecorder.stop();
        } catch (e) {
          await buildAndFinish();
        }
      } else {
        // MediaRecorder was already inactive or stopped (e.g. Chrome toolbar "Stop sharing")
        await buildAndFinish();
      }
    });
  }

  discardRecording() {
    clearInterval(this.timerInterval);
    this.isCompositing = false;
    if (this.compositeAnimFrame) cancelAnimationFrame(this.compositeAnimFrame);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }
    this.recordedChunks = [];
    this.cleanupStreams();
    this.isRecording = false;
    this.isPaused = false;
    this.recordDuration = 0;
    if (this.onStateChange) this.onStateChange({ isRecording: false, isPaused: false });
  }

  cleanupStreams() {
    if (this.compositorWorker) {
      try {
        this.compositorWorker.postMessage('stop');
        this.compositorWorker.terminate();
      } catch (e) {}
      this.compositorWorker = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach(t => t.stop());
      this.combinedStream = null;
    }
    if (this.screenVideoElem) {
      try {
        this.screenVideoElem.pause();
        this.screenVideoElem.srcObject = null;
        this.screenVideoElem.remove();
      } catch (e) {}
      this.screenVideoElem = null;
    }
    if (this.mixAudioContext && this.mixAudioContext.state !== 'closed') {
      try { this.mixAudioContext.close(); } catch (e) {}
      this.mixAudioContext = null;
    }
  }
}

// Export singleton instance
window.loomRecorder = new LoomRecorder();
