import { query } from '../config/database.js'

export const RefreshTokenModel = {
  create: async (userId, token, expiresAt) => {
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    )
  },

  find: async (token) => {
    const { rows } = await query(
      `SELECT rt.*, u.id as user_id
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token = $1 AND rt.expires_at > NOW()
       LIMIT 1`,
      [token]
    )
    return rows[0] || null
  },

  delete: async (token) => {
    await query('DELETE FROM refresh_tokens WHERE token = $1', [token])
  },

  deleteAllForUser: async (userId) => {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])
  },

  // Cleanup expired tokens (run periodically)
  purgeExpired: async () => {
    await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()')
  },
}
