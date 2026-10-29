const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'videos.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Admin Authentication Setup
function getAdminAuth() {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    } catch (e) {}
  }
  const defaultAuth = {
    email: process.env.ADMIN_EMAIL || "diego@appzplay.online",
    username: process.env.ADMIN_USERNAME || "admin",
    name: "Diego",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    password: process.env.ADMIN_PASSWORD || "admin123"
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(defaultAuth, null, 2));
  return defaultAuth;
}

// Active Sessions Store
const activeSessions = new Map();

function createSessionToken(username) {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000 // 30 days
  });
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const token = req.cookies?.appzgrabar_session || req.headers.authorization?.replace('Bearer ', '');
  if (isValidSession(token)) {
    return next();
  }
  res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
}

// Seed initial database if not exists
if (!fs.existsSync(DB_FILE)) {
  const initialData = [
    {
      id: "demo-appzgrabar-welcome",
      title: "Bienvenido a AppzGrabar - Recorrido rápido 🚀",
      description: "Aprende cómo grabar tu pantalla y cámara, compartir enlaces al instante y colaborar con comentarios con marca de tiempo.",
      filename: "",
      demoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      duration: 596,
      durationFormatted: "09:56",
      size: 15400000,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      views: 42,
      author: {
        name: "Diego",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
        role: "Administrador"
      },
      category: "videos",
      reactions: [
        { emoji: "🔥", count: 8 },
        { emoji: "👍", count: 14 },
        { emoji: "❤️", count: 6 },
        { emoji: "🎉", count: 5 }
      ],
      comments: [
        {
          id: "c1",
          author: "Alex Rivera",
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
          text: "¡La burbuja de la cámara web circular es súper fluida! Me encanta cómo se ve.",
          timestamp: 12,
          timestampFormatted: "00:12",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
        }
      ],
      chapters: [
        { title: "Introducción y vista general", time: 0 },
        { title: "Grabación de pantalla y cámara", time: 15 }
      ]
    }
  ];
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

function getVideosDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveVideosDB(videos) {
  fs.writeFileSync(DB_FILE, JSON.stringify(videos, null, 2));
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || (file.fieldname === 'thumbnail' ? '.jpg' : '.webm');
    const safeName = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 500 // 500 MB limit
  }
});

// Middlewares
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Route Guard for Dashboard (Requires Login)
app.get(['/', '/index.html'], (req, res, next) => {
  const token = req.cookies?.appzgrabar_session;
  if (!isValidSession(token)) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route Guard for Login Page (Redirect to / if already logged in)
app.get('/login.html', (req, res, next) => {
  const token = req.cookies?.appzgrabar_session;
  if (isValidSession(token)) {
    return res.redirect('/');
  }
  next();
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// AUTHENTICATION API ROUTES
// =========================================================================

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const admin = getAdminAuth();
  const inputUser = username.trim().toLowerCase();
  const validUser = inputUser === admin.username.toLowerCase() || inputUser === admin.email.toLowerCase();
  const validPass = password === admin.password;

  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const token = createSessionToken(admin.username);
  res.cookie('appzgrabar_session', token, {
    httpOnly: true,
    maxAge: 30 * 24 * 3600 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  res.json({
    success: true,
    token,
    user: {
      name: admin.name,
      email: admin.email,
      avatar: admin.avatar,
      username: admin.username
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.appzgrabar_session;
  if (token) activeSessions.delete(token);
  res.clearCookie('appzgrabar_session');
  res.json({ success: true, message: 'Sesión cerrada correctamente' });
});

// Get Current User Status
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.appzgrabar_session || req.headers.authorization?.replace('Bearer ', '');
  if (!isValidSession(token)) {
    return res.json({ authenticated: false });
  }
  const admin = getAdminAuth();
  res.json({
    authenticated: true,
    user: {
      name: admin.name,
      email: admin.email,
      avatar: admin.avatar,
      username: admin.username
    }
  });
});

// Change Password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = getAdminAuth();

  if (admin.password !== currentPassword) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  }

  admin.password = newPassword;
  fs.writeFileSync(AUTH_FILE, JSON.stringify(admin, null, 2));
  res.json({ success: true, message: 'Contraseña actualizada correctamente' });
});

// =========================================================================
// VIDEO STREAMING (HTTP 206 Partial Content)
// =========================================================================
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (fileSize === 0) {
    res.writeHead(200, {
      'Content-Length': 0,
      'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
    });
    return res.end();
  }

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = Math.max(0, parseInt(parts[0], 10) || 0);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.max(0, fileSize - 1);
    const chunksize = Math.max(0, (end - start) + 1);
    const file = fs.createReadStream(filePath, { start, end: Math.max(start, end) });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// =========================================================================
// VIDEO API ROUTES
// =========================================================================

// 1. Get all videos (PROTECTED: Only authenticated user can view their library)
app.get('/api/videos', requireAuth, (req, res) => {
  const { search, category } = req.query;
  let list = getVideosDB();

  if (category && category !== 'all') {
    list = list.filter(v => v.category === category);
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(v => 
      (v.title && v.title.toLowerCase().includes(q)) || 
      (v.description && v.description.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, count: list.length, videos: list });
});

// 2. Get single video by ID (PUBLIC: Anyone with the share link can watch)
app.get('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const list = getVideosDB();
  const video = list.find(v => v.id === id);

  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  video.views = (video.views || 0) + 1;
  saveVideosDB(list);

  res.json({ success: true, video });
});

// 3. Upload new video (PROTECTED: Only authenticated user can record and upload)
app.post('/api/videos/upload', requireAuth, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const videoFile = req.files.video[0];
    const thumbFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    const durationNum = parseInt(req.body.duration) || 0;
    const mins = Math.floor(durationNum / 60);
    const secs = durationNum % 60;
    const durationFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const admin = getAdminAuth();

    const newVideo = {
      id: uuidv4().slice(0, 12),
      title: req.body.title || `Grabación de Pantalla - ${new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      description: req.body.description || "Grabado con AppzGrabar",
      filename: videoFile.filename,
      videoUrl: `/uploads/${videoFile.filename}`,
      thumbnail: thumbFile ? `/uploads/${thumbFile.filename}` : null,
      duration: durationNum,
      durationFormatted: durationFormatted,
      size: videoFile.size,
      createdAt: new Date().toISOString(),
      views: 1,
      category: req.body.category || 'videos',
      author: {
        name: admin.name || "Diego",
        avatar: admin.avatar,
        role: "Creador"
      },
      reactions: [
        { emoji: "🔥", count: 0 },
        { emoji: "👍", count: 0 },
        { emoji: "❤️", count: 0 },
        { emoji: "🎉", count: 0 },
        { emoji: "🚀", count: 0 }
      ],
      comments: [],
      chapters: [
        { title: "Inicio", time: 0 }
      ]
    };

    const list = getVideosDB();
    list.unshift(newVideo);
    saveVideosDB(list);

    res.status(201).json({ success: true, video: newVideo });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: 'Error durante la subida', details: err.message });
  }
});

// 4. Update video details (PROTECTED)
app.patch('/api/videos/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { title, description, category } = req.body;
  const list = getVideosDB();
  const index = list.findIndex(v => v.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video no encontrado' });
  }

  if (title !== undefined) list[index].title = title;
  if (description !== undefined) list[index].description = description;
  if (category !== undefined) list[index].category = category;

  saveVideosDB(list);
  res.json({ success: true, video: list[index] });
});

// 5. Add reaction (PUBLIC: Viewers can react)
app.post('/api/videos/:id/reactions', (req, res) => {
  const { id } = req.params;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji requerido' });

  const list = getVideosDB();
  const video = list.find(v => v.id === id);
  if (!video) return res.status(404).json({ error: 'Video no encontrado' });

  if (!video.reactions) video.reactions = [];
  let item = video.reactions.find(r => r.emoji === emoji);
  if (item) {
    item.count += 1;
  } else {
    video.reactions.push({ emoji, count: 1 });
  }

  saveVideosDB(list);
  res.json({ success: true, reactions: video.reactions });
});

// 6. Add comment (PUBLIC: Viewers can comment)
app.post('/api/videos/:id/comments', (req, res) => {
  const { id } = req.params;
  const { text, timestamp, authorName, authorAvatar } = req.body;
  if (!text) return res.status(400).json({ error: 'Texto del comentario requerido' });

  const list = getVideosDB();
  const video = list.find(v => v.id === id);
  if (!video) return res.status(404).json({ error: 'Video no encontrado' });

  const timeNum = Math.max(0, parseInt(timestamp) || 0);
  const mins = Math.floor(timeNum / 60);
  const secs = timeNum % 60;
  const timestampFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const newComment = {
    id: uuidv4().slice(0, 8),
    author: authorName || "Espectador",
    avatar: authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authorName || 'Invitado')}`,
    text: text.trim(),
    timestamp: timeNum,
    timestampFormatted,
    createdAt: new Date().toISOString()
  };

  if (!video.comments) video.comments = [];
  video.comments.push(newComment);

  saveVideosDB(list);
  res.json({ success: true, comment: newComment, comments: video.comments });
});

// 7. Delete video (PROTECTED: Only authenticated user can delete)
app.delete('/api/videos/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const list = getVideosDB();
  const index = list.findIndex(v => v.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video no encontrado' });
  }

  const removed = list.splice(index, 1)[0];

  if (removed.filename) {
    const filePath = path.join(UPLOADS_DIR, removed.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }

  saveVideosDB(list);
  res.json({ success: true, message: 'Video eliminado correctamente' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'AppzGrabar', uptime: process.uptime() });
});

// Watch video page (PUBLIC)
app.get('/v/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// Wildcard fallback
app.get('*', (req, res) => {
  const token = req.cookies?.appzgrabar_session;
  if (!isValidSession(token)) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🎥 AppzGrabar Server is running on: http://localhost:${PORT}`);
  console.log(`📁 Video uploads stored in: ${UPLOADS_DIR}`);
  console.log(`🔐 Acceso protegido: Login en /login.html`);
  console.log(`=======================================================`);
});
