// src/socket.ts
import { Server, Socket } from 'socket.io';
import { authenticateSocket } from './middlewares/socketAuthMiddleware';
// Importe CaseStatus para tipagem se necessário, mas não é usado diretamente nas queries aqui
import { PrismaClient, CaseStatus } from '@prisma/client'; 
import { sendEmail } from './services/messages/emailService';
import { JwtPayload } from './utils/jwt';

const prisma = new PrismaClient();

const connectedUsers = new Map<string, string>(); // userId -> socket.id
const userSockets = new Map<string, Socket>(); // userId -> Socket object

const messageNotificationTimeouts = new Map<string, NodeJS.Timeout>();

const clearNotificationTimeout = (messageId: string) => {
    const timeout = messageNotificationTimeouts.get(messageId);
    if (timeout) {
        clearTimeout(timeout);
        messageNotificationTimeouts.delete(messageId);
        console.log(`[Socket.IO] Timeout de notificação para a mensagem ${messageId} cancelado.`);
    }
};

interface AuthenticatedSocket extends Socket {
    user?: JwtPayload;
}

export const setupSocketIO = (io: Server) => {
    io.use((socket: Socket, next) => authenticateSocket(socket as AuthenticatedSocket, next));

    io.on('connection', async (socket: AuthenticatedSocket) => {
        // console.log("Socket user object: ", socket.user); // Mantenha para depuração
        const userId = socket.user?.id; // ID do usuário logado (advogado)
        const tenantId = socket.user?.tenantId;

        if (!userId || !tenantId) {
            console.log(`[Socket.IO] userId: ${userId}, tenantId: ${tenantId}`);
            console.error('[Socket.IO] Conexão WebSocket não autenticada rejeitada: userId ou tenantId ausente.');
            socket.disconnect(true);
            return;
        }

        console.log(`[Socket.IO] Usuário ${userId} (${tenantId}) conectado com socket ID: ${socket.id}`);

        connectedUsers.set(userId, socket.id);
        userSockets.set(userId, socket);

        socket.join(tenantId);

        // --- Eventos de Mensagem ---
        // 'sendMessage' é emitido pelo frontend quando um advogado envia uma mensagem
        socket.on('sendMessage', async ({ content, caseId, receiverClientId }: { content: string, caseId: string, receiverClientId: string }) => {
            try {
                // 1. Validar e verificar permissões do caso
                // O advogado (senderId) deve ser um participante do caso
                const caseItem = await prisma.case.findUnique({
                    where: {
                        id: caseId,
                        tenantId,
                        participantsUsers: {
                            some: { userId: userId }, // Advogado é participante
                        },
                    },
                    // Incluir cliente principal e participantes clientes para validação do recebedor
                    select: {
                        id: true,
                        title: true, // Para o e-mail
                        clientPrimaryId: true, // Cliente principal do caso
                        lawyerPrimaryId: true, // Advogado principal
                        participantsClients: { // Outros clientes participantes do caso
                            where: { clientId: receiverClientId }, // Verifica se o recebedor é um participante
                            select: { clientId: true, client: { select: { email: true, firstName: true, lastName: true } } }
                        },
                    },
                });

                if (!caseItem) {
                    console.error(`[Socket.IO] Erro de permissão: Usuário ${userId} tentou enviar mensagem para caso ${caseId} (cliente ${receiverClientId}) sem permissão.`);
                    socket.emit('messageError', 'Não autorizado a enviar mensagem para este caso/cliente.');
                    return;
                }

                // 2. Verificar se o receiverClientId é um cliente válido para este caso
                const isReceiverClientPrimary = caseItem.clientPrimaryId === receiverClientId;
                const isReceiverClientParticipant = caseItem.participantsClients.some(pc => pc.clientId === receiverClientId);

                if (!isReceiverClientPrimary && !isReceiverClientParticipant) {
                    console.error(`[Socket.IO] Cliente recebedor ${receiverClientId} não é participante principal ou secundário do caso ${caseId}.`);
                    socket.emit('messageError', 'Cliente recebedor não está associado a este caso.');
                    return;
                }

                // Obter detalhes do cliente recebedor para o e-mail
                const receiverClientDetails = caseItem.participantsClients.find(pc => pc.clientId === receiverClientId)?.client;
                // Se o cliente principal for o recebedor e não estiver em participantsClients (caso não tenha outros clientes)
                if (!receiverClientDetails && isReceiverClientPrimary && caseItem.clientPrimaryId) {
                    // Buscar diretamente se for o primary e não foi encontrado nos participants
                    const primaryClient = await prisma.client.findUnique({ where: { id: caseItem.clientPrimaryId }, select: { email: true, firstName: true, lastName: true } });
                    if (primaryClient) {
                         // Adaptação para o email, se necessário
                    }
                }

                if (!receiverClientDetails && !isReceiverClientPrimary) { // Não encontrado e não é o principal
                    console.error(`[Socket.IO] Detalhes do cliente recebedor ${receiverClientId} não encontrados para envio de email.`);
                    socket.emit('messageError', 'Detalhes do cliente recebedor não encontrados.');
                    return;
                }

                // 3. Salvar a mensagem no banco de dados
                const newMessage = await prisma.message.create({
                    data: {
                        content,
                        caseId,
                        senderId: userId, // Remetente é o advogado logado
                        receiverClientId,
                        tenantId,
                        viewed: false,
                    },
                    include: {
                        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
                        receiverClient: { select: { id: true, firstName: true, lastName: true, email: true } },
                    },
                });
                console.log(`[Socket.IO] Mensagem ${newMessage.id} salva no DB.`);

                // 4. Emitir a mensagem em tempo real para os clientes conectados
                // Emitir para o próprio remetente (advogado)
                socket.emit('newMessage', newMessage);
                console.log(`[Socket.IO] Mensagem ${newMessage.id} emitida para remetente ${userId}.`);

                // Emitir para o cliente recebedor se ele estiver online (via socket de cliente, se houver)
                const clientSocketId = connectedUsers.get(receiverClientId); // Supondo que 'connectedUsers' também rastreia clientes
                if (clientSocketId && userSockets.has(receiverClientId)) {
                    userSockets.get(receiverClientId)?.emit('newMessage', newMessage);
                    console.log(`[Socket.IO] Mensagem ${newMessage.id} emitida para cliente online ${receiverClientId}.`);
                } else {
                    // Se o cliente estiver offline, agenda a notificação por e-mail
                    console.log(`[Socket.IO] Cliente ${receiverClientId} offline. Agendando notificação por email para mensagem ${newMessage.id}...`);
                    const notificationDelay = 5 * 60 * 1000;

                    const timeoutId = setTimeout(async () => {
                        const messageStatus = await prisma.message.findUnique({
                            where: { id: newMessage.id },
                            select: { viewed: true },
                        });

                        // Busque os detalhes do cliente novamente para o e-mail, caso não estejam completos
                        const emailReceiverClient = await prisma.client.findUnique({
                            where: { id: receiverClientId },
                            select: { email: true, firstName: true }
                        });

                        if (messageStatus && !messageStatus.viewed && emailReceiverClient?.email) {
                            const subject = `Nova mensagem no seu caso "${caseItem.title}" no Nexu Communication`;
                            const text = `Olá ${emailReceiverClient.firstName},\n\nVocê tem uma nova mensagem não visualizada no caso "${caseItem.title}".\n\nConteúdo: "${newMessage.content}"\n\nAcesse o Nexu Communication para visualizar: [Link para o seu frontend]\n\nAtenciosamente,\nSua equipe Nexu Communication.`;
                            const html = `
                                <p>Olá <strong>${emailReceiverClient.firstName}</strong>,</p>
                                <p>Você tem uma nova mensagem não visualizada no caso <strong>"${caseItem.title}"</strong>.</p>
                                <p><strong>Conteúdo:</strong> "${newMessage.content}"</p>
                                <p>Acesse o Nexu Communication para visualizar: <a href="[Link para o seu frontend]">Clique aqui</a></p>
                                <p>Atenciosamente,<br/>Sua equipe Nexu Communication.</p>
                            `;
                            await sendEmail(emailReceiverClient.email, subject, text, html);
                            console.log(`[Socket.IO] E-mail de notificação enviado para ${emailReceiverClient.email} sobre mensagem ${newMessage.id}.`);
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

        // 'markMessageViewed' é emitido pelo frontend quando uma mensagem é visualizada
        socket.on('markMessageViewed', async (messageId: string) => {
            try {
                // Verificar se a mensagem existe e se o usuário logado tem permissão para marcá-la como visualizada
                // (advogado participante do caso OU cliente recebedor)
                const message = await prisma.message.findUnique({
                    where: {
                        id: messageId,
                        tenantId,
                        case: {
                            participantsUsers: { // O advogado deve ser participante do caso da mensagem
                                some: { userId: userId },
                            },
                        },
                    },
                    select: {
                        id: true,
                        viewed: true,
                        receiverClientId: true,
                        case: { // Incluir case para acessar lawyerPrimaryId/clientPrimaryId
                            select: { id: true, lawyerPrimaryId: true, clientPrimaryId: true }
                        }
                    }
                });

                if (!message || message.viewed) {
                    return; // Já visualizada ou não encontrada/permissão negada
                }

                // Lógica de quem pode marcar como visualizada:
                // - O advogado principal do caso da mensagem
                // - O próprio cliente recebedor da mensagem (se ele tiver login e seu userId for o clientId)
                const isLawyerResponsible = message.case.lawyerPrimaryId === userId; // lawyerId foi removido do Case, use lawyerPrimaryId
                const isClientReceiver = message.receiverClientId === userId; // Se o userId logado for o clientId da mensagem

                if (!isLawyerResponsible && !isClientReceiver) {
                    console.warn(`[Socket.IO] Usuário ${userId} tentou marcar mensagem ${messageId} como visualizada sem permissão.`);
                    return;
                }

                await prisma.message.update({
                    where: { id: messageId },
                    data: { viewed: true, viewedAt: new Date() },
                });
                console.log(`[Socket.IO] Mensagem ${messageId} marcada como visualizada no DB.`);

                clearNotificationTimeout(messageId); // Cancela o timeout de notificação

                // Notificar os outros participantes do chat que a mensagem foi visualizada
                const caseParticipants = await prisma.caseParticipantUser.findMany({
                    where: { caseId: message.case.id },
                    select: { userId: true }
                });
                const caseClientParticipants = await prisma.caseParticipantClient.findMany({
                    where: { caseId: message.case.id },
                    select: { clientId: true }
                });

                const allParticipantUserIds = new Set(caseParticipants.map(p => p.userId));
                // Se o cliente principal não estiver nas tabelas de junção M:N, adicione-o
                if (message.case.lawyerPrimaryId) allParticipantUserIds.add(message.case.lawyerPrimaryId);
                if (message.case.clientPrimaryId) allParticipantUserIds.add(message.case.clientPrimaryId);


                allParticipantUserIds.forEach(participantId => {
                    const participantSocketId = connectedUsers.get(participantId);
                    if (participantSocketId && userSockets.has(participantId)) {
                        userSockets.get(participantId)?.emit('messageViewed', messageId);
                        console.log(`[Socket.IO] Emitido 'messageViewed' para participante ${participantId} do caso ${message.case.id}`);
                    }
                });

            } catch (error) {
                console.error('[Socket.IO] Erro ao marcar mensagem como visualizada:', error);
            }
        });

        // Evento de desconexão
        socket.on('disconnect', () => {
            console.log(`[Socket.IO] Usuário ${userId} (${tenantId}) desconectado. Socket ID: ${socket.id}`);
            connectedUsers.delete(userId);
            userSockets.delete(userId);
            socket.leave(tenantId);
        });
    });
};