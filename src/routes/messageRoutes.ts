// src/routes/messageRoutes.ts (APENAS ROTAS HTTP para histórico e marcar como visualizada)
import { Router } from 'express';
import {
    // createMessage, // REMOVIDO: Envio principal via WebSocket
    getMessagesByCase,
    markMessageAsViewed,
} from '../controllers/messages/messageController';

import { authenticateToken } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validateMiddleware';
import {
    createMessageSchema, // Mantém o schema para validação se o createMessage HTTP fosse mantido
} from '../validations/messages/messageValidations';

const router = Router();

// Rota para listar todas as mensagens de um caso específico (HISTÓRICO)
// GET /messages/cases/:caseId
router.get('/cases/:caseId', authenticateToken, getMessagesByCase);

// Rota para marcar uma mensagem como visualizada
// PUT /messages/:id/viewed
router.put('/:id/viewed', authenticateToken, markMessageAsViewed);

// Opcional: Se você ainda quiser um POST /messages via HTTP para fallback ou para outros propósitos
// router.post('/', authenticateToken, validate(createMessageSchema), createMessage);
// Mas a recomendação é usar o Socket.IO para o envio principal.

export default router;