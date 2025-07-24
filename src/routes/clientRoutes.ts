// src/routes/clientRoutes.ts
import { Router } from 'express';
import {
    createClient,
    getClients,
    getClientById,
    updateClient,
    deleteClient,
} from '../controllers/clients/clientController'; // Importa as funções do controlador de clientes

import { authenticateToken } from '../middlewares/authMiddleware'; // Seu middleware de autenticação
import { validate } from '../middlewares/validateMiddleware'; // Seu middleware de validação Zod
import {
    createClientSchema,
    updateClientSchema,
} from '../validations/clients/clientValidations'; // Importa os schemas de validação Zod

const router = Router();

// Todas as rotas de cliente precisam de autenticação para garantir o isolamento por tenant.
// O middleware 'authenticateToken' deve ser aplicado a todas elas.

// Rota para criar um novo cliente
// POST /clients
router.post('/', authenticateToken, validate(createClientSchema), createClient);

// Rota para listar todos os clientes do tenant do usuário autenticado
// GET /clients
router.get('/', authenticateToken, getClients);

// Rota para obter um cliente específico por ID
// GET /clients/:id
router.get('/:id', authenticateToken, getClientById);

// Rota para atualizar um cliente existente por ID
// PUT /clients/:id
router.put('/:id', authenticateToken, validate(updateClientSchema), updateClient);

// Rota para remover um cliente por ID
// DELETE /clients/:id
router.delete('/:id', authenticateToken, deleteClient);

export default router;