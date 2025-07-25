// src/controllers/messageController.ts (Versão simplificada para HTTP)
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
// import { ZodError } from 'zod'; // Não é mais necessário para createMessage aqui
// import { createMessageSchema } from '../validations/messageValidations'; // Não é mais necessário para createMessage aqui
// import { sendEmail } from '../services/emailService'; // Não é mais necessário aqui, movido para socket.ts

const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        tenantId: string;
    };
}

// A lógica de criação de mensagem via HTTP não será mais o principal.
// Opcional: Você pode remover a função createMessage daqui se o envio for 100% WebSocket.
// Se quiser manter um fallback HTTP, ele precisaria disparar eventos socket ou chamar a mesma lógica.
// Por simplicidade, vamos remover createMessage daqui, e ele será APENAS via Socket.IO.

// 1. Listar mensagens de um caso específico (GET /cases/:caseId/messages) - PERMANECE HTTP
export const getMessagesByCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { caseId } = req.params;
        const tenantId = req.user?.tenantId;
        const userId = req.user?.id; // O advogado que acessa as mensagens

        if (!tenantId || !userId) {
            console.log(tenantId, userId);
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const caseItem = await prisma.case.findUnique({
            where: {
                id: caseId,
                tenantId,
                lawyerId: userId,
            },
            select: { id: true, clientId: true },
        });

        if (!caseItem) {
            return res.status(404).json({ message: 'Caso não encontrado ou você não tem permissão para visualizar suas mensagens.' });
        }

        const messages = await prisma.message.findMany({
            where: {
                caseId,
                tenantId,
                OR: [
                    { senderId: userId, receiverClientId: caseItem.clientId },
                    // { sender: { id: caseItem.clientId, tenantId }, receiverClient: { id: userId, tenantId } } // Se cliente puder enviar para user
                ]
            },
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                viewed: true,
                viewedAt: true,
                sender: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                receiverClient: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });

        res.status(200).json({ messages });

    } catch (error: unknown) {
        next(error);
    }
};

// 2. Marcar mensagem como visualizada (PUT /messages/:id/viewed) - PERMANECE HTTP (e pode ser disparado via socket no frontend)
// A lógica para `clearNotificationTimeout` precisa ser importada/replicada aqui se o socket.ts não chamar esta rota.
// Para simplificar, o `clearNotificationTimeout` do socket.ts será o principal,
// e o PUT HTTP também chamará a mesma lógica se for o caso.
// Para que o PUT HTTP também cancele o timeout, precisamos da lógica de `clearNotificationTimeout` aqui.
// Vamos importar o mapa de timeouts e a função auxiliar de `socket.ts` para este arquivo também.

// Nota: Em um sistema maior, essa lógica de `clearNotificationTimeout`
// e o `messageNotificationTimeouts` Map estariam em um serviço compartilhado
// (ou um job scheduler) para evitar duplicação e garantir consistência.
// Para o MVP, vamos repetir a importação e a função auxiliar para que ambas as rotas funcionem.

// NOVO: Importe o mapa e a função auxiliar
const messageNotificationTimeouts = new Map<string, NodeJS.Timeout>(); // Redefinir (idealmente seria um módulo compartilhado)
const clearNotificationTimeout = (messageId: string) => {
    const timeout = messageNotificationTimeouts.get(messageId);
    if (timeout) {
        clearTimeout(timeout);
        messageNotificationTimeouts.delete(messageId);
        console.log(`[HTTP] Timeout de notificação para a mensagem ${messageId} cancelado via HTTP.`);
    }
};

export const markMessageAsViewed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.tenantId;
        const userId = req.user?.id; // Assumindo advogado marcando

        if (!tenantId || !userId) {
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        const message = await prisma.message.findUnique({
            where: { id, tenantId },
            select: { id: true, viewed: true, receiverClientId: true, case: { select: { lawyerId: true } } }
        });

        if (!message) {
            return res.status(404).json({ message: 'Mensagem não encontrada ou não pertence ao seu escritório.' });
        }

        if (userId !== message.case.lawyerId) {
            // Se o cliente pudesse autenticar, esta verificação seria diferente.
            return res.status(403).json({ message: 'Você não tem permissão para marcar esta mensagem como visualizada.' });
        }

        if (message.viewed) {
            return res.status(200).json({ message: 'Mensagem já está marcada como visualizada.' });
        }

        const updatedMessage = await prisma.message.update({
            where: { id },
            data: { viewed: true, viewedAt: new Date() },
            select: { id: true, content: true, createdAt: true, viewed: true, viewedAt: true },
        });

        // Cancela o timeout de notificação por e-mail, se existir
        clearNotificationTimeout(message.id);

        res.status(200).json({ message: 'Mensagem marcada como visualizada!', messageData: updatedMessage });

    } catch (error: unknown) {
        next(error);
    }
};