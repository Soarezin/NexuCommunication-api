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

export const getUserPermissions = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.id;

        console.log(`[PermissionController] Buscando permissões para o usuário com ID: ${userId}...`);

        const userWithPermissions = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                userPermissions: {
                    select: {
                        permission: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                            }
                        }
                    }
                }
            }
        });

        if (!userWithPermissions) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Extrair as permissões de dentro de userPermissions
        const permissions = userWithPermissions.userPermissions.map(up => up.permission);

        console.log(`[PermissionController] Permissões encontradas para o usuário ${userId}:`, permissions);
        res.status(200).json({ permissions });

    } catch (error: unknown) {
        console.error('[PermissionController] Erro ao buscar permissões do usuário:', error);
        next(error);
    }
};
