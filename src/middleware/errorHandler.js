export const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err)

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ message: 'Datos inválidos', errors: err.errors })
  }

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos' })
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referencia inválida' })
  }

  const status = err.status || err.statusCode || 500
  const message = status < 500 ? err.message : 'Error interno del servidor'

  res.status(status).json({ message })
}

// Wrap async route handlers — avoids try/catch boilerplate
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)
