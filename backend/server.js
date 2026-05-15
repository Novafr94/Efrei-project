const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// --- App setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Database setup ---
const db = new DatabaseSync(process.env.DB_PATH);
const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
db.exec(schema);
console.log('Database ready.');

// --- Page routes ---
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/index.html')));
app.get('/radio', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/radio.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/login.html')));

// --- API Routes (added step by step) ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Timeless Radio is running 🎵' });
});

// --- Socket.io (chat — added in Bloc 4) ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// --- Start ---
const PORT = process.env.PORT || 3004;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = { db };
