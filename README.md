# NearParty — Backend (Node.js + Express + PostgreSQL)

## Stack
- **Node.js 18+** + **Express 4** — REST API
- **Socket.io 4** — real-time chat
- **PostgreSQL 16** + **PostGIS** — geospatial queries
- **bcryptjs** — password hashing
- **jsonwebtoken** — JWT access + refresh tokens
- **express-validator** — request validation
- **express-rate-limit** — rate limiting

---

## Prerequisites

### 1. PostgreSQL + PostGIS

**macOS:**
```bash
brew install postgresql@16 postgis
brew services start postgresql@16
```

**Ubuntu/Debian:**
```bash
sudo apt install postgresql postgresql-contrib postgis
sudo systemctl start postgresql
```

**Windows:** Download from https://www.postgresql.org/download/ and install PostGIS via Stack Builder.

### 2. Create the database
```bash
psql -U postgres
```
```sql
CREATE DATABASE nearparty;
\q
```

---

## Setup

```bash
cd nearparty-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

Edit `.env` with your values:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nearparty
DB_USER=postgres
DB_PASSWORD=your_postgres_password

JWT_ACCESS_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<run same command again for a different value>
```

```bash
# Run migrations (creates all tables)
npm run migrate

# (Optional) Seed sample data
npm run seed

# Start dev server with auto-reload
npm run dev
```

Server runs at **http://localhost:4000**

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login`    | Login → returns tokens |
| POST | `/api/auth/refresh`  | Refresh access token |
| POST | `/api/auth/logout`   | Revoke refresh token |
| GET  | `/api/auth/me`       | Current user info |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET   | `/api/users/me`   | Get own profile |
| PATCH | `/api/users/me`   | Update profile |
| GET   | `/api/users/:id`  | Get user by ID |

### Events
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/events/nearby` | Nearby events `?lat=&lng=&radius=` |
| GET  | `/api/events/mine`   | Host's own events |
| GET  | `/api/events/:id`    | Event detail + applications |
| POST | `/api/events`        | Create event |
| PATCH| `/api/events/:id`    | Update event (host only) |
| POST | `/api/events/:id/apply` | Apply to event |
| PATCH| `/api/events/:id/applications/:appId` | Accept/reject application |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat/:eventId/messages` | Message history |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB status + uptime |

---

## WebSocket Events

Connect with: `io('/', { auth: { token: accessToken } })`

| Event (emit) | Payload | Description |
|---|---|---|
| `chat:join`    | `{ eventId }` | Join room |
| `chat:leave`   | `{ eventId }` | Leave room |
| `chat:message` | `{ eventId, text }` | Send message |
| `chat:typing`  | `{ eventId, isTyping }` | Typing indicator |

| Event (listen) | Payload | Description |
|---|---|---|
| `chat:message` | `{ eventId, message }` | New message received |
| `chat:online`  | `{ eventId, users }` | Online users list |
| `chat:typing`  | `{ eventId, userId, isTyping }` | User typing |
| `chat:error`   | `{ message }` | Error |

---

## Project Structure

```
src/
├── config/
│   └── database.js        # pg Pool + helpers
├── lib/
│   └── jwt.js             # sign/verify helpers
├── middleware/
│   ├── authenticate.js    # JWT guard
│   ├── errorHandler.js    # global error + asyncHandler
│   └── validate.js        # express-validator result
├── models/
│   ├── userModel.js
│   ├── refreshTokenModel.js
│   ├── eventModel.js      # PostGIS queries
│   ├── applicationModel.js
│   └── messageModel.js
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── eventRoutes.js
│   └── chatRoutes.js
├── services/
│   └── authService.js     # register/login/refresh logic
├── socket/
│   └── chatHandler.js     # Socket.io rooms + presence
└── index.js               # server entry point
database/
├── migrations/
│   └── 001_initial.sql    # all tables + PostGIS
├── migrate.js
└── seed.js
```

---

## Running both servers together

Open two terminals:

```bash
# Terminal 1 — Backend
cd nearparty-server && npm run dev

# Terminal 2 — Frontend
cd nearparty-client && npm run dev
```

Frontend at **http://localhost:5173** · Backend at **http://localhost:4000**
