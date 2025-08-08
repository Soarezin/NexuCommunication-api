// src/socket.ts
import { Server, Socket } from "socket.io";
import { authenticateSocket } from "./middlewares/socketAuthMiddleware";
import { PrismaClient } from "@prisma/client";
import { sendEmail } from "./services/messages/emailService";
import { JwtPayload } from "./utils/jwt";

const prisma = new PrismaClient();

const connectedUsers = new Map<string, string>();
const userSockets = new Map<string, Socket>();
const messageNotificationTimeouts = new Map<string, NodeJS.Timeout>();

const clearNotificationTimeout = (messageId: string) => {
  const timeout = messageNotificationTimeouts.get(messageId);
  if (timeout) {
    clearTimeout(timeout);
    messageNotificationTimeouts.delete(messageId);
  }
};

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

export const setupSocketIO = (io: Server) => {
  io.use((socket: Socket, next) =>
    authenticateSocket(socket as AuthenticatedSocket, next)
  );

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const userId = socket.user?.userId;
    const tenantId = socket.user?.tenantId;
    const userRole = socket.user?.role;

    if (!userId || !tenantId) return socket.disconnect(true);

    socket.on("joinCase", (caseId: string) => {
      if (!caseId) {
        console.warn(
          `${socket.user?.userId} tentou entrar numa sala com caseId inválido`
        );
        return;
      }

      console.log(`${socket.user?.userId} entrou na sala do caso ${caseId}`);
      socket.join(caseId);
    });

    connectedUsers.set(userId, socket.id);
    userSockets.set(userId, socket);
    socket.join(tenantId);

    socket.on("sendMessage", async ({ content, caseId, receiverClientId }) => {
      try {
        let clientId: string | undefined = undefined;
        let caseItem = null;

        if (userRole === "Lawyer" || userRole === "Admin") {
          caseItem = await prisma.case.findFirst({
            where: {
              id: caseId,
              tenantId,
              OR: [
                { lawyerPrimaryId: userId },
                {
                  participantsUsers: {
                    some: {
                      userId: userId,
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              title: true,
              clientPrimaryId: true,
              lawyerPrimaryId: true,
              participantsUsers: {
                select: {
                  userId: true,
                },
              },
              participantsClients: {
                select: {
                  clientId: true,
                  client: {
                    select: {
                      email: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          });
        } else if (userRole === "Client") {
          const client = await prisma.client.findUnique({
            where: { userId },
            select: { id: true },
          });

          if (!client)
            return socket.emit("messageError", "Cliente não encontrado.");

          clientId = client.id;

          caseItem = await prisma.case.findFirst({
            where: {
              id: caseId,
              tenantId,
              OR: [
                { clientPrimaryId: clientId },
                { participantsClients: { some: { clientId } } },
              ],
              participantsClients: { some: { clientId: receiverClientId } },
            },
            select: {
              id: true,
              title: true,
              clientPrimaryId: true,
              lawyerPrimaryId: true,
              participantsUsers: { select: { userId: true } },
              participantsClients: {
                select: {
                  clientId: true,
                  client: {
                    select: { email: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          });
        }

        console.log(caseItem);

        if (!caseItem) {
          return socket.emit(
            "messageError",
            "Não autorizado a enviar mensagem para este caso."
          );
        }

        if (userRole === "Client" && clientId) {
          const isSenderClientPrimary = caseItem.clientPrimaryId === clientId;
          const isSenderClientParticipant = caseItem.participantsClients.some(
            (p) => p.clientId === clientId
          );

          if (!isSenderClientPrimary && !isSenderClientParticipant) {
            return socket.emit(
              "messageError",
              "Você não tem permissão para enviar mensagens neste caso."
            );
          }
        }

        const isReceiverClientValid =
          caseItem.clientPrimaryId === receiverClientId ||
          caseItem.participantsClients.some(
            (p) => p.clientId === receiverClientId
          );

        if (!isReceiverClientValid) {
          return socket.emit(
            "messageError",
            "Cliente recebedor não está associado a este caso."
          );
        }

        const newMessage = await prisma.message.create({
          data: {
            content,
            caseId,
            tenantId,
            viewed: false,
            receiverClientId,
            senderId: userId,
            ...(userRole === "Client"
              ? { senderClientId: clientId }
              : { senderId: userId }),
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            receiverClient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });

        // Envia a nova mensagem para todos os sockets conectados à sala do caso
        io.to(caseId).emit("newMessage", newMessage);

        // Aguarda 5 minutos para notificar por e-mail, se não for visualizada
        const timeoutId = setTimeout(async () => {
          try {
            const messageStatus = await prisma.message.findUnique({
              where: { id: newMessage.id },
              select: { viewed: true },
            });

            const emailReceiverClient = await prisma.client.findUnique({
              where: { id: receiverClientId },
              select: { email: true, firstName: true },
            });

            if (
              messageStatus &&
              !messageStatus.viewed &&
              emailReceiverClient?.email
            ) {
              const subject = `Nova mensagem no caso "${caseItem.title}"`;
              const text = `Olá ${emailReceiverClient.firstName}, nova mensagem: \"${newMessage.content}\"`;
              const html = `<p>Olá <strong>${emailReceiverClient.firstName}</strong>, nova mensagem: <em>${newMessage.content}</em></p>`;
              await sendEmail(emailReceiverClient.email, subject, text, html);
            }
          } catch (err) {
            console.error("Erro ao tentar enviar notificação por e-mail:", err);
          }
        }, 5 * 60 * 1000); // 5 minutos

        messageNotificationTimeouts.set(newMessage.id, timeoutId);
      } catch (error) {
        console.error("[Socket.IO] Erro ao enviar mensagem:", error);
        socket.emit("messageError", "Erro ao enviar mensagem.");
      }
    });

    socket.on("markMessageViewed", async (messageId: string) => {
      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            id: true,
            viewed: true,
            receiverClientId: true,
            case: {
              select: {
                id: true,
                lawyerPrimaryId: true,
                clientPrimaryId: true,
              },
            },
          },
        });
        if (!message || message.viewed) return;

        const isLawyerResponsible = message.case.lawyerPrimaryId === userId;
        const isClientReceiver = message.receiverClientId === userId;
        if (!isLawyerResponsible && !isClientReceiver) return;

        await prisma.message.update({
          where: { id: messageId },
          data: { viewed: true, viewedAt: new Date() },
        });

        clearNotificationTimeout(messageId);

        const caseParticipants = await prisma.caseParticipantUser.findMany({
          where: { caseId: message.case.id },
          select: { userId: true },
        });

        const allParticipantUserIds = new Set(
          caseParticipants.map((p) => p.userId)
        );
        if (message.case.lawyerPrimaryId)
          allParticipantUserIds.add(message.case.lawyerPrimaryId);
        if (message.case.clientPrimaryId)
          allParticipantUserIds.add(message.case.clientPrimaryId);

        allParticipantUserIds.forEach((participantId) => {
          const participantSocketId = connectedUsers.get(participantId);
          if (participantSocketId && userSockets.has(participantId)) {
            userSockets.get(participantId)?.emit("messageViewed", messageId);
          }
        });
      } catch (error) {
        console.error(
          "[Socket.IO] Erro ao marcar mensagem como visualizada:",
          error
        );
      }
    });

    socket.on("disconnect", () => {
      connectedUsers.delete(userId);
      userSockets.delete(userId);
      socket.leave(tenantId);
    });
  });
};
