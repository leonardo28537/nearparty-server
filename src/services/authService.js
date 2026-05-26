import bcrypt from 'bcryptjs'
import { UserModel }         from '../models/userModel.js'
import { RefreshTokenModel } from '../models/refreshTokenModel.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12')

const refreshExpiry = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d
}

const issueTokens = async (user) => {
  const payload      = { sub: user.id, email: user.email }
  const accessToken  = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)
  await RefreshTokenModel.create(user.id, refreshToken, refreshExpiry())
  return { accessToken, refreshToken }
}

export const AuthService = {

  register: async ({ name, email, password }) => {
    const existing = await UserModel.findByEmail(email)
    if (existing) {
      const err = new Error('El correo ya está registrado')
      err.status = 409
      throw err
    }

    const hashed = await bcrypt.hash(password, ROUNDS)
    const user   = await UserModel.create({ name, email, password: hashed })
    const tokens = await issueTokens(user)

    return { user, ...tokens }
  },

  login: async ({ email, password }) => {
    const user = await UserModel.findByEmail(email)
    if (!user) {
      const err = new Error('Credenciales incorrectas')
      err.status = 401
      throw err
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      const err = new Error('Credenciales incorrectas')
      err.status = 401
      throw err
    }

    const { password: _, ...safeUser } = user
    const tokens = await issueTokens(safeUser)

    return { user: safeUser, ...tokens }
  },

  refresh: async (token) => {
    const stored = await RefreshTokenModel.find(token)
    if (!stored) {
      const err = new Error('Refresh token inválido o expirado')
      err.status = 401
      throw err
    }

    try {
      verifyRefreshToken(token)
    } catch {
      await RefreshTokenModel.delete(token)
      const err = new Error('Refresh token inválido')
      err.status = 401
      throw err
    }

    const user = await UserModel.findById(stored.user_id)
    if (!user) {
      const err = new Error('Usuario no encontrado')
      err.status = 401
      throw err
    }

    // Rotate: delete old, issue new
    await RefreshTokenModel.delete(token)
    const tokens = await issueTokens(user)

    return { user, ...tokens }
  },

  logout: async (token) => {
    if (token) await RefreshTokenModel.delete(token)
  },
}
