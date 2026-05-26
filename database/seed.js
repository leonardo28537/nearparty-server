import bcrypt from 'bcryptjs'
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Client } = pg

const client = new Client({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

// ── Adjust coordinates to your city ──────────────
const BASE_LAT = 4.7110   // Bogotá — change to your city
const BASE_LNG = -74.0721

const rand = (min, max) => Math.random() * (max - min) + min
const offset = () => rand(-0.02, 0.02)

const EVENTS = [
  { title: 'Rooftop party 🌆',     category: 'party',   description: 'Fiesta en la azotea con vista a la ciudad. Música electrónica, cócteles y atardecer espectacular.' },
  { title: 'Café & código ☕',      category: 'meetup',  description: 'Juntémonos a trabajar o aprender algo nuevo. Bienvenidos todos los niveles.' },
  { title: 'Jam session acústica 🎸', category: 'concert', description: 'Sesión informal de música acústica. Si tocas algún instrumento, tráelo.' },
  { title: 'Picnic en el parque 🌿', category: 'social', description: 'Tarde relajada en el parque. Trae algo para compartir y muchas ganas de conversar.' },
  { title: 'Noche de juegos 🎲',    category: 'social',  description: 'Board games, cartas, y buena compañía. Trae tu juego favorito.' },
]

const run = async () => {
  await client.connect()
  console.log('✔ Connected')

  // Clear
  await client.query('DELETE FROM messages')
  await client.query('DELETE FROM applications')
  await client.query('DELETE FROM events')
  await client.query('DELETE FROM refresh_tokens')
  await client.query('DELETE FROM users')

  // Users
  const hash = await bcrypt.hash('password123', 10)
  const users = []

  for (const [name, email] of [
    ['Ana García',    'ana@test.com'],
    ['Carlos López',  'carlos@test.com'],
    ['María Torres',  'maria@test.com'],
  ]) {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id`,
      [name, email, hash]
    )
    users.push(rows[0].id)
    console.log(`  ✔ User: ${email}`)
  }

  // Events (hosted by first two users alternating)
  for (let i = 0; i < EVENTS.length; i++) {
    const ev    = EVENTS[i]
    const hostId = users[i % 2]
    const lat   = BASE_LAT + offset()
    const lng   = BASE_LNG + offset()
    const hours = 24 + i * 12

    await client.query(
      `INSERT INTO events
         (host_id, title, description, category, starts_at, max_guests, address, location)
       VALUES
         ($1, $2, $3, $4,
          NOW() + INTERVAL '${hours} hours',
          $5, $6,
          ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography)`,
      [hostId, ev.title, ev.description, ev.category,
       Math.floor(rand(8, 30)),
       'Dirección de prueba, Ciudad',
       lng, lat]
    )
    console.log(`  ✔ Event: ${ev.title}`)
  }

  console.log('\n✔ Seed complete')
  console.log('  Login with: ana@test.com / password123')
  await client.end()
}

run().catch((e) => { console.error(e); process.exit(1) })
