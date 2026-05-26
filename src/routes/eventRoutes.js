import { Router } from 'express'
import { body, query as qv, param } from 'express-validator'
import { EventModel }       from '../models/eventModel.js'
import { ApplicationModel } from '../models/applicationModel.js'
import { authenticate }     from '../middleware/authenticate.js'
import { validate }         from '../middleware/validate.js'
import { asyncHandler }     from '../middleware/errorHandler.js'

const router = Router()
router.use(authenticate)

// ── GET /api/events/nearby ────────────────────────
router.get(
  '/nearby',
  [
    qv('lat').isFloat({ min: -90,  max: 90  }).withMessage('lat inválida'),
    qv('lng').isFloat({ min: -180, max: 180 }).withMessage('lng inválida'),
    qv('radius').optional().isInt({ min: 100, max: 50000 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { lat, lng, radius = 5000 } = req.query
    const events = await EventModel.findNearby({
      lat:    parseFloat(lat),
      lng:    parseFloat(lng),
      radius: parseInt(radius),
      userId: req.user.sub,
    })
    res.json({ events })
  })
)

// ── GET /api/events/mine ──────────────────────────
router.get('/mine', asyncHandler(async (req, res) => {
  const events = await EventModel.findByHost(req.user.sub)
  res.json({ events })
}))

// ── GET /api/events/:id ───────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const event = await EventModel.findById(req.params.id)
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' })

  // Hide exact address if private and requester not host/accepted
  if (event.private && event.host_id !== req.user.sub) {
    const app = event.applications?.find(
      (a) => a.user_id === req.user.sub && a.status === 'accepted'
    )
    if (!app) event.address = 'Ubicación privada'
  }

  res.json({ event })
}))

// ── POST /api/events ──────────────────────────────
router.post(
  '/',
  [
    body('title').trim().notEmpty().isLength({ max: 150 }),
    body('description').optional().isLength({ max: 2000 }),
    body('category').isIn(['party','social','meetup','concert','sport','other']),
    body('starts_at').isISO8601().withMessage('Fecha inválida'),
    body('max_guests').isInt({ min: 2, max: 500 }),
    body('latitude').isFloat({ min: -90,  max: 90  }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('address').optional().isLength({ max: 300 }),
    body('private').optional().isBoolean(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const event = await EventModel.create({
      ...req.body,
      hostId: req.user.sub,
    })
    res.status(201).json({ event })
  })
)

// ── PATCH /api/events/:id ─────────────────────────
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const event = await EventModel.update(req.params.id, req.user.sub, req.body)
    if (!event) return res.status(404).json({ message: 'Evento no encontrado o no autorizado' })
    res.json({ event })
  })
)

// ── POST /api/events/:id/apply ────────────────────
router.post(
  '/:id/apply',
  [body('message').optional().isLength({ max: 500 })],
  validate,
  asyncHandler(async (req, res) => {
    const event = await EventModel.findById(req.params.id)
    if (!event)                       return res.status(404).json({ message: 'Evento no encontrado' })
    if (event.host_id === req.user.sub) return res.status(400).json({ message: 'Eres el organizador' })
    if (event.status !== 'active')    return res.status(400).json({ message: 'Evento no disponible' })

    const existing = await ApplicationModel.findByEventAndUser(event.id, req.user.sub)
    if (existing) return res.status(409).json({ message: 'Ya enviaste una solicitud', application: existing })

    const accepted = event.applications?.filter((a) => a.status === 'accepted').length || 0
    if (accepted >= event.max_guests) return res.status(400).json({ message: 'Evento completo' })

    const application = await ApplicationModel.create({
      eventId: event.id,
      userId:  req.user.sub,
      message: req.body.message,
    })

    res.status(201).json({ application })
  })
)

// ── PATCH /api/events/:id/applications/:appId ─────
router.patch(
  '/:id/applications/:appId',
  [body('status').isIn(['accepted', 'rejected'])],
  validate,
  asyncHandler(async (req, res) => {
    const event = await EventModel.findById(req.params.id)
    if (!event)                         return res.status(404).json({ message: 'Evento no encontrado' })
    if (event.host_id !== req.user.sub) return res.status(403).json({ message: 'No autorizado' })

    const application = await ApplicationModel.updateStatus(
      req.params.appId,
      req.params.id,
      req.body.status
    )
    if (!application) return res.status(404).json({ message: 'Solicitud no encontrada' })

    res.json({ application })
  })
)

export default router
