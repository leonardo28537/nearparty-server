import { query } from '../config/database.js'

export const MessageModel = {

  findByEvent: async (eventId, limit = 100) => {
    const { rows } = await query(
      `SELECT m.id, m.event_id, m.user_id, m.text, m.created_at,
              u.name AS user_name, u.avatar_url
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.event_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2`,
      [eventId, limit]
    )
    return rows
  },

  create: async ({ eventId, userId, text }) => {
    const { rows } = await query(
      `INSERT INTO messages (event_id, user_id, text)
       VALUES ($1, $2, $3)
       RETURNING id, event_id, user_id, text, created_at`,
      [eventId, userId, text]
    )
    return rows[0]
  },
}
