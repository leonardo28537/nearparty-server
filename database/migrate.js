import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const { Client } = pg

const client = new Client({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'nearparty',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
})

const run = async () => {
  await client.connect()
  console.log('✔ Connected to PostgreSQL')

  const sql = readFileSync(
    join(__dirname, 'migrations', '001_initial.sql'),
    'utf8'
  )

  try {
    await client.query(sql)
    console.log('✔ Migrations applied successfully')
  } catch (err) {
    console.error('✘ Migration error:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
