import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido." })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest["user"]
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ error: "Token inválido ou expirado." })
  }
}
