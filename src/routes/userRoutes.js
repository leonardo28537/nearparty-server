import { Router } from 'express'
import { body }   from 'express-validator'
import { UserModel }    from '../models/userModel.js'
import { authenticate } from '../middleware/authenticate.js'
import { validate }     from '../middleware/validate.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

// All user routes require auth
router.use(authenticate)

// ── GET /api/users/me ─────────────────────────────
router.get('/me', asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.sub)
  if (!user) return res.status(404).json({ message: 'No encontrado' })
  res.json({ user })
}))

// ── PATCH /api/users/me ───────────────────────────
router.patch(
  '/me',
  [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('bio').optional().isLength({ max: 500 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, bio } = req.body
    const user = await UserModel.update(req.user.sub, { name, bio })
    res.json({ user })
  })
)

// ── GET /api/users/:id ────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.params.id)
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' })
  res.json({ user })
}))

export default router
