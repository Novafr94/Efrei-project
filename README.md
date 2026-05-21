# Timeless Radio

Web radio platform streaming music from the 1930s to the 1970s. Built as an EFREI student project.

## Stack

- **Backend**: Node.js, Express, Socket.io, SQLite (via `node:sqlite`)
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Database**: SQLite — schema in `database/schema.sql`

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set a strong ADMIN_PASSWORD

# 3. Add audio files
# Place MP3s in frontend/audio/ (see frontend/audio/README.md)

# 4. Start the server
npm start            # production
npm run dev          # with nodemon (auto-reload)
```

Server starts at <http://localhost:3004> (configurable via `PORT` in `.env`).

## Environment variables

| Variable        | Required | Default | Description |
|-----------------|----------|---------|-------------|
| `PORT`          | no       | `3004`  | HTTP port |
| `DB_PATH`       | yes      | —       | Path to the SQLite database file |
| `ADMIN_PASSWORD`| yes      | —       | Password for the `/admin` panel |
| `CORS_ORIGIN`   | no       | `*`     | Allowed CORS origins (comma-separated or `*`) |

Generate a strong password:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Project structure

```
backend/
  server.js              # Express + Socket.io entry point
  db.js                  # Shared SQLite connection
  routes/
    radio.js             # GET /api/radio/now-playing, /api/radio/anecdotes
    chat.js              # GET /api/chat/messages
    admin.js             # CRUD for tracks, anecdotes, censor words
  middleware/
    authMiddleware.js    # Bearer token check + rate limiting
    censorMiddleware.js  # Chat censorship
  socket/
    chat-socket.js       # Socket.io chat events

frontend/
  pages/                 # HTML pages (index, radio, admin, login)
  js/                    # Client-side JS
  css/                   # Stylesheets
  audio/                 # MP3 files (not in git — add manually)

database/
  schema.sql             # Table definitions + seed data
```

## Pages

| URL      | Description |
|----------|-------------|
| `/`      | Homepage with schedule |
| `/radio` | Radio player with chat |
| `/admin` | Admin panel (password-protected) |

## Admin panel

Navigate to `/admin` and enter the `ADMIN_PASSWORD` from your `.env`.  
Lets you manage tracks, anecdotes, and chat censor words.

## Security notes

- `.env` is listed in `.gitignore` — **never commit it**.
- The SQLite database file is also excluded from git.
- `ADMIN_PASSWORD` **must** be a long, random secret in any non-local environment.  
  The default value in `.env.example` (`CHANGE_ME_use_a_long_random_secret`) is a placeholder — replace it immediately. Generate a strong one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Set `CORS_ORIGIN` to your actual frontend domain in production (never leave `*` in production).
- Serve the application behind HTTPS in production — the admin password travels as a Bearer token in HTTP headers.
- The `/login` page and `backend/routes/auth.js` are placeholders reserved for Phase 2 user accounts.
