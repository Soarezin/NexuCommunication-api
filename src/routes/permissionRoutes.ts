// src/routes/permissionRoutes.ts
import { Router } from 'express';
import { getAllPermissions } from '../controllers/permissions/permissionController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { hasPermission } from '../middlewares/authorizationMiddleware';

const router = Router();

// Rota para listar todas as permissões
// Requer autenticação e a permissão 'can_define_user_permissions' (que é uma permissão de admin)
router.get('/', authenticateToken, hasPermission('can_define_user_permissions'), getAllPermissions);

export default router;