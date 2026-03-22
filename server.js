// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4321;

const APP_ROOT = __dirname;
const LIBRARY_ROOT = path.join(APP_ROOT, 'library');
const DATA_DIR = path.join(APP_ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const COVER_NAMES = ['001', '01', '1', 'cover'];
const TITLE_FILES = ['title.txt', '_title.txt', 'name.txt', '_name.txt'];

app.use(express.json({ limit: '10mb' }));
app.use(express.static(APP_ROOT, { index: 'library.html' }));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const base = path.resolve(root);

  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Invalid path');
  }

  return resolved;
}

function naturalSort(items) {
  return [...items].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

function getImageFiles(folderPath) {
  if (!isDir(folderPath)) return [];

  const files = fs.readdirSync(folderPath).filter((name) => {
    const full = path.join(folderPath, name);
    return isFile(full) && IMAGE_EXTS.has(path.extname(name).toLowerCase());
  });

  return naturalSort(files);
}

function findCoverFile(folderPath) {
  for (const base of COVER_NAMES) {
    for (const ext of IMAGE_EXTS) {
      const candidate = path.join(folderPath, `${base}${ext}`);
      if (isFile(candidate)) return path.basename(candidate);
    }
  }

  const images = getImageFiles(folderPath);
  return images[0] || null;
}

function getDisplayTitle(folderPath, folderName) {
  for (const fileName of TITLE_FILES) {
    const candidate = path.join(folderPath, fileName);

    if (isFile(candidate)) {
      try {
        const text = fs.readFileSync(candidate, 'utf8').trim();
        if (text) return text;
      } catch {}
    }
  }

  return folderName;
}

function readState() {
  ensureDir(DATA_DIR);

  if (!fs.existsSync(STATE_PATH)) {
    const initial = {
      lastOpenedFolder: '',
      lastOpenedImageByFolder: {}
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      lastOpenedFolder: typeof parsed.lastOpenedFolder === 'string' ? parsed.lastOpenedFolder : '',
      lastOpenedImageByFolder:
        parsed.lastOpenedImageByFolder && typeof parsed.lastOpenedImageByFolder === 'object'
          ? parsed.lastOpenedImageByFolder
          : {}
    };
  } catch {
    return {
      lastOpenedFolder: '',
      lastOpenedImageByFolder: {}
    };
  }
}

function writeState(state) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

app.get('/api/prefs', (req, res) => {
  res.json(readState());
});

app.post('/api/prefs', (req, res) => {
  const patch = req.body || {};
  const state = readState();

  if (typeof patch.lastOpenedFolder === 'string') {
    state.lastOpenedFolder = patch.lastOpenedFolder;
  }

  if (patch.lastOpenedImageByFolder && typeof patch.lastOpenedImageByFolder === 'object') {
    state.lastOpenedImageByFolder = patch.lastOpenedImageByFolder;
  }

  writeState(state);
  res.json({ ok: true });
});

app.get('/api/library', (req, res) => {
  if (!isDir(LIBRARY_ROOT)) {
    return res.json([]);
  }

  const folders = fs.readdirSync(LIBRARY_ROOT).filter((name) => {
    return isDir(path.join(LIBRARY_ROOT, name));
  });

  const result = naturalSort(folders).map((folder) => {
    const folderPath = path.join(LIBRARY_ROOT, folder);
    const images = getImageFiles(folderPath);
    const cover = findCoverFile(folderPath);
    const title = getDisplayTitle(folderPath, folder);

    return {
      id: folder,
      name: title,
      folder,
      cover,
      imageCount: images.length
    };
  });

  res.json(result);
});

app.get('/api/folder-images', (req, res) => {
  const folder = req.query.folder;

  if (!folder) {
    return res.status(400).json({ error: 'folder is required' });
  }

  let folderPath;
  try {
    folderPath = safeJoin(LIBRARY_ROOT, folder);
  } catch {
    return res.status(400).json({ error: 'invalid folder' });
  }

  if (!isDir(folderPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  res.json(getImageFiles(folderPath));
});

app.get('/api/folder-meta', (req, res) => {
  const folder = req.query.folder;

  if (!folder) {
    return res.status(400).json({ error: 'folder is required' });
  }

  let folderPath;
  try {
    folderPath = safeJoin(LIBRARY_ROOT, folder);
  } catch {
    return res.status(400).json({ error: 'invalid folder' });
  }

  if (!isDir(folderPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  res.json({
    id: folder,
    folder,
    name: getDisplayTitle(folderPath, folder),
    cover: findCoverFile(folderPath),
    imageCount: getImageFiles(folderPath).length
  });
});

app.get('/img', (req, res) => {
  const folder = req.query.folder;
  const file = req.query.file;

  if (!folder || !file) {
    return res.status(400).send('missing params');
  }

  let filePath;
  try {
    filePath = safeJoin(LIBRARY_ROOT, folder, file);
  } catch {
    return res.status(400).send('invalid path');
  }

  if (!isFile(filePath)) {
    return res.status(404).send('not found');
  }

  res.sendFile(filePath);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(APP_ROOT, 'library.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});