// backend/routes/upload.js — secure MP3 upload pipeline
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const db       = require('../db');
const autoDJ   = require('../engine/autoDJ');

const AUDIO_DIR = path.join(__dirname, '../../frontend/audio');
const TMP_DIR   = path.join(AUDIO_DIR, '.tmp');

const MAX_FILE_SIZE  = Number(process.env.MAX_UPLOAD_SIZE)  || 50 * 1024 * 1024;
const MAX_FILE_COUNT = Number(process.env.MAX_UPLOAD_FILES) || 10;

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files:    MAX_FILE_COUNT,
  },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype !== 'audio/mpeg' || ext !== '.mp3') {
      return cb(new Error('Only MP3 files are allowed.'));
    }
    cb(null, true);
  },
});

const MP3_MAGIC = [
  [0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2], // MPEG frame sync
  [0x49, 0x44, 0x33],                          // ID3 header
];

function validateMagicBytes(filePath) {
  const fd  = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(3);
  fs.readSync(fd, buf, 0, 3, 0);
  fs.closeSync(fd);

  return MP3_MAGIC.some(magic =>
    magic.every((byte, i) => buf[i] === byte)
  );
}

function cleanupFile(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

router.post('/', upload.array('files', MAX_FILE_COUNT), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const { parseFile } = await import('music-metadata');
  const categoryId = Number(req.body.category_id) || 1;
  const categoryExists = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);

  if (!categoryExists) {
    return res.status(400).json({ error: 'Selected category does not exist.' });
  }

  const results = [];

  for (const file of req.files) {
    const tmpPath = file.path;

    if (!validateMagicBytes(tmpPath)) {
      cleanupFile(tmpPath);
      results.push({ success: false, originalName: file.originalname, error: 'Invalid MP3 file (bad magic bytes).' });
      continue;
    }

    const stat = fs.lstatSync(tmpPath);
    if (!stat.isFile()) {
      cleanupFile(tmpPath);
      results.push({ success: false, originalName: file.originalname, error: 'Not a regular file.' });
      continue;
    }

    let metadata;
    try {
      metadata = await parseFile(tmpPath);
    } catch {
      cleanupFile(tmpPath);
      results.push({ success: false, originalName: file.originalname, error: 'Could not parse MP3 metadata.' });
      continue;
    }

    const baseName  = path.basename(file.originalname, '.mp3').replace(/[^a-zA-Z0-9\s\-]/g, '').trim();
    const title     = metadata.common.title  || baseName || 'Unknown Title';
    const artist    = metadata.common.artist || 'Unknown Artist';
    const year      = metadata.common.year   || null;
    const duration  = Math.round(metadata.format.duration || 0);

    if (duration < 1) {
      cleanupFile(tmpPath);
      results.push({ success: false, originalName: file.originalname, error: 'Could not determine audio duration.' });
      continue;
    }

    const uuid     = crypto.randomUUID();
    const filename = `${uuid}.mp3`;
    const destPath = path.join(AUDIO_DIR, filename);

    const resolvedDest = path.resolve(destPath);
    if (!resolvedDest.startsWith(path.resolve(AUDIO_DIR))) {
      cleanupFile(tmpPath);
      results.push({ success: false, originalName: file.originalname, error: 'Path traversal detected.' });
      continue;
    }

    try {
      fs.renameSync(tmpPath, destPath);
    } catch {
      cleanupFile(tmpPath);
      results.push({ success: false, originalName: file.originalname, error: 'Failed to move file.' });
      continue;
    }

    const stmt   = db.prepare(
      'INSERT INTO tracks (title, artist, year, duration, filename, time_slot, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(title, artist, year, duration, filename, 'all', categoryId);

    autoDJ.onTrackAdded();

    results.push({
      success: true,
      id:           Number(result.lastInsertRowid),
      title,
      artist,
      year,
      duration,
      filename,
      originalName: file.originalname,
    });
  }

  res.json({ results });
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB.` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `Too many files. Max ${MAX_FILE_COUNT} per upload.` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === 'Only MP3 files are allowed.') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Upload failed.' });
});

module.exports = router;
