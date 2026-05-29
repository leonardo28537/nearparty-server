// REPLACE nearparty-server/src/models/eventModel.js
import { query, withTransaction } from '../config/database.js'

export const EventModel = {

  // ── Nearby events — ST_DWithin + distance + bearing ──
  findNearby: async ({ lat, lng, radius = 5000, category, userId }) => {
    const values = [lat, lng, radius]
    let categoryClause = ''
    if (category && category !== 'all') {
      values.push(category)
      categoryClause = `AND e.category = $${values.length}`
    }

    const { rows } = await query(
      `SELECT
         e.id, e.title, e.description, e.category,
         e.starts_at, e.max_guests, e.address,
         e.private, e.status, e.created_at,
         ST_X(e.location::geometry)  AS longitude,
         ST_Y(e.location::geometry)  AS latitude,
         ROUND(ST_Distance(
           e.location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
         )::numeric) AS distance_m,
         ROUND(
           DEGREES(ST_Azimuth(
             ST_SetSRID(ST_MakePoint($2, $1), 4326)::geometry,
             e.location::geometry
           ))::numeric
         ) AS bearing_deg,
         u.name     AS host_name,
         u.id       AS host_id,
         u.avatar_url AS host_avatar,
         COUNT(a.id) FILTER (WHERE a.status = 'accepted') AS guest_count,
         COUNT(a.id) FILTER (WHERE a.status = 'pending')  AS pending_count,
         MAX(a2.status) FILTER (WHERE a2.user_id = $4) AS my_status
       FROM events e
       JOIN users u ON u.id = e.host_id
       LEFT JOIN applications a  ON a.event_id  = e.id
       LEFT JOIN applications a2 ON a2.event_id = e.id AND a2.user_id = $4
       WHERE
         e.status   = 'active'
         AND e.starts_at > NOW() - INTERVAL '6 hours'
         AND ST_DWithin(
           e.location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         )
         ${categoryClause}
       GROUP BY e.id, u.id
       ORDER BY distance_m ASC
       LIMIT 100`,
      [...values, userId || null]
    )
    return rows
  },

  // ── Bounding-box query (for map viewport) ────────
  findInBounds: async ({ north, south, east, west, userId }) => {
    const { rows } = await query(
      `SELECT
         e.id, e.title, e.category, e.starts_at, e.max_guests,
         e.address, e.status, e.private,
         ST_X(e.location::geometry) AS longitude,
         ST_Y(e.location::geometry) AS latitude,
         u.name AS host_name, u.id AS host_id,
         COUNT(a.id) FILTER (WHERE a.status = 'accepted') AS guest_count
       FROM events e
       JOIN users u ON u.id = e.host_id
       LEFT JOIN applications a ON a.event_id = e.id
       WHERE
         e.status = 'active'
         AND e.starts_at > NOW() - INTERVAL '6 hours'
         AND e.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
       GROUP BY e.id, u.id
       ORDER BY e.starts_at ASC
       LIMIT 200`,
      [west, south, east, north]
    )
    return rows
  },

  // ── GeoJSON FeatureCollection for Mapbox ─────────
  findNearbyGeoJSON: async ({ lat, lng, radius = 5000, userId }) => {
    const events = await EventModel.findNearby({ lat, lng, radius, userId })

    return {
      type: 'FeatureCollection',
      features: events.map((ev) => ({
        type: 'Feature',
        geometry: {
          type:        'Point',
          coordinates: [parseFloat(ev.longitude), parseFloat(ev.latitude)],
        },
        properties: {
          id:          ev.id,
          title:       ev.title,
          category:    ev.category,
          starts_at:   ev.starts_at,
          max_guests:  ev.max_guests,
          guest_count: parseInt(ev.guest_count),
          distance_m:  parseInt(ev.distance_m),
          bearing_deg: parseInt(ev.bearing_deg),
          host_name:   ev.host_name,
          host_id:     ev.host_id,
          address:     ev.private ? 'Ubicación privada' : ev.address,
          my_status:   ev.my_status,
          is_full:     parseInt(ev.guest_count) >= ev.max_guests,
        },
      })),
    }
  },

  // ── Stats for a radius ────────────────────────────
  geoStats: async ({ lat, lng, radius }) => {
    const { rows } = await query(
      `SELECT
         COUNT(*)                           AS total,
         COUNT(*) FILTER (WHERE category = 'party')   AS parties,
         COUNT(*) FILTER (WHERE category = 'social')  AS socials,
         COUNT(*) FILTER (WHERE category = 'meetup')  AS meetups,
         COUNT(*) FILTER (WHERE category = 'concert') AS concerts,
         ROUND(MIN(ST_Distance(
           e.location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
         ))::numeric) AS closest_m
       FROM events e
       WHERE
         e.status = 'active'
         AND e.starts_at > NOW() - INTERVAL '6 hours'
         AND ST_DWithin(
           e.location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         )`,
      [lat, lng, radius]
    )
    return rows[0]
  },

  // ── Event by ID ───────────────────────────────────
  findById: async (id) => {
    const { rows } = await query(
      `SELECT
         e.*,
         ST_X(e.location::geometry) AS longitude,
         ST_Y(e.location::geometry) AS latitude,
         u.name       AS host_name,
         u.avatar_url AS host_avatar
       FROM events e
       JOIN users u ON u.id = e.host_id
       WHERE e.id = $1`,
      [id]
    )
    if (!rows[0]) return null

    const event = rows[0]
    const { rows: apps } = await query(
      `SELECT a.id, a.user_id, a.status, a.message, a.created_at,
              u.name AS user_name, u.avatar_url
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

  // ── Host events ───────────────────────────────────
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

    return Promise.all(
      rows.map(async (ev) => {
        const { rows: apps } = await query(
          `SELECT a.id, a.user_id, a.status, a.message, a.created_at,
                  u.name AS user_name, u.avatar_url
           FROM applications a
           JOIN users u ON u.id = a.user_id
           WHERE a.event_id = $1
           ORDER BY a.created_at ASC`,
          [ev.id]
        )
        return { ...ev, applications: apps }
      })
    )
  },

  // ── Create ────────────────────────────────────────
  create: async ({ hostId, title, description, category, starts_at,
                   max_guests, address, latitude, longitude, private: priv }) => {
    const { rows } = await query(
      `INSERT INTO events
         (host_id, title, description, category, starts_at,
          max_guests, address, location, private)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
          ST_SetSRID(ST_MakePoint($9,$8),4326)::geography,
          $10)
       RETURNING *,
         ST_X(location::geometry) AS longitude,
         ST_Y(location::geometry) AS latitude`,
      [hostId, title, description, category, starts_at,
       max_guests, address, latitude, longitude, priv ?? false]
    )
    return rows[0]
  },

  // ── Update ────────────────────────────────────────
  update: async (id, hostId, updates) => {
    const allowed = ['title','description','category','starts_at',
                     'max_guests','address','private','status']
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
       RETURNING *,
         ST_X(location::geometry) AS longitude,
         ST_Y(location::geometry) AS latitude`,
      values
    )
    return rows[0] || null
  },
}
