// src/routes/userRoutes.ts
import { Router } from 'express';
import { getUsersByTenant, getUserById } from '../controllers/users/userController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

// Rota para listar todos os usuários do tenant
router.get('/', authenticateToken, getUsersByTenant);

// Rota para obter um usuário específico por ID
router.get('/:id', authenticateToken, getUserById);

export default router;