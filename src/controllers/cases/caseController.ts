// src/controllers/caseController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { CreateCaseInput, UpdateCaseInput } from '../../validations/cases/caseValidations';

const prisma = new PrismaClient();

// Interface para estender o Request do Express com o usuário autenticado
interface AuthenticatedRequest extends Request {
    user?: {
        userId: string; // userId
        tenantId: string;
    };
}

// 1. Criar um novo caso (POST /cases)
export const createCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { title, description, status, clientId } = req.body;
        const tenantId = req.user?.tenantId;
        const lawyerId = req.user?.userId;

        console.log(`[Backend Cases - createCase] Tentando criar caso para Tenant ID: ${tenantId}, Lawyer ID: ${lawyerId}`);
        console.log(`[Backend Cases - createCase] Dados recebidos: Título: ${title}, Cliente ID: ${clientId}`);

        if (!tenantId || !lawyerId) {
            console.warn('[Backend Cases - createCase] Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        // Verificar se o cliente (clientId) existe e pertence ao mesmo tenant
        const client = await prisma.client.findUnique({
            where: {
                id: clientId,
                tenantId,
            },
        });

        if (!client) {
            console.warn(`[Backend Cases - createCase] Cliente ID ${clientId} não encontrado ou não pertence ao Tenant ID ${tenantId}.`);
            return res.status(404).json({ message: 'Cliente não encontrado ou não pertence ao seu escritório.' });
        }
        console.log(`[Backend Cases - createCase] Cliente ${client.firstName} ${client.lastName} (ID: ${client.id}) verificado e pertence ao tenant.`);

        const newCase = await prisma.case.create({
            data: {
                title,
                description,
                status,
                clientId,
                lawyerId,
                tenantId,
            },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                clientId: true,
                lawyerId: true,
                tenantId: true,
                createdAt: true,
                updatedAt: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                lawyer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        console.log(`[Backend Cases - createCase] Caso '${newCase.title}' (ID: ${newCase.id}) criado com sucesso.`);
        res.status(201).json({
            message: 'Caso criado com sucesso!',
            case: newCase,
        });

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            console.error('[Backend Cases - createCase] Erro de validação Zod:', error.issues);
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        console.error('[Backend Cases - createCase] Erro inesperado:', error);
        next(error);
    }
};

// 2. Listar todos os casos do tenant e do advogado (GET /cases)
export const getCases = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.user?.tenantId;
        const lawyerId = req.user?.userId;
        // >>> NOVO: Obter clientId da query string <<<
        const { clientId } = req.query; // req.query contém os parâmetros da URL, como ?clientId=abc

        console.log(`[Backend Cases - getCases] Tentando buscar casos para Tenant ID: ${tenantId}, Lawyer ID: ${lawyerId}, Filtrando por Cliente ID: ${clientId || 'Nenhum'}`);

        if (!tenantId || !lawyerId) {
            console.warn('[Backend Cases - getCases] Informações de autenticação incompletas na requisição.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        // Construir o objeto 'where' dinamicamente
        const whereClause: any = { // Usamos 'any' aqui para flexibilidade, ou podemos tipar melhor o 'where'
            tenantId,
            lawyerId,
        };

        if (clientId) {
            whereClause.clientId = clientId as string; // Adiciona o filtro por clientId se ele for fornecido
        }

        const cases = await prisma.case.findMany({
            where: whereClause, // Usamos a cláusula 'where' dinâmica
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                clientId: true,
                lawyerId: true,
                tenantId: true,
                createdAt: true,
                updatedAt: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        console.log(`[Backend Cases - getCases] Query de casos executada. Encontrados ${cases.length} casos.`);
        console.log(`[Backend Cases - getCases] Detalhes dos casos encontrados (primeiros 3):`, cases.slice(0, 3));
        res.status(200).json({ cases });

    } catch (error: unknown) {
        console.error('[Backend Cases - getCases] Erro inesperado ao buscar casos:', error);
        next(error);
    }
};

// 3. Obter caso por ID (GET /cases/:id)
export const getCaseById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.tenantId;
        const lawyerId = req.user?.userId;

        console.log(`[Backend Cases - getCaseById] Tentando buscar caso ${id} para Tenant ID: ${tenantId}, Lawyer ID: ${lawyerId}`);

        if (!tenantId || !lawyerId) {
            console.warn('[Backend Cases - getCaseById] Informações de autenticação incompletas na requisição.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const caseItem = await prisma.case.findUnique({
            where: {
                id,
                tenantId,
                lawyerId,
            },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                clientId: true,
                lawyerId: true,
                tenantId: true, // Adicionado para depuração
                createdAt: true,
                updatedAt: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneNumber: true,
                    },
                },
                lawyer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        content: true,
                        senderId: true,
                        createdAt: true,
                    },
                },
                files: {
                    select: {
                        id: true,
                        name: true,
                        url: true,
                    },
                },
            },
        });

        if (!caseItem) {
            console.warn(`[Backend Cases - getCaseById] Caso ${id} não encontrado ou não pertence ao usuário/tenant.`);
            return res.status(404).json({ message: 'Caso não encontrado ou não pertence ao seu escritório/advogado.' });
        }

        console.log(`[Backend Cases - getCaseById] Caso '${caseItem.title}' (ID: ${caseItem.id}) encontrado.`);
        res.status(200).json({ case: caseItem });

    } catch (error: unknown) {
        console.error('[Backend Cases - getCaseById] Erro inesperado ao buscar caso por ID:', error);
        next(error);
    }
};

// 4. Atualizar caso (PUT /cases/:id)
export const updateCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const tenantId = req.user?.tenantId;
        const lawyerId = req.user?.userId;

        console.log(`[Backend Cases - updateCase] Tentando atualizar caso ${id} para Tenant ID: ${tenantId}, Lawyer ID: ${lawyerId}`);
        console.log(`[Backend Cases - updateCase] Dados de atualização:`, updatedData);

        if (!tenantId || !lawyerId) {
            console.warn('[Backend Cases - updateCase] Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const existingCase = await prisma.case.findUnique({
            where: {
                id,
                tenantId,
                lawyerId,
            },
            select: { id: true },
        });

        if (!existingCase) {
            console.warn(`[Backend Cases - updateCase] Caso ${id} não encontrado ou não pertence ao usuário/tenant para atualização.`);
            return res.status(404).json({ message: 'Caso não encontrado ou você não tem permissão para editá-lo.' });
        }
        console.log(`[Backend Cases - updateCase] Caso ${id} verificado para atualização.`);

        const updatedCase = await prisma.case.update({
            where: {
                id,
                tenantId,
                lawyerId,
            },
            data: updatedData,
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                clientId: true,
                lawyerId: true,
                updatedAt: true,
            },
        });

        console.log(`[Backend Cases - updateCase] Caso ${updatedCase.id} atualizado com sucesso.`);
        res.status(200).json({
            message: 'Caso atualizado com sucesso!',
            case: updatedCase,
        });

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            console.error('[Backend Cases - updateCase] Erro de validação Zod:', error.issues);
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        console.error('[Backend Cases - updateCase] Erro inesperado ao atualizar caso:', error);
        next(error);
    }
};

// 5. Remover caso (DELETE /cases/:id)
export const deleteCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.tenantId;
        const lawyerId = req.user?.userId;

        console.log(`[Backend Cases - deleteCase] Tentando deletar caso ${id} para Tenant ID: ${tenantId}, Lawyer ID: ${lawyerId}`);

        if (!tenantId || !lawyerId) {
            console.warn('[Backend Cases - deleteCase] Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const caseToDelete = await prisma.case.findUnique({
            where: {
                id,
                tenantId,
                lawyerId,
            },
            select: { id: true },
        });

        if (!caseToDelete) {
            console.warn(`[Backend Cases - deleteCase] Caso ${id} não encontrado ou não pertence ao usuário/tenant para deleção.`);
            return res.status(404).json({ message: 'Caso não encontrado ou você não tem permissão para deletá-lo.' });
        }
        console.log(`[Backend Cases - deleteCase] Caso ${id} verificado para deleção.`);


        await prisma.case.delete({
            where: {
                id,
                tenantId,
                lawyerId,
            },
        });

        console.log(`[Backend Cases - deleteCase] Caso ${id} deletado com sucesso.`);
        res.status(204).send();

    } catch (error: unknown) {
        console.error('[Backend Cases - deleteCase] Erro inesperado ao deletar caso:', error);
        next(error);
    }
};