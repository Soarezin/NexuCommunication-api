// src/routes/caseRoutes.ts
import { Router } from 'express';
import {
    createCase,
    getCases,
    getCaseById,
    updateCase,
    deleteCase,
} from '../controllers/cases/caseController'; // Importa as funções do controlador de casos

import { authenticateToken } from '../middlewares/authMiddleware'; // Seu middleware de autenticação
import { validate } from '../middlewares/validateMiddleware'; // Seu middleware de validação Zod
import {
    createCaseSchema,
    updateCaseSchema,
} from '../validations/cases/caseValidations'; // Importa os schemas de validação Zod

const router = Router();

// Todas as rotas de caso precisam de autenticação para garantir o isolamento por tenant e por advogado.
// O middleware 'authenticateToken' deve ser aplicado a todas elas.

// Rota para criar um novo caso
// POST /cases
router.post('/', authenticateToken, validate(createCaseSchema), createCase);

// Rota para listar todos os casos do tenant e do advogado autenticado
// GET /cases
router.get('/', authenticateToken, getCases);

// Rota para obter um caso específico por ID
// GET /cases/:id
router.get('/:id', authenticateToken, getCaseById);

// Rota para atualizar um caso existente por ID
// PUT /cases/:id
router.put('/:id', authenticateToken, validate(updateCaseSchema), updateCase);

// Rota para remover um caso por ID
// DELETE /cases/:id
router.delete('/:id', authenticateToken, deleteCase);

export default router;