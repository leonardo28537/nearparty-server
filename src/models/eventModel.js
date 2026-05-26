import { query, withTransaction } from '../config/database.js'

export const EventModel = {

  // ── Nearby events using ST_DWithin ─────────────
  findNearby: async ({ lat, lng, radius = 5000, userId }) => {
    const { rows } = await query(
      `SELECT
         e.id, e.title, e.description, e.category,
         e.starts_at, e.max_guests, e.address, e.private, e.status,
         ST_X(e.location::geometry) AS longitude,
         ST_Y(e.location::geometry) AS latitude,
         ST_Distance(e.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m,
         u.name  AS host_name,
         u.id    AS host_id,
         COUNT(a.id) FILTER (WHERE a.status = 'accepted') AS guest_count
       FROM events e
       JOIN users u ON u.id = e.host_id
       LEFT JOIN applications a ON a.event_id = e.id
       WHERE
         e.status = 'active'
         AND e.starts_at > NOW()
         AND ST_DWithin(
           e.location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         )
       GROUP BY e.id, u.id
       ORDER BY distance_m ASC
       LIMIT 50`,
      [lat, lng, radius]
    )
    return rows
  },

  // ── Event by ID with applications ──────────────
  findById: async (id) => {
    const { rows } = await query(
      `SELECT
         e.*,
         ST_X(e.location::geometry) AS longitude,
         ST_Y(e.location::geometry) AS latitude,
         u.name AS host_name
       FROM events e
       JOIN users u ON u.id = e.host_id
       WHERE e.id = $1`,
      [id]
    )
    if (!rows[0]) return null

    const event = rows[0]

    const { rows: apps } = await query(
      `SELECT a.id, a.user_id, a.status, a.message, a.created_at,
              u.name AS user_name
       FROM applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.event_id = $1
       ORDER BY a.created_at ASC`,
      [id]
    )
    event.applications = apps
    event.guest_count  = apps.filter((a) => a.status === 'accepted').length

    return event
  },

  // ── Events hosted by a user ─────────────────────
  findByHost: async (hostId) => {
    const { rows } = await query(
      `SELECT
         e.*,
         ST_X(e.location::geometry) AS longitude,
         ST_Y(e.location::geometry) AS latitude,
         COUNT(a.id) FILTER (WHERE a.status = 'accepted') AS guest_count,
         COUNT(a.id) FILTER (WHERE a.status = 'pending')  AS pending_count
       FROM events e
       LEFT JOIN applications a ON a.event_id = e.id
       WHERE e.host_id = $1
       GROUP BY e.id
       ORDER BY e.starts_at DESC`,
      [hostId]
    )

    // Attach applications to each event
    const eventsWithApps = await Promise.all(
      rows.map(async (ev) => {
        const { rows: apps } = await query(
          `SELECT a.id, a.user_id, a.status, a.message, a.created_at,
                  u.name AS user_name
           FROM applications a
           JOIN users u ON u.id = a.user_id
           WHERE a.event_id = $1
           ORDER BY a.created_at ASC`,
          [ev.id]
        )
        return { ...ev, applications: apps }
      })
    )

    return eventsWithApps
  },

  // ── Create event ────────────────────────────────
  create: async ({ hostId, title, description, category, starts_at,
                   max_guests, address, latitude, longitude, private: priv }) => {
    const { rows } = await query(
      `INSERT INTO events
         (host_id, title, description, category, starts_at,
          max_guests, address, location, private)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7,
          ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography,
          $10)
       RETURNING *`,
      [hostId, title, description, category, starts_at,
       max_guests, address, latitude, longitude, priv ?? false]
    )
    return rows[0]
  },

  // ── Update event ────────────────────────────────
  update: async (id, hostId, updates) => {
    const allowed = ['title', 'description', 'category', 'starts_at',
                     'max_guests', 'address', 'private', 'status']
    const fields  = []
    const values  = []
    let   i = 1

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = $${i++}`)
        values.push(updates[key])
      }
    }

    if (!fields.length) return EventModel.findById(id)

    values.push(id, hostId)
    const { rows } = await query(
      `UPDATE events SET ${fields.join(', ')}
       WHERE id = $${i++} AND host_id = $${i}
       RETURNING *`,
      values
    )
    return rows[0] || null
  },
}
