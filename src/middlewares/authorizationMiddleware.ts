// src/middlewares/authorizationMiddleware.ts
import { Request, Response, NextFunction } from 'express';
// Reutilize a interface JwtPayload e AuthRequest do seu authMiddleware
import { JwtPayload, AuthRequest } from './authMiddleware';
// Importe UserRole se precisar de autorização baseada em papel, além de granular
import { UserRole } from '@prisma/client';

// O middleware authenticateToken já popula req.user com o payload,
// então podemos usar AuthRequest.

/**
 * Middleware para verificar se o usuário tem uma permissão específica.
 * @param requiredPermission - A permissão que o usuário precisa ter (ex: 'can_create_case').
 */
export const hasPermission = (requiredPermission: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const userPermissions = req.user?.permissions;

        // Se o usuário não está logado ou não tem permissões
        if (!req.user || !userPermissions || userPermissions.length === 0) {
            return res.status(401).json({ message: 'Acesso não autorizado. Autenticação ou permissões ausentes.' });
        }

        // Verifica se o array de permissões do usuário inclui a permissão necessária
        if (!userPermissions.includes(requiredPermission)) {
            console.warn(`Acesso negado: Usuário ${req.user.userId} não tem a permissão '${requiredPermission}'.`);
            return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para realizar esta ação.' });
        }

        // Se a permissão é encontrada, continua para a próxima função (o controlador)
        next();
    };
};

/**
 * Middleware para verificar se o usuário tem pelo menos uma das permissões.
 * Útil para rotas onde mais de uma permissão pode conceder acesso.
 * @param requiredPermissions - Um array de permissões.
 */
export const hasAnyPermission = (requiredPermissions: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const userPermissions = req.user?.permissions;

        if (!req.user || !userPermissions || userPermissions.length === 0) {
            return res.status(401).json({ message: 'Acesso não autorizado. Autenticação ou permissões ausentes.' });
        }

        // Verifica se o usuário tem pelo menos UMA das permissões necessárias
        const hasAny = userPermissions.some(permission => requiredPermissions.includes(permission));

        if (!hasAny) {
            console.warn(`Acesso negado: Usuário ${req.user.userId} não tem nenhuma das permissões necessárias: ${requiredPermissions.join(', ')}.`);
            return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para realizar esta ação.' });
        }

        next();
    };
};

// Exemplo de uso de permissões baseadas em papel (se você precisar disso também)
export const authorizeRole = (allowedRoles: UserRole[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.role;
        
        if (!req.user || !userRole || !allowedRoles.includes(userRole)) {
            return res.status(403).json({ message: 'Acesso negado. Você não tem o papel correto.' });
        }

        next();
    };
};