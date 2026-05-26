import { Router }      from 'express'
import { MessageModel } from '../models/messageModel.js'
import { EventModel }   from '../models/eventModel.js'
import { authenticate } from '../middleware/authenticate.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()
router.use(authenticate)

// ── GET /api/chat/:eventId/messages ───────────────
router.get('/:eventId/messages', asyncHandler(async (req, res) => {
  const event = await EventModel.findById(req.params.eventId)
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' })

  // Only host and accepted guests can read chat
  const isHost = event.host_id === req.user.sub
  const isGuest = event.applications?.some(
    (a) => a.user_id === req.user.sub && a.status === 'accepted'
  )

  if (!isHost && !isGuest) {
    return res.status(403).json({ message: 'Solo los invitados aceptados pueden ver el chat' })
  }

  const messages = await MessageModel.findByEvent(req.params.eventId)
  res.json({ messages })
}))

export default router
