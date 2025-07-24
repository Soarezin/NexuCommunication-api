// src/controllers/clientController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { CreateClientInput, UpdateClientInput } from '../../validations/clients/clientValidations'; // Importa os tipos de input

const prisma = new PrismaClient();

// Interface para estender o Request do Express com o usuário autenticado
// (Essa interface deve ser consistente em todos os seus controladores que dependem de autenticação)
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        tenantId: string;
    };
}

// 1. Criar um novo cliente (POST /clients)
export const createClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { firstName, lastName, email, phoneNumber } = req.body;
        const tenantId = req.user?.tenantId; // Obtém o tenantId do usuário autenticado

        if (!tenantId) {
            return res.status(401).json({ message: 'Informações do tenant não encontradas. Usuário não autenticado ou token inválido.' });
        }

        // Opcional: Verificar se já existe um cliente com o mesmo email no mesmo tenant
        if (email) {
            const existingClient = await prisma.client.findFirst({
                where: {
                    email,
                    tenantId,
                },
            });
            if (existingClient) {
                return res.status(409).json({ message: 'Já existe um cliente com este e-mail neste escritório.' });
            }
        }

        const newClient = await prisma.client.create({
            data: {
                firstName,
                lastName,
                email,
                phoneNumber,
                tenantId, // Associa o cliente ao tenant do usuário logado
            },
            select: { // Seleciona apenas os campos que você quer retornar
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                tenantId: true,
                createdAt: true,
            },
        });

        res.status(201).json({
            message: 'Cliente criado com sucesso!',
            client: newClient,
        });

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        next(error); // Passa para o middleware de tratamento de erro global
    }
};

// 2. Listar todos os clientes do tenant (GET /clients)
export const getClients = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(401).json({ message: 'Informações do tenant não encontradas. Usuário não autenticado ou token inválido.' });
        }

        const clients = await prisma.client.findMany({
            where: {
                tenantId, // Filtra clientes pelo tenantId do usuário autenticado
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc', // Exemplo: ordenar por data de criação
            },
        });

        res.status(200).json({ clients });

    } catch (error: unknown) {
        next(error);
    }
};

// 3. Obter cliente por ID (GET /clients/:id)
export const getClientById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params; // ID do cliente na URL
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(401).json({ message: 'Informações do tenant não encontradas. Usuário não autenticado ou token inválido.' });
        }

        const client = await prisma.client.findUnique({
            where: {
                id,
                tenantId, // Garante que o cliente pertence ao tenant do usuário logado
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!client) {
            return res.status(404).json({ message: 'Cliente não encontrado ou não pertence ao seu escritório.' });
        }

        res.status(200).json({ client });

    } catch (error: unknown) {
        next(error);
    }
};

// 4. Atualizar cliente (PUT /clients/:id)
export const updateClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(401).json({ message: 'Informações do tenant não encontradas. Usuário não autenticado ou token inválido.' });
        }

        // Primeiro, verificar se o cliente existe e pertence ao tenant
        const existingClient = await prisma.client.findUnique({
            where: {
                id,
                tenantId,
            },
        });

        if (!existingClient) {
            return res.status(404).json({ message: 'Cliente não encontrado ou não pertence ao seu escritório.' });
        }

        // Se o email estiver sendo atualizado, verificar duplicidade dentro do mesmo tenant
        if (updatedData.email && updatedData.email !== existingClient.email) {
            const clientWithSameEmail = await prisma.client.findFirst({
                where: {
                    email: updatedData.email,
                    tenantId,
                    id: { not: id }, // Exclui o próprio cliente da verificação
                },
            });
            if (clientWithSameEmail) {
                return res.status(409).json({ message: 'Já existe outro cliente com este e-mail neste escritório.' });
            }
        }

        const updatedClient = await prisma.client.update({
            where: {
                id,
                tenantId, // Garante que você só atualiza clientes do seu próprio tenant
            },
            data: updatedData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                updatedAt: true,
            },
        });

        res.status(200).json({
            message: 'Cliente atualizado com sucesso!',
            client: updatedClient,
        });

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        next(error);
    }
};

// 5. Remover cliente (DELETE /clients/:id)
export const deleteClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(401).json({ message: 'Informações do tenant não encontradas. Usuário não autenticado ou token inválido.' });
        }

        // Verificar se o cliente existe e pertence ao tenant antes de deletar
        const clientToDelete = await prisma.client.findUnique({
            where: {
                id,
                tenantId,
            },
            select: { id: true }, // Apenas precisamos saber se existe
        });

        if (!clientToDelete) {
            return res.status(404).json({ message: 'Cliente não encontrado ou não pertence ao seu escritório.' });
        }

        // Opcional: Lógica para verificar se o cliente tem casos ou mensagens associadas
        // e como lidar com isso (ex: deletar em cascata, impedir exclusão, desassociar).
        // Por enquanto, o Prisma tratará as cascatas se você configurou onDelete CASCADE no schema.
        // Se não, o delete pode falhar se houver relações fortes.

        await prisma.client.delete({
            where: {
                id,
                tenantId, // Garante que você só deleta clientes do seu próprio tenant
            },
        });

        res.status(204).send(); // 204 No Content para deleções bem-sucedidas

    } catch (error: unknown) {
        next(error);
    }
};