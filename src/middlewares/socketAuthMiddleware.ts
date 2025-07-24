// src/middlewares/socketAuthMiddleware.ts
import { Socket } from 'socket.io';
import { verifyToken, JwtPayload } from '../utils/jwt';

interface AuthenticatedSocket extends Socket {
    user?: JwtPayload;
}

export const authenticateSocket = (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    // Tenta obter o token JWT do handshake (cabeçalhos ou query)
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    console.log(`[SocketAuth] Tentando autenticar socket. Token recebido: ${token ? token.substring(0, 20) + '...' : 'Nenhum'}`);
    console.log(`[SocketAuth] Origem do Handshake: ${socket.handshake.headers.origin}`);

    if (!token || typeof token !== 'string') {
        console.error('[SocketAuth] Autenticação falhou: Token não fornecido ou inválido (tipo).');
        return next(new Error('Autenticação de socket falhou: Token não fornecido.'));
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded) {
            console.error('[SocketAuth] Autenticação falhou: Token inválido (não decodificado ou assinatura errada).');
            return next(new Error('Autenticação de socket falhou: Token inválido.'));
        }
        // Anexa o payload decodificado ao objeto socket
        socket.user = decoded;
        console.log(`[SocketAuth] Socket autenticado com sucesso para UserId: ${decoded.userId}, TenantId: ${decoded.tenantId}`);
        next();
    } catch (error) {
        console.error('[SocketAuth] Erro catastrófico ao verificar token:', error);
        return next(new Error('Autenticação de socket falhou: Erro ao verificar token.'));
    }
};