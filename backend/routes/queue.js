// backend/routes/queue.js — admin queue management
const express = require('express');
const router  = express.Router();
const autoDJ  = require('../engine/autoDJ');

router.get('/', (_req, res) => {
  res.json(autoDJ.getQueue());
});

router.post('/', (req, res) => {
  const { trackId } = req.body;
  if (!trackId || typeof trackId !== 'number') {
    return res.status(400).json({ error: 'trackId (number) is required.' });
  }
  if (!autoDJ.addToQueue(trackId)) {
    return res.status(404).json({ error: 'Track not found.' });
  }
  res.status(201).json({ queued: true });
});

router.delete('/:index', (req, res) => {
  const index = Number(req.params.index);
  if (!autoDJ.removeFromQueue(index)) {
    return res.status(400).json({ error: 'Invalid queue index.' });
  }
  res.json({ removed: true });
});

router.post('/skip', (_req, res) => {
  autoDJ.skip();
  res.json({ skipped: true });
});

router.post('/reorder', (req, res) => {
  const { from, to } = req.body;
  if (typeof from !== 'number' || typeof to !== 'number') {
    return res.status(400).json({ error: 'from and to (numbers) are required.' });
  }
  if (!autoDJ.reorderQueue(from, to)) {
    return res.status(400).json({ error: 'Invalid queue indices.' });
  }
  res.json({ reordered: true });
});

module.exports = router;
