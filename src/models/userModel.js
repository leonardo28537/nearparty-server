import { query } from '../config/database.js'

export const UserModel = {
  findByEmail: async (email) => {
    const { rows } = await query(
      'SELECT * FROM users WHERE email = $1 LIMIT 1',
      [email]
    )
    return rows[0] || null
  },

  findById: async (id) => {
    const { rows } = await query(
      'SELECT id, name, email, bio, avatar_url, created_at FROM users WHERE id = $1',
      [id]
    )
    return rows[0] || null
  },

  create: async ({ name, email, password }) => {
    const { rows } = await query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, bio, avatar_url, created_at`,
      [name, email, password]
    )
    return rows[0]
  },

  update: async (id, { name, bio, avatar_url }) => {
    const fields = []
    const values = []
    let   i = 1

    if (name       !== undefined) { fields.push(`name = $${i++}`);       values.push(name) }
    if (bio        !== undefined) { fields.push(`bio = $${i++}`);        values.push(bio) }
    if (avatar_url !== undefined) { fields.push(`avatar_url = $${i++}`); values.push(avatar_url) }

    if (!fields.length) return UserModel.findById(id)

    values.push(id)
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING id, name, email, bio, avatar_url, created_at`,
      values
    )
    return rows[0]
  },
}
