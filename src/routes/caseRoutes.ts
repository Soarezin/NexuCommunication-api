// src/routes/caseRoutes.ts
import { Router } from 'express';
import {
    createCase,
    getCases,
    getCaseById,
    updateCase,
    deleteCase,
} from '../controllers/cases/caseController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validateMiddleware';
// >>> AJUSTE: MANTENHA A IMPORTAÇÃO DE hasPermission COMO ESTÁ, POIS ELA ESTÁ CORRETA.
// O erro deve ser em outro arquivo ou no processo de compilação.
import { hasPermission, hasAnyPermission } from '../middlewares/authorizationMiddleware';
import {
    createCaseSchema,
    updateCaseSchema,
} from '../validations/cases/caseValidations';

const router = Router();

// Rota para criar um novo caso - requer permissão 'can_create_case'
router.post('/', authenticateToken, hasPermission('can_create_case'), validate(createCaseSchema), createCase);

// Rota para listar todos os casos - requer permissão 'can_view_all_cases'
router.get('/', authenticateToken, hasPermission('can_view_all_cases'), getCases);

// Rota para obter um caso específico por ID - requer permissão 'can_view_all_cases'
router.get('/:id', authenticateToken, hasPermission('can_view_all_cases'), getCaseById);

// Rota para atualizar um caso existente por ID - requer permissão 'can_edit_case'
router.put('/:id', authenticateToken, hasPermission('can_edit_case'), validate(updateCaseSchema), updateCase);

// Rota para remover um caso por ID - requer permissão 'can_delete_case'
router.delete('/:id', authenticateToken, hasPermission('can_delete_case'), deleteCase);


export default router;