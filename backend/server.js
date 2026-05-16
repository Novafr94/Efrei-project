// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');

// Shared DB (opens connection + runs schema)
const db = require('./db');
console.log('Database ready.');

// --- App setup ---
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Page routes ---
app.get('/',      (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/index.html')));
app.get('/radio', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/radio.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/login.html')));

// --- API routes ---
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/radio',  require('./routes/radio'));
app.use('/api/chat',   require('./routes/chat'));
app.use('/api/admin',  require('./middleware/authMiddleware'), require('./routes/admin'));

// --- Socket.io ---
require('./socket/chat-socket')(io);

// --- Start ---
const PORT = process.env.PORT || 3004;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

module.exports = { db, io };
