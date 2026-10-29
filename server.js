const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'videos.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Seed initial database if not exists
if (!fs.existsSync(DB_FILE)) {
  const initialData = [
    {
      id: "demo-loom-welcome",
      title: "Welcome to Loom Clone - Quick Product Tour 🚀",
      description: "Learn how to record your screen and camera, share instant links, and collaborate with timestamped comments.",
      filename: "",
      demoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      duration: 596,
      durationFormatted: "09:56",
      size: 15400000,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      views: 42,
      author: {
        name: "Samantha Vance",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
        role: "Workspace Owner"
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
          text: "The camera bubble positioning is super smooth! Love this feature.",
          timestamp: 12,
          timestampFormatted: "00:12",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
          id: "c2",
          author: "Elena Rostova",
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80",
          text: "Can we share links publicly without requiring login? Yes, works like a charm!",
          timestamp: 45,
          timestampFormatted: "00:45",
          createdAt: new Date(Date.now() - 3600000).toISOString()
        }
      ],
      chapters: [
        { title: "Intro & Overview", time: 0 },
        { title: "Screen & Camera Recording", time: 15 },
        { title: "Sharing & Collaboration", time: 48 }
      ]
    },
    {
      id: "demo-loom-ui",
      title: "Design System & UI Components Walkthrough",
      description: "Quick 3-minute async update on our latest UI designs, floating recorder widgets, and dark mode palette.",
      filename: "",
      demoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      thumbnail: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80",
      duration: 180,
      durationFormatted: "03:00",
      size: 8900000,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      views: 19,
      author: {
        name: "Samantha Vance",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
        role: "Product Lead"
      },
      category: "videos",
      reactions: [
        { emoji: "🚀", count: 12 },
        { emoji: "👍", count: 7 }
      ],
      comments: [],
      chapters: []
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Video Streaming with HTTP 206 Partial Content
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
    // Parse Range header e.g. "bytes=0-1048575"
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

// API Routes

// 1. Get all videos
app.get('/api/videos', (req, res) => {
  const { search, category, sort } = req.query;
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

  // Sort: newest first by default
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, count: list.length, videos: list });
});

// 2. Get single video by ID
app.get('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const list = getVideosDB();
  const video = list.find(v => v.id === id);

  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  // Increment views
  video.views = (video.views || 0) + 1;
  saveVideosDB(list);

  res.json({ success: true, video });
});

// 3. Upload new video
app.post('/api/videos/upload', upload.fields([
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

    const newVideo = {
      id: uuidv4().slice(0, 12),
      title: req.body.title || `Screen Recording - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      description: req.body.description || "Recorded with Loom Clone",
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
        name: req.body.authorName || "Samantha Vance",
        avatar: req.body.authorAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
        role: "Creator"
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
        { title: "Start", time: 0 }
      ]
    };

    const list = getVideosDB();
    list.unshift(newVideo);
    saveVideosDB(list);

    res.status(201).json({ success: true, video: newVideo });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: 'Internal server error during upload', details: err.message });
  }
});

// 4. Update video details (title, description, category)
app.patch('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, category } = req.body;
  const list = getVideosDB();
  const index = list.findIndex(v => v.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video not found' });
  }

  if (title !== undefined) list[index].title = title;
  if (description !== undefined) list[index].description = description;
  if (category !== undefined) list[index].category = category;

  saveVideosDB(list);
  res.json({ success: true, video: list[index] });
});

// 5. Add reaction
app.post('/api/videos/:id/reactions', (req, res) => {
  const { id } = req.params;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

  const list = getVideosDB();
  const video = list.find(v => v.id === id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

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

// 6. Add comment
app.post('/api/videos/:id/comments', (req, res) => {
  const { id } = req.params;
  const { text, timestamp, authorName, authorAvatar } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment text is required' });

  const list = getVideosDB();
  const video = list.find(v => v.id === id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const timeNum = Math.max(0, parseInt(timestamp) || 0);
  const mins = Math.floor(timeNum / 60);
  const secs = timeNum % 60;
  const timestampFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const newComment = {
    id: uuidv4().slice(0, 8),
    author: authorName || "Visitor",
    avatar: authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authorName || 'Guest')}`,
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

// 7. Delete video
app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const list = getVideosDB();
  const index = list.findIndex(v => v.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const removed = list.splice(index, 1)[0];

  // Attempt to delete physical files if stored locally
  if (removed.filename) {
    const filePath = path.join(UPLOADS_DIR, removed.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }

  saveVideosDB(list);
  res.json({ success: true, message: 'Video deleted successfully' });
});

// Health check endpoint for cloud deployment (Render, Railway, Fly.io, etc)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Fallback route for video watch page
app.get('/v/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// Wildcard fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🎥 Loom Clone Server is running on: http://localhost:${PORT}`);
  console.log(`📁 Video uploads stored in: ${UPLOADS_DIR}`);
  console.log(`=======================================================`);
});
