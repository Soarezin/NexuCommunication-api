// src/routes/inviteRoutes.ts
import { Router } from 'express';
import { inviteClientToCase, registerClientViaInvite } from '../controllers/invites/inviteController';
import { authenticateToken } from '../middlewares/authMiddleware'; // Para proteger a rota de envio de convite
import { validate } from '../middlewares/validateMiddleware'; // Para validação Zod
import { inviteClientSchema, registerViaInviteSchema } from '../validations/invites/inviteValidations';

const router = Router();

// Endpoint para o advogado enviar um convite
// POST /api/cases/:lawsuitId/invite-client
router.post('/cases/:lawsuitId/invite-client', authenticateToken, validate(inviteClientSchema), inviteClientToCase);

// Endpoint para o cliente se registrar via convite
// POST /api/register/invite (Esta rota NÃO é protegida por token JWT do advogado, pois o cliente ainda não está logado)
router.post('/register/invite', validate(registerViaInviteSchema), registerClientViaInvite);

export default router;