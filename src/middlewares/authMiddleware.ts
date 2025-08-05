// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express"
import jwt, { Secret } from "jsonwebtoken"
import { JwtPayload } from "@/utils/jwt"

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'uma_chave_secreta_muito_forte_e_aleatoria'

export interface AuthRequest extends Request {
  user?: JwtPayload
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  const token = authHeader?.split(" ")[1]

  if (!token) {
    return res.status(401).json({
      message: "Informações de autenticação incompletas. Usuário não autenticado ou token inválido."
    })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ message: "Token inválido ou expirado." })
  }
}
