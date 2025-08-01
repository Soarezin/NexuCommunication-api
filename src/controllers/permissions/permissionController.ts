// src/controllers/permissionController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/authController';

const prisma = new PrismaClient();

/**
 * @route GET /permissions
 * @description Retorna todas as permissões disponíveis no sistema.
 * @access Private (requer permissão de administrador)
 */
export const getAllPermissions = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        // A autorização já será verificada pelo middleware hasPermission antes de chegar aqui.
        // req.user?.userId; // O ID do usuário logado que solicitou a lista
        
        console.log('[PermissionController] Buscando todas as permissões do sistema...');

        const permissions = await prisma.permission.findMany({
            select: {
                id: true,
                name: true,
                description: true,
            },
            orderBy: {
                name: 'asc',
            },
        });

        console.log(`[PermissionController] Encontradas ${permissions.length} permissões.`);
        res.status(200).json({ permissions });

    } catch (error: unknown) {
        console.error('[PermissionController] Erro ao buscar permissões:', error);
        next(error);
    }
};