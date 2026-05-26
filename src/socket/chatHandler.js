import { verifyAccessToken }  from '../lib/jwt.js'
import { MessageModel }       from '../models/messageModel.js'
import { EventModel }         from '../models/eventModel.js'
import { UserModel }          from '../models/userModel.js'

// Track online users per room: { [eventId]: Set<userId> }
const roomUsers = new Map()

const getRoomUsers = (eventId) => {
  if (!roomUsers.has(eventId)) roomUsers.set(eventId, new Map())
  return roomUsers.get(eventId) // Map<userId, { socketId, name }>
}

export const initSocket = (io) => {

  // ── Auth middleware ─────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Authentication required'))

    try {
      socket.user = verifyAccessToken(token)
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.user.sub
    const user   = await UserModel.findById(userId)
    if (!user) return socket.disconnect()

    socket.userName = user.name
    console.log(`[Socket] ${user.name} connected (${socket.id})`)

    // ── Join room ───────────────────────────────
    socket.on('chat:join', async ({ eventId }) => {
      if (!eventId) return

      // Verify access
      const event = await EventModel.findById(eventId)
      if (!event) return

      const isHost    = event.host_id === userId
      const isAccepted = event.applications?.some(
        (a) => a.user_id === userId && a.status === 'accepted'
      )
      if (!isHost && !isAccepted) {
        return socket.emit('chat:error', { message: 'Acceso denegado al chat' })
      }

      socket.join(eventId)
      socket.currentRoom = eventId

      // Track presence
      const users = getRoomUsers(eventId)
      users.set(userId, { socketId: socket.id, name: user.name })

      // Broadcast updated online list
      io.to(eventId).emit('chat:online', {
        eventId,
        users: Array.from(users.keys()),
      })

      console.log(`[Socket] ${user.name} joined room ${eventId}`)
    })

    // ── Leave room ──────────────────────────────
    socket.on('chat:leave', ({ eventId }) => {
      handleLeave(socket, eventId)
    })

    // ── Message ─────────────────────────────────
    socket.on('chat:message', async ({ eventId, text }) => {
      if (!eventId || !text?.trim()) return

      const trimmed = text.trim().slice(0, 2000)

      try {
        const message = await MessageModel.create({
          eventId,
          userId,
          text: trimmed,
        })

        const payload = {
          ...message,
          user_name:  user.name,
          avatar_url: user.avatar_url,
        }

        io.to(eventId).emit('chat:message', { eventId, message: payload })
      } catch (err) {
        console.error('[Socket] message error:', err)
        socket.emit('chat:error', { message: 'Error al enviar mensaje' })
      }
    })

    // ── Typing indicator ─────────────────────────
    const typingRooms = new Map() // eventId → timeout

    socket.on('chat:typing', ({ eventId, isTyping }) => {
      if (!eventId) return

      if (isTyping) {
        socket.to(eventId).emit('chat:typing', {
          eventId,
          userId,
          isTyping: true,
        })

        // Auto-clear after 3s
        if (typingRooms.has(eventId)) clearTimeout(typingRooms.get(eventId))
        typingRooms.set(eventId, setTimeout(() => {
          socket.to(eventId).emit('chat:typing', { eventId, userId, isTyping: false })
          typingRooms.delete(eventId)
        }, 3000))
      } else {
        if (typingRooms.has(eventId)) {
          clearTimeout(typingRooms.get(eventId))
          typingRooms.delete(eventId)
        }
        socket.to(eventId).emit('chat:typing', { eventId, userId, isTyping: false })
      }
    })

    // ── Disconnect ───────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] ${user.name} disconnected`)
      if (socket.currentRoom) handleLeave(socket, socket.currentRoom)
    })
  })

  const handleLeave = (socket, eventId) => {
    socket.leave(eventId)
    const users = getRoomUsers(eventId)
    users.delete(socket.user.sub)

    io.to(eventId).emit('chat:online', {
      eventId,
      users: Array.from(users.keys()),
    })
  }
}
