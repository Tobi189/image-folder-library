const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const app = express();
const PORT = 4321;

const APP_ROOT = __dirname;
const LIBRARY_ROOT = path.join(APP_ROOT, 'library');
const DATA_DIR = path.join(APP_ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const THUMBS_ROOT = path.join(APP_ROOT, 'thumbs');

const thumbWarmJobs = new Map();
const thumbWarmStatus = new Map();
const thumbWarmCancel = new Map();

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.jfif',
  '.avif',
  '.tif',
  '.tiff',
  '.heic'
]);

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogg']);
const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);
const COVER_NAMES = ['001', '01', '1', 'cover'];
const TITLE_FILES = ['title.txt', '_title.txt', 'name.txt', '_name.txt'];

const THUMB_WIDTH = 420;
const THUMB_QUALITY = 78;

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

function getMediaType(name) {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

function getFastMediaSummary(folderPath) {
  if (!isDir(folderPath)) {
    return {
      mediaCount: 0,
      imageCount: 0,
      videoCount: 0,
      firstMedia: null
    };
  }

  const files = naturalSort(
    fs.readdirSync(folderPath).filter((name) => {
      const full = path.join(folderPath, name);
      return isFile(full) && MEDIA_EXTS.has(path.extname(name).toLowerCase());
    })
  );

  let imageCount = 0;
  let videoCount = 0;

  for (const name of files) {
    const type = getMediaType(name);
    if (type === 'image') imageCount++;
    else if (type === 'video') videoCount++;
  }

  return {
    mediaCount: files.length,
    imageCount,
    videoCount,
    firstMedia: files[0] || null
  };
}

function findCoverFileFast(folderPath) {
  for (const base of COVER_NAMES) {
    for (const ext of IMAGE_EXTS) {
      const candidate = path.join(folderPath, `${base}${ext}`);
      if (isFile(candidate)) return path.basename(candidate);
    }
  }

  const summary = getFastMediaSummary(folderPath);
  return summary.firstMedia;
}

function getFastMediaSummary(folderPath) {
  if (!isDir(folderPath)) {
    return {
      mediaCount: 0,
      imageCount: 0,
      videoCount: 0,
      firstMedia: null
    };
  }

  const files = naturalSort(
    fs.readdirSync(folderPath).filter((name) => {
      const full = path.join(folderPath, name);
      return isFile(full) && MEDIA_EXTS.has(path.extname(name).toLowerCase());
    })
  );

  let imageCount = 0;
  let videoCount = 0;

  for (const name of files) {
    const type = getMediaType(name);
    if (type === 'image') imageCount++;
    else if (type === 'video') videoCount++;
  }

  return {
    mediaCount: files.length,
    imageCount,
    videoCount,
    firstMedia: files[0] || null
  };
}

function findCoverFileFast(folderPath) {
  for (const base of COVER_NAMES) {
    for (const ext of IMAGE_EXTS) {
      const candidate = path.join(folderPath, `${base}${ext}`);
      if (isFile(candidate)) return path.basename(candidate);
    }
  }

  const summary = getFastMediaSummary(folderPath);
  return summary.firstMedia;
}

async function getImageSize(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    return {
      width: meta.width || 1,
      height: meta.height || 1
    };
  } catch {
    return { width: 1, height: 1 };
  }
}

async function getMediaFiles(folderPath) {
  if (!isDir(folderPath)) return [];

  const files = fs.readdirSync(folderPath).filter((name) => {
    const full = path.join(folderPath, name);
    return isFile(full) && MEDIA_EXTS.has(path.extname(name).toLowerCase());
  });

  const sorted = naturalSort(files);

  const results = await Promise.all(
    sorted.map(async (name) => {
      const fullPath = path.join(folderPath, name);
      const stats = fs.statSync(fullPath);
      const type = getMediaType(name);

      let width = 1;
      let height = 1;

      if (type === 'image') {
        const size = await getImageSize(fullPath);
        width = size.width;
        height = size.height;
      }

      return {
        name,
        type,
        mtimeMs: stats.mtimeMs,
        ctimeMs: stats.ctimeMs,
        width,
        height
      };
    })
  );

  return results;
}

async function findCoverFile(folderPath) {
  for (const base of COVER_NAMES) {
    for (const ext of IMAGE_EXTS) {
      const candidate = path.join(folderPath, `${base}${ext}`);
      if (isFile(candidate)) return path.basename(candidate);
    }
  }

  const media = await getMediaFiles(folderPath);
  return media[0]?.name || null;
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

function getThumbRelativePath(folder, file) {
  const safeName = file.replace(/[^a-z0-9._-]+/gi, '_');
  return path.join(folder, `${safeName}.thumb.jpg`);
}

async function ensureImageThumb(folder, file) {
  const originalPath = safeJoin(LIBRARY_ROOT, folder, file);

  if (!isFile(originalPath)) {
    throw new Error('Original not found');
  }

  if (getMediaType(file) !== 'image') {
    throw new Error('Not an image');
  }

  const thumbRelative = getThumbRelativePath(folder, file);
  const thumbPath = safeJoin(THUMBS_ROOT, thumbRelative);
  const thumbDir = path.dirname(thumbPath);

  ensureDir(THUMBS_ROOT);
  ensureDir(thumbDir);

  const originalStats = fs.statSync(originalPath);
  const thumbExists = isFile(thumbPath);

  let shouldRegenerate = !thumbExists;

  if (thumbExists) {
    const thumbStats = fs.statSync(thumbPath);
    if (thumbStats.mtimeMs < originalStats.mtimeMs) {
      shouldRegenerate = true;
    }
  }

  if (shouldRegenerate) {
    await sharp(originalPath)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toFile(thumbPath);
  }

  return thumbPath;
}

function listImageFilesFast(folderPath) {
  if (!isDir(folderPath)) return [];

  return naturalSort(
    fs.readdirSync(folderPath).filter((name) => {
      const full = path.join(folderPath, name);
      return isFile(full) && IMAGE_EXTS.has(path.extname(name).toLowerCase());
    })
  );
}

async function warmFolderThumbs(folder) {
  let folderPath;
  try {
    folderPath = safeJoin(LIBRARY_ROOT, folder);
  } catch {
    return;
  }

  if (!isDir(folderPath)) return;

  const imageFiles = listImageFilesFast(folderPath);

  const status = {
    folder,
    startedAt: Date.now(),
    finishedAt: null,
    canceledAt: null,
    totalImages: imageFiles.length,
    processed: 0,
    createdOrReady: 0,
    failed: 0,
    failedFiles: []
  };

  thumbWarmStatus.set(folder, status);
  thumbWarmCancel.set(folder, false);

  for (const file of imageFiles) {
    if (thumbWarmCancel.get(folder)) {
      status.canceledAt = Date.now();
      break;
    }

    try {
      await ensureImageThumb(folder, file);
      status.createdOrReady += 1;
    } catch (err) {
      status.failed += 1;
      status.failedFiles.push({
        file,
        error: err.message
      });
      console.warn('Thumb warm failed:', folder, file, err.message);
    } finally {
      status.processed += 1;
    }
  }

  status.finishedAt = Date.now();
}

function queueFolderThumbWarm(folder) {
  if (!folder) return false;
  if (thumbWarmJobs.has(folder)) return false;

  thumbWarmCancel.set(folder, false);

  const job = warmFolderThumbs(folder)
    .catch((err) => {
      console.error('Folder thumb warm job failed:', folder, err);
    })
    .finally(() => {
      thumbWarmJobs.delete(folder);
      thumbWarmCancel.delete(folder);
    });

  thumbWarmJobs.set(folder, job);
  return true;
}

function cancelFolderThumbWarm(folder) {
  if (!folder || !thumbWarmJobs.has(folder)) return false;
  thumbWarmCancel.set(folder, true);
  return true;
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
  try {
    if (!isDir(LIBRARY_ROOT)) {
      return res.json([]);
    }

    const folders = fs.readdirSync(LIBRARY_ROOT).filter((name) => {
      return isDir(path.join(LIBRARY_ROOT, name));
    });

    const result = naturalSort(folders).map((folder) => {
      const folderPath = path.join(LIBRARY_ROOT, folder);
      const summary = getFastMediaSummary(folderPath);
      const cover = findCoverFileFast(folderPath);
      const title = getDisplayTitle(folderPath, folder);

      return {
        id: folder,
        name: title,
        folder,
        cover,
        imageCount: summary.imageCount,
        videoCount: summary.videoCount,
        mediaCount: summary.mediaCount
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load library' });
  }
});

app.post('/api/folder-stop-warm-thumbs', (req, res) => {
  const folder = req.query.folder;

  if (!folder) {
    return res.status(400).json({ error: 'folder is required' });
  }

  const stopped = cancelFolderThumbWarm(folder);

  res.json({ ok: true, stopped });
});

app.get('/api/folder-images', async (req, res) => {
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

  try {
    res.json(await getMediaFiles(folderPath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load folder media' });
  }
});

app.get('/api/folder-meta', async (req, res) => {
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

  try {
    const media = await getMediaFiles(folderPath);

    res.json({
      id: folder,
      folder,
      name: getDisplayTitle(folderPath, folder),
      cover: await findCoverFile(folderPath),
      imageCount: media.filter((item) => item.type === 'image').length,
      videoCount: media.filter((item) => item.type === 'video').length,
      mediaCount: media.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load folder meta' });
  }
});

app.post('/api/folder-warm-thumbs', (req, res) => {
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

  queueFolderThumbWarm(folder);

  res.json({ ok: true, started: true });
});

app.get('/thumb', async (req, res) => {
  const folder = req.query.folder;
  const file = req.query.file;

  if (!folder || !file) {
    return res.status(400).send('missing params');
  }

  let originalPath;
  try {
    originalPath = safeJoin(LIBRARY_ROOT, folder, file);
  } catch {
    return res.status(400).send('invalid path');
  }

  if (!isFile(originalPath)) {
    return res.status(404).send('not found');
  }

  if (getMediaType(file) !== 'image') {
    return res.status(400).send('not an image');
  }

  try {
    const thumbPath = await ensureImageThumb(folder, file);
    return res.sendFile(thumbPath);
  } catch (err) {
    console.warn('Thumbnail generation failed, falling back to original:', file, err.message);
    return res.sendFile(originalPath);
  }
});

app.get('/media', (req, res) => {
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

  const type = getMediaType(file);
  if (type !== 'image') {
    return res.status(400).send('not an image');
  }

  res.sendFile(filePath);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(APP_ROOT, 'library.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});