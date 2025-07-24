// src/routes/authRoutes.ts
import { Router } from 'express';
import {
    register,
    login,
    updateProfile,
    changePassword
} from '../controllers/auth/authController'; // Ajuste o caminho se o arquivo estiver em src/controllers
import { authenticateToken } from '../middlewares/authMiddleware'; // Seu middleware de autenticação
import { validate } from '../middlewares/validateMiddleware'; // Seu middleware de validação Zod
import {
    registerSchema,
    loginSchema,
    updateProfileSchema,
    changePasswordSchema
} from '../validations/authValidations'; // Sem .js aqui
    
const router = Router();

// Rota de registro (não precisa de autenticação)
// Aplica o middleware de validação antes de chamar o controlador
router.post('/register', validate(registerSchema), register);

// Rota de login (não precisa de autenticação)
// Aplica o middleware de validação antes de chamar o controlador
router.post('/login', validate(loginSchema), login);

// Rotas protegidas por autenticação
// O middleware 'authenticateToken' deve popular req.user com id e tenantId
router.put('/profile', authenticateToken, validate(updateProfileSchema), updateProfile);
router.put('/change-password', authenticateToken, validate(changePasswordSchema), changePassword);

export default router;