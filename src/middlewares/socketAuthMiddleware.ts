// src/middlewares/socketAuthMiddleware.ts
import { Socket } from 'socket.io';
import { verifyToken, JwtPayload } from '../utils/jwt'; // Importe JwtPayload

// Ajuste para usar JwtPayload diretamente, garantindo consistência
interface AuthenticatedSocket extends Socket {
    user?: JwtPayload; 
}

export const authenticateSocket = (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    // Tenta obter o token JWT do handshake (cabeçalhos ou query)
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    console.log(`[SocketAuth] Tentando autenticar socket. Token recebido no handshake: ${token ? token.substring(0, 20) + '...' : 'Nenhum'}`);
    console.log(`[SocketAuth] Headers do Handshake:`, socket.handshake.headers); // Verifique todos os headers
    console.log(`[SocketAuth] Query do Handshake:`, socket.handshake.query); // Verifique a query

    if (!token || typeof token !== 'string') {
        console.error('[SocketAuth] Autenticação falhou: Token não fornecido ou tipo inválido.');
        return next(new Error('Autenticação de socket falhou: Token não fornecido.'));
    }

    try {
        const decoded = verifyToken(token); // Sua função verifyToken
        if (!decoded) {
            console.error('[SocketAuth] Autenticação falhou: Token inválido (verifyToken retornou null).');
            return next(new Error('Autenticação de socket falhou: Token inválido.'));
        }
        
        // >>> CORREÇÃO CRÍTICA AQUI: GARANTINDO QUE DECODED É JwtPayload <<<
        // O decoded do verifyToken já é JwtPayload, então podemos atribuir diretamente
        socket.user = decoded; 
        
        // No log, acesse userId diretamente de decoded
        console.log(`[SocketAuth] Socket autenticado com sucesso para UserId: ${decoded.id}, TenantId: ${decoded.tenantId}`);
        next();
    } catch (error) {
        console.error('[SocketAuth] Erro inesperado ao verificar token (pode ser expirado ou malformado):', error);
        return next(new Error('Autenticação de socket falhou: Erro ao verificar token.'));
    }
};