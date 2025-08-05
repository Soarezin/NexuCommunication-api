// src/controllers/userController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Reutilizamos a interface AuthenticatedRequest para ter acesso a req.user
interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        tenantId: string;
    };
}

/**
 * @route GET /users
 * @description Retorna todos os usuários (advogados) do tenant do usuário autenticado.
 * @access Private (somente para usuários autenticados)
 */
export const getUsersByTenant = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.user?.tenantId;
        
        console.log(`[UserController] Buscando usuários para o Tenant ID: ${tenantId}`);

        if (!tenantId) {
            console.warn('[UserController] Falha na autenticação: Tenant ID não fornecido.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const users = await prisma.user.findMany({
            where: {
                tenantId: tenantId,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                createdAt: true,
                role: true,
                isActive: true
            },
            orderBy: {
                firstName: 'asc',
            },
        });

        console.log(`[UserController] Encontrados ${users.length} usuários para o Tenant ID: ${tenantId}`);
        res.status(200).json({ users });

    } catch (error: unknown) {
        console.error('[UserController] Erro ao buscar usuários:', error);
        next(error);
    }
};

/**
 * @route GET /users/:id
 * @description Retorna um usuário específico do mesmo tenant.
 * @access Private (somente para usuários autenticados)
 */
export const getUserById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.tenantId;

        console.log(`[UserController] Buscando usuário com ID: ${id} para o Tenant ID: ${tenantId}`);

        if (!tenantId) {
            console.warn('[UserController] Falha na autenticação: Tenant ID não fornecido.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const user = await prisma.user.findUnique({
            where: {
                id: id,
                tenantId: tenantId, 
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                createdAt: true,
                role: true,
                isActive: true,
            },
        });

        if (!user) {
            console.warn(`[UserController] Usuário ID: ${id} não encontrado ou não pertence ao Tenant ID: ${tenantId}.`);
            return res.status(404).json({ message: 'Usuário não encontrado ou você não tem permissão.' });
        }

        res.status(200).json({ user });

    } catch (error: unknown) {
        console.error('[UserController] Erro ao buscar usuário por ID:', error);
        next(error);
    }
};