// src/controllers/messages/messageController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client'; // Não precisa importar os Enums de Case aqui, apenas PrismaClient
import { ZodError } from 'zod';
import { createMessageSchema } from '../../validations/messages/messageValidations';
import { sendEmail } from '../../services/messages/emailService'; // Caminho corrigido se for 'messages/emailService'
import { AuthenticatedRequest } from '../auth/authController'; 

const prisma = new PrismaClient();

// Mapa para armazenar temporariamente os timeouts de notificação por mensagem
const messageNotificationTimeouts = new Map<string, NodeJS.Timeout>();

const clearNotificationTimeout = (messageId: string) => {
    const timeout = messageNotificationTimeouts.get(messageId);
    if (timeout) {
        clearTimeout(timeout);
        messageNotificationTimeouts.delete(messageId);
        console.log(`[MessageController] Timeout de notificação para a mensagem ${messageId} cancelado.`);
    }
};

// 1. Enviar uma nova mensagem (POST /messages)
export const createMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { content, caseId, receiverClientId } = createMessageSchema.parse(req.body);
        const tenantId = req.user?.tenantId;
        const senderId = req.user?.userId; 

        console.log(`[MessageController - createMessage] Tentando enviar mensagem para caso ${caseId}, cliente ${receiverClientId}, pelo advogado ${senderId} (Tenant: ${tenantId})`);

        if (!tenantId || !senderId) {
            console.warn('[MessageController - createMessage] Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        // 1.1. Verificar se o caso existe, pertence ao tenant E se o advogado é um participante
        const caseItem = await prisma.case.findUnique({
            where: {
                id: caseId,
                tenantId,
                // O advogado (senderId) deve ser um participante do caso
                participantsUsers: {
                    some: {
                        userId: senderId,
                    },
                },
            },
            // Inclua o cliente principal do caso, e os participantes clientes
            select: { 
                id: true, 
                title: true, 
                clientPrimaryId: true, // NOVO: Obtenha o cliente principal do caso
                participantsClients: { // NOVO: Obtenha os clientes participantes
                    where: { clientId: receiverClientId }, // Verifica se receiverClientId é um participante
                    select: { clientId: true, client: { select: { email: true, firstName: true, lastName: true } } }
                }
            },
        });

        if (!caseItem) {
            console.warn(`[MessageController - createMessage] Caso ${caseId} não encontrado ou advogado ${senderId} não tem permissão para enviar mensagens.`);
            return res.status(404).json({ message: 'Caso não encontrado ou você não tem permissão para enviar mensagens para este caso.' });
        }
        console.log(`[MessageController - createMessage] Caso "${caseItem.title}" verificado.`);

        // 1.2. Verificar se o receiverClientId é um dos clientes participantes do caso (ou o clientPrimaryId)
        // Isso garante que a mensagem só vai para um cliente que realmente pertence ao caso
        const isReceiverClientParticipant = caseItem.participantsClients.some(pc => pc.clientId === receiverClientId);
        const isReceiverClientPrimary = caseItem.clientPrimaryId === receiverClientId;

        if (!isReceiverClientParticipant && !isReceiverClientPrimary) {
            console.warn(`[MessageController - createMessage] Cliente recebedor ${receiverClientId} não é participante principal ou secundário do caso ${caseId}.`);
            return res.status(400).json({ message: 'O cliente recebedor não está associado a este caso.' });
        }
        
        const receiverClientDetails = caseItem.participantsClients.find(pc => pc.clientId === receiverClientId)?.client || (isReceiverClientPrimary ? (await prisma.client.findUnique({ where: { id: caseItem.clientPrimaryId as string }, select: { email: true, firstName: true, lastName: true } })) : null);
        
        if (!receiverClientDetails) {
            console.warn(`[MessageController - createMessage] Detalhes do cliente recebedor ${receiverClientId} não encontrados.`);
            return res.status(404).json({ message: 'Cliente recebedor não encontrado.' });
        }
        console.log(`[MessageController - createMessage] Cliente recebedor ${receiverClientDetails.firstName} ${receiverClientDetails.lastName} verificado.`);


        // 1.3. Criar a mensagem no banco de dados
        const newMessage = await prisma.message.create({
            data: {
                content,
                caseId,
                senderId,
                receiverClientId,
                tenantId,
                viewed: false,
            },
            include: { // Incluir dados do sender e receiver para emitir via Socket.IO
                sender: { select: { id: true, firstName: true, lastName: true, email: true } },
                receiverClient: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
        console.log(`[MessageController - createMessage] Mensagem (ID: ${newMessage.id}) salva no DB.`);

        res.status(201).json({
            message: 'Mensagem enviada com sucesso!',
            messageData: newMessage,
        });

        // 1.4. Lógica de notificação por e-mail (com setTimeout temporário)
        const notificationDelay = 5 * 60 * 1000; // 5 minutos

        const timeoutId = setTimeout(async () => {
            const messageStatus = await prisma.message.findUnique({
                where: { id: newMessage.id },
                select: { viewed: true },
            });

            // Se a mensagem ainda não foi visualizada e o cliente tem email
            if (messageStatus && !messageStatus.viewed && receiverClientDetails.email) {
                const subject = `Nova mensagem no seu caso "${caseItem.title}" no Nexu Communication`;
                const text = `Olá ${receiverClientDetails.firstName},\n\nVocê tem uma nova mensagem não visualizada no caso "${caseItem.title}".\n\nConteúdo: "${newMessage.content}"\n\nAcesse o Nexu Communication para visualizar: [Link para o seu frontend]\n\nAtenciosamente,\nSua equipe Nexu Communication.`;
                const html = `
                    <p>Olá <strong>${receiverClientDetails.firstName}</strong>,</p>
                    <p>Você tem uma nova mensagem não visualizada no caso <strong>"${caseItem.title}"</strong>.</p>
                    <p><strong>Conteúdo:</strong> "${newMessage.content}"</p>
                    <p>Acesse o Nexu Communication para visualizar: <a href="[Link para o seu frontend]">Clique aqui</a></p>
                    <p>Atenciosamente,<br/>Sua equipe Nexu Communication.</p>
                `;
                await sendEmail(receiverClientDetails.email, subject, text, html);
                console.log(`[MessageController - createMessage] E-mail de notificação enviado para ${receiverClientDetails.email} sobre mensagem ${newMessage.id}.`);
            }
            messageNotificationTimeouts.delete(newMessage.id);
        }, notificationDelay);

        messageNotificationTimeouts.set(newMessage.id, timeoutId);

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            console.error('[MessageController - createMessage] Erro de validação Zod:', error.issues);
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        console.error('[MessageController - createMessage] Erro inesperado:', error);
        next(error);
    }
};

// 2. Listar mensagens de um caso específico (GET /messages/cases/:caseId)
export const getMessagesByCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { caseId } = req.params;
        const tenantId = req.user?.tenantId;
        const userId = req.user?.userId; // O advogado que acessa as mensagens

        console.log(`[MessageController - getMessagesByCase] Buscando mensagens para caso ${caseId} para Tenant ID: ${tenantId}, User ID: ${userId}`);

        if (!tenantId || !userId) {
            console.warn('[MessageController - getMessagesByCase] Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        // Verificar se o caso existe e se o usuário é um participante dele
        const caseItem = await prisma.case.findUnique({
            where: {
                id: caseId,
                tenantId,
                participantsUsers: { // Verifica se o usuário é participante
                    some: {
                        userId: userId,
                    },
                },
            },
            // Inclua os clientes participantes para verificar permissões de recebimento
            select: { 
                id: true, 
                clientPrimaryId: true, // Cliente principal do caso
                participantsClients: { select: { clientId: true } } // Outros clientes participantes
            },
        });

        if (!caseItem) {
            console.warn(`[MessageController - getMessagesByCase] Caso ${caseId} não encontrado ou usuário ${userId} não tem permissão para visualizar mensagens.`);
            return res.status(404).json({ message: 'Caso não encontrado ou você não tem permissão para visualizar suas mensagens.' });
        }
        console.log(`[MessageController - getMessagesByCase] Caso ${caseId} verificado para acesso de mensagens.`);

        // IDs de todos os clientes participantes (incluindo o principal se existir)
        const allClientParticipantsIds = new Set(caseItem.participantsClients.map(pc => pc.clientId));
        if (caseItem.clientPrimaryId) {
            allClientParticipantsIds.add(caseItem.clientPrimaryId);
        }

        // Buscar mensagens do caso, onde o sender é o user logado OU o receiverClient é um dos clientes participantes.
        const messages = await prisma.message.findMany({
            where: {
                caseId,
                tenantId,
                OR: [
                    { senderId: userId }, // Mensagens enviadas pelo advogado logado
                    { receiverClientId: { in: Array.from(allClientParticipantsIds) } } // Mensagens recebidas por qualquer cliente participante (e, portanto, visível para o advogado)
                ],
            },
            orderBy: {
                createdAt: 'asc',
            },
            include: { // Usamos 'include' aqui para obter os detalhes do sender e receiverClient
                sender: { select: { id: true, firstName: true, lastName: true, email: true } },
                receiverClient: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        console.log(`[MessageController - getMessagesByCase] Encontradas ${messages.length} mensagens para caso ${caseId}.`);
        res.status(200).json({ messages });

    } catch (error: unknown) {
        console.error('[MessageController - getMessagesByCase] Erro inesperado ao buscar mensagens:', error);
        next(error);
    }
};

// 3. Marcar mensagem como visualizada (PUT /messages/:id/viewed)
export const markMessageAsViewed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params; // ID da mensagem
        const tenantId = req.user?.tenantId;
        const userId = req.user?.userId; // O advogado que tenta marcar como visualizada

        console.log(`[MessageController - markMessageAsViewed] Marcando mensagem ${id} como visualizada por User ID: ${userId} (Tenant: ${tenantId})`);

        if (!tenantId || !userId) {
            console.warn('[MessageController - markMessageAsViewed] Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        // Encontra a mensagem e verifica se ela pertence ao tenant e ao caso
        // E se o usuário logado (advogado) é um participante do caso a que a mensagem pertence
        const message = await prisma.message.findUnique({
            where: {
                id,
                tenantId,
                case: {
                    participantsUsers: { // O advogado deve ser participante do caso da mensagem
                        some: {
                            userId: userId,
                        },
                    },
                },
            },
            select: { 
                id: true, 
                viewed: true, 
                receiverClientId: true, 
                case: { select: { id: true, lawyerPrimaryId: true, clientPrimaryId: true } } // Obter ID do caso e cliente primário/advogado primário
            }
        });

        if (!message) {
            console.warn(`[MessageController - markMessageAsViewed] Mensagem ${id} não encontrada ou usuário ${userId} não tem permissão para marcá-la.`);
            return res.status(404).json({ message: 'Mensagem não encontrada ou você não tem permissão para marcá-la como visualizada.' });
        }
        console.log(`[MessageController - markMessageAsViewed] Mensagem ${id} verificada.`);

        // Lógica de quem pode marcar como visualizada:
        // - O advogado principal do caso
        // - O próprio cliente recebedor da mensagem (se ele tiver login)
        const isLawyerResponsible = message.case.lawyerPrimaryId === userId;
        // const isReceiverClient = message.receiverClientId === userId; // Se o cliente tiver login e o userId for o clientId

        if (!isLawyerResponsible /* && !isReceiverClient */) {
            console.warn(`[MessageController - markMessageAsViewed] Usuário ${userId} tentou marcar mensagem ${id} como visualizada sem permissão.`);
            return res.status(403).json({ message: 'Você não tem permissão para marcar esta mensagem como visualizada.' });
        }

        if (message.viewed) {
            console.log(`[MessageController - markMessageAsViewed] Mensagem ${id} já está marcada como visualizada.`);
            return res.status(200).json({ message: 'Mensagem já está marcada como visualizada.' });
        }

        const updatedMessage = await prisma.message.update({
            where: { id },
            data: {
                viewed: true,
                viewedAt: new Date(),
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                viewed: true,
                viewedAt: true,
            },
        });

        clearNotificationTimeout(message.id);
        console.log(`[MessageController - markMessageAsViewed] Mensagem ${id} marcada como visualizada e timeout cancelado.`);

        res.status(200).json({
            message: 'Mensagem marcada como visualizada!',
            messageData: updatedMessage,
        });

    } catch (error: unknown) {
        console.error('[MessageController - markMessageAsViewed] Erro inesperado ao marcar mensagem como visualizada:', error);
        next(error);
    }
};