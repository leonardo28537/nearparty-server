import { query } from '../config/database.js'

export const ApplicationModel = {

  findByEventAndUser: async (eventId, userId) => {
    const { rows } = await query(
      'SELECT * FROM applications WHERE event_id = $1 AND user_id = $2 LIMIT 1',
      [eventId, userId]
    )
    return rows[0] || null
  },

  create: async ({ eventId, userId, message }) => {
    const { rows } = await query(
      `INSERT INTO applications (event_id, user_id, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [eventId, userId, message || null]
    )
    return rows[0]
  },

  updateStatus: async (id, eventId, status) => {
    const { rows } = await query(
      `UPDATE applications SET status = $1
       WHERE id = $2 AND event_id = $3
       RETURNING *`,
      [status, id, eventId]
    )
    return rows[0] || null
  },
}
