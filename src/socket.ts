// src/socket.ts
import { Server, Socket } from 'socket.io';
import { authenticateSocket } from './middlewares/socketAuthMiddleware';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from './services/messages/emailService';
import { JwtPayload } from './utils/jwt'; // <<< NOVO: Importe JwtPayload aqui

const prisma = new PrismaClient();

const connectedUsers = new Map<string, string>();
const userSockets = new Map<string, Socket>();

const messageNotificationTimeouts = new Map<string, NodeJS.Timeout>();

const clearNotificationTimeout = (messageId: string) => {
    const timeout = messageNotificationTimeouts.get(messageId);
    if (timeout) {
        clearTimeout(timeout);
        messageNotificationTimeouts.delete(messageId);
        console.log(`[Socket.IO] Timeout de notificação para a mensagem ${messageId} cancelado.`);
    }
};

// >>> CORREÇÃO AQUI: Use JwtPayload diretamente <<<
interface AuthenticatedSocket extends Socket {
    user?: JwtPayload; // Agora o tipo 'user' é JwtPayload
}

export const setupSocketIO = (io: Server) => {
    // Aplica o middleware de autenticação a todas as conexões WebSocket
    io.use((socket: Socket, next) => authenticateSocket(socket as AuthenticatedSocket, next));

    io.on('connection', async (socket: AuthenticatedSocket) => {
        // Altere aqui de 'id' para 'userId' para consistência com JwtPayload
        const userId = socket.user?.userId;
        const tenantId = socket.user?.tenantId;

        if (!userId || !tenantId) {
            console.error('[Socket.IO] Conexão WebSocket não autenticada rejeitada.');
            socket.disconnect(true);
            return;
        }

        console.log(`[Socket.IO] Usuário ${userId} (${tenantId}) conectado com socket ID: ${socket.id}`);

        connectedUsers.set(userId, socket.id);
        userSockets.set(userId, socket);

        socket.join(tenantId);

        // --- Eventos de Mensagem ---
        socket.on('sendMessage', async ({ content, caseId, receiverClientId }: { content: string, caseId: string, receiverClientId: string }) => {
            try {
                const caseItem = await prisma.case.findUnique({
                    where: { id: caseId, tenantId, lawyerId: userId },
                    select: { id: true, clientId: true },
                });

                if (!caseItem || caseItem.clientId !== receiverClientId) {
                    console.error(`[Socket.IO] Erro de permissão: Usuário ${userId} tentou enviar mensagem para caso ${caseId} (cliente ${receiverClientId}) sem permissão.`);
                    socket.emit('messageError', 'Não autorizado a enviar mensagem para este caso/cliente.');
                    return;
                }

                const receiverClient = await prisma.client.findUnique({
                    where: { id: receiverClientId, tenantId },
                    select: { id: true, email: true, firstName: true, lastName: true },
                });

                if (!receiverClient) {
                    console.error(`[Socket.IO] Cliente recebedor ${receiverClientId} não encontrado para o tenant ${tenantId}.`);
                    socket.emit('messageError', 'Cliente recebedor não encontrado.');
                    return;
                }

                const newMessage = await prisma.message.create({
                    data: {
                        content,
                        caseId,
                        senderId: userId,
                        receiverClientId,
                        tenantId,
                        viewed: false,
                    },
                    include: {
                        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
                        receiverClient: { select: { id: true, firstName: true, lastName: true, email: true } },
                    },
                });

                socket.emit('newMessage', newMessage);
                console.log(`[Socket.IO] Mensagem ${newMessage.id} emitida para remetente ${userId}.`);

                const clientSocketId = connectedUsers.get(receiverClientId);

                if (clientSocketId && userSockets.has(receiverClientId)) {
                    userSockets.get(receiverClientId)?.emit('newMessage', newMessage);
                    console.log(`[Socket.IO] Mensagem ${newMessage.id} emitida para cliente online ${receiverClientId}.`);
                } else {
                    console.log(`[Socket.IO] Cliente ${receiverClientId} offline. Agendando notificação por email para mensagem ${newMessage.id}...`);
                    const notificationDelay = 5 * 60 * 1000;

                    const timeoutId = setTimeout(async () => {
                        const messageStatus = await prisma.message.findUnique({
                            where: { id: newMessage.id },
                            select: { viewed: true },
                        });

                        if (messageStatus && !messageStatus.viewed && receiverClient.email) {
                            const subject = `Nova mensagem no seu caso ${caseItem.id} no Nexu Communication`;
                            const text = `Olá ${receiverClient.firstName},\n\nVocê tem uma nova mensagem não visualizada no caso ${caseItem.id}.\n\nConteúdo: "${newMessage.content}"\n\nAcesse o Nexu Communication para visualizar: [Link para o seu frontend]\n\nAtenciosamente,\nSua equipe Nexu Communication.`;
                            const html = `
                                <p>Olá <strong>${receiverClient.firstName}</strong>,</p>
                                <p>Você tem uma nova mensagem não visualizada no caso <strong>${caseItem.id}</strong>.</p>
                                <p><strong>Conteúdo:</strong> "${newMessage.content}"</p>
                                <p>Acesse o Nexu Communication para visualizar: <a href="[Link para o seu frontend]">Clique aqui</a></p>
                                <p>Atenciosamente,<br/>Sua equipe Nexu Communication.</p>
                            `;
                            await sendEmail(receiverClient.email, subject, text, html);
                            console.log(`[Socket.IO] E-mail de notificação enviado para ${receiverClient.email} sobre mensagem ${newMessage.id}.`);
                        }
                        messageNotificationTimeouts.delete(newMessage.id);
                    }, notificationDelay);

                    messageNotificationTimeouts.set(newMessage.id, timeoutId);
                }

            } catch (error) {
                console.error('[Socket.IO] Erro ao enviar mensagem:', error);
                socket.emit('messageError', 'Erro ao enviar mensagem.');
            }
        });

        socket.on('markMessageViewed', async (messageId: string) => {
            try {
                const message = await prisma.message.findUnique({
                    where: { id: messageId, tenantId },
                    select: { id: true, viewed: true, receiverClientId: true, case: { select: { lawyerId: true } } }
                });

                if (!message || message.viewed) {
                    return;
                }

                // Ajuste para usar userId
                const isLawyerResponsible = socket.user?.userId === message.case.lawyerId;

                if (!isLawyerResponsible) {
                    console.warn(`[Socket.IO] Usuário ${userId} tentou marcar mensagem ${messageId} como visualizada sem permissão.`);
                    return;
                }

                await prisma.message.update({
                    where: { id: messageId },
                    data: { viewed: true, viewedAt: new Date() },
                });

                clearNotificationTimeout(messageId);

                // Ajuste para usar userId
                const lawyerSocketId = connectedUsers.get(message.case.lawyerId);
                const clientSocketId = connectedUsers.get(message.receiverClientId);

                if (lawyerSocketId && userSockets.has(message.case.lawyerId)) {
                    userSockets.get(message.case.lawyerId)?.emit('messageViewed', messageId);
                }
                if (clientSocketId && userSockets.has(message.receiverClientId)) {
                    userSockets.get(message.receiverClientId)?.emit('messageViewed', messageId);
                }

                console.log(`[Socket.IO] Mensagem ${messageId} marcada como visualizada por ${userId}.`);

            } catch (error) {
                console.error('[Socket.IO] Erro ao marcar mensagem como visualizada:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket.IO] Usuário ${userId} (${tenantId}) desconectado. Socket ID: ${socket.id}`);
            connectedUsers.delete(userId);
            userSockets.delete(userId);
            socket.leave(tenantId);
        });
    });
};