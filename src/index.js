import 'dotenv/config'
import express      from 'express'
import { createServer } from 'http'
import { Server }   from 'socket.io'
import cors         from 'cors'
import helmet       from 'helmet'
import morgan       from 'morgan'
import compression  from 'compression'
import rateLimit    from 'express-rate-limit'

import pool                from './config/database.js'
import { errorHandler }    from './middleware/errorHandler.js'
import { initSocket }      from './socket/chatHandler.js'

import authRoutes  from './routes/authRoutes.js'
import userRoutes  from './routes/userRoutes.js'
import eventRoutes from './routes/eventRoutes.js'
import chatRoutes  from './routes/chatRoutes.js'

const app    = express()
const server = createServer(app)
const PORT   = process.env.PORT || 4000

// Necesario para Render/nginx — identifica IPs reales detrás del proxy
app.set('trust proxy', 1)

// ── Socket.io ─────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
})
initSocket(io)

// ── Global middleware ─────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(compression())
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Rate limiting ─────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      20,
  message:  { message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
}))

app.use('/api', rateLimit({
  windowMs: 60 * 1000, // 1 min
  max:      120,
  standardHeaders: true,
  legacyHeaders:   false,
}))

// ── Routes ────────────────────────────────────────
app.use('/api/auth',   authRoutes)
app.use('/api/users',  userRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/chat',   chatRoutes)

// ── Health check ──────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.path}` })
})

// ── Error handler ─────────────────────────────────
app.use(errorHandler)

// ── Start ─────────────────────────────────────────
const start = async () => {
  try {
    await pool.query('SELECT 1')
    console.log('✔ PostgreSQL connected')
  } catch (err) {
    console.error('✘ PostgreSQL connection failed:', err.message)
    console.error('  Make sure the DB is running and .env is configured.')
    process.exit(1)
  }

  server.listen(PORT, () => {
    console.log(`\n🚀 NearParty API running on http://localhost:${PORT}`)
    console.log(`   Health: http://localhost:${PORT}/health`)
    console.log(`   Env:    ${process.env.NODE_ENV}\n`)
  })
}

start()
