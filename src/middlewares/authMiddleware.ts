// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt, { Secret } from "jsonwebtoken"; // Importe 'Secret'
// >>> IMPORTAÇÕES DO JWT COM O PAYLOAD CORRETO <<<
import { JwtPayload } from '../utils/jwt'; // Importe a interface JwtPayload completa

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'uma_chave_secreta_muito_forte_e_aleatoria';
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    // Retorna a mensagem de erro que já estávamos usando nos outros middlewares
    return res.status(401).json({ message: "Informações de autenticação incompletas. Usuário não autenticado ou token inválido." });
  }

  try {
    // >>> AJUSTE: jwt.verify agora decodifica para o payload completo <<<
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Anexa o payload decodificado ao objeto req.user
    // Agora, req.user terá userId, tenantId, role e permissions
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Token inválido ou expirado." });
  }
};

export { JwtPayload };
