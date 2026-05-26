import { Router } from 'express'
import { body }   from 'express-validator'
import { AuthService }   from '../services/authService.js'
import { authenticate }  from '../middleware/authenticate.js'
import { validate }      from '../middleware/validate.js'
import { asyncHandler }  from '../middleware/errorHandler.js'

const router = Router()

// ── POST /api/auth/register ───────────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('El nombre es obligatorio')
      .isLength({ max: 100 }),
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const result = await AuthService.register(req.body)
    res.status(201).json(result)
  })
)

// ── POST /api/auth/login ──────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const result = await AuthService.login(req.body)
    res.json(result)
  })
)

// ── POST /api/auth/refresh ────────────────────────
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token requerido')],
  validate,
  asyncHandler(async (req, res) => {
    const result = await AuthService.refresh(req.body.refreshToken)
    res.json(result)
  })
)

// ── POST /api/auth/logout ─────────────────────────
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body
    await AuthService.logout(refreshToken)
    res.json({ message: 'Sesión cerrada' })
  })
)

// ── GET /api/auth/me ──────────────────────────────
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { UserModel } = await import('../models/userModel.js')
    const user = await UserModel.findById(req.user.sub)
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.json({ user })
  })
)

export default router
