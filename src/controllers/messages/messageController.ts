// src/controllers/messages/messageController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { createMessageSchema } from '../../validations/messages/messageValidations';
import { sendEmail } from '../../services/messages/emailService';
import { AuthenticatedRequest } from '../auth/authController';

const prisma = new PrismaClient();
const messageNotificationTimeouts = new Map<string, NodeJS.Timeout>();

const clearNotificationTimeout = (messageId: string) => {
  const timeout = messageNotificationTimeouts.get(messageId);
  if (timeout) {
    clearTimeout(timeout);
    messageNotificationTimeouts.delete(messageId);
    console.log(`[MessageController] Timeout de notificação para a mensagem ${messageId} cancelado.`);
  }
};

export const createMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { content, caseId, receiverClientId } = createMessageSchema.parse(req.body);
    const tenantId = req.user?.tenantId;
    const senderId = req.user?.userId;

    if (!tenantId || !senderId) {
      return res.status(401).json({ message: 'Usuário não autenticado ou token inválido.' });
    }

    const caseItem = await prisma.case.findUnique({
      where: { id: caseId, tenantId },
      select: {
        id: true,
        title: true,
        clientPrimaryId: true,
        participantsUsers: { select: { userId: true } },
        participantsClients: {
          where: { clientId: receiverClientId },
          select: { clientId: true, client: { select: { email: true, firstName: true, lastName: true } } }
        }
      },
    });

    const isLawyerParticipant = caseItem?.participantsUsers.some(p => p.userId === senderId);
    const isReceiverClientParticipant = caseItem?.participantsClients.some(p => p.clientId === receiverClientId);
    const isReceiverClientPrimary = caseItem?.clientPrimaryId === receiverClientId;

    if (!caseItem || !isLawyerParticipant || (!isReceiverClientParticipant && !isReceiverClientPrimary)) {
      return res.status(403).json({ message: 'Você não tem permissão para enviar mensagens neste caso.' });
    }

    const receiverClientDetails = caseItem.participantsClients[0]?.client || (isReceiverClientPrimary
      ? await prisma.client.findUnique({ where: { id: receiverClientId }, select: { email: true, firstName: true, lastName: true } })
      : null);

    const newMessage = await prisma.message.create({
      data: {
        content,
        caseId,
        senderId,
        receiverClientId,
        tenantId,
        viewed: false,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
        receiverClient: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.status(201).json({ message: 'Mensagem enviada com sucesso!', messageData: newMessage });

    const timeoutId = setTimeout(async () => {
      const status = await prisma.message.findUnique({ where: { id: newMessage.id }, select: { viewed: true } });
      if (status && !status.viewed && receiverClientDetails?.email) {
        await sendEmail(
          receiverClientDetails.email,
          `Nova mensagem no caso "${caseItem.title}"`,
          `Olá ${receiverClientDetails.firstName},\n\nVocê tem uma nova mensagem: \"${newMessage.content}\"`,
          `<p>Olá ${receiverClientDetails.firstName},</p><p>Nova mensagem: <strong>${newMessage.content}</strong></p>`
        );
      }
      messageNotificationTimeouts.delete(newMessage.id);
    }, 5 * 60 * 1000);

    messageNotificationTimeouts.set(newMessage.id, timeoutId);

  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
    }
    next(error);
  }
};

export const getMessagesByCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { caseId } = req.params;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    if (!tenantId || !userId) return res.status(401).json({ message: 'Usuário não autenticado.' });

    const client = await prisma.client.findFirst({ where: { userId, tenantId }, select: { id: true } });

    const caseItem = await prisma.case.findUnique({
      where: { id: caseId, tenantId },
      select: {
        clientPrimaryId: true,
        participantsUsers: { select: { userId: true } },
        participantsClients: { select: { clientId: true } },
      },
    });

    if (!caseItem) return res.status(404).json({ message: 'Caso não encontrado.' });

    const isLawyer = caseItem.participantsUsers.some(p => p.userId === userId);
    const isClient = client && (caseItem.clientPrimaryId === client.id || caseItem.participantsClients.some(p => p.clientId === client.id));

    if (!isLawyer && !isClient) return res.status(403).json({ message: 'Acesso negado às mensagens.' });

    const allClients = new Set(caseItem.participantsClients.map(p => p.clientId));
    if (caseItem.clientPrimaryId) allClients.add(caseItem.clientPrimaryId);

    const messages = await prisma.message.findMany({
      where: {
        caseId,
        tenantId,
        OR: [
          { senderId: userId },
          client ? { receiverClientId: client.id } : { receiverClientId: { in: Array.from(allClients) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
        receiverClient: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.status(200).json({ messages });
  } catch (error: unknown) {
    next(error);
  }
};

export const markMessageAsViewed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    if (!tenantId || !userId) return res.status(401).json({ message: 'Usuário não autenticado.' });

    const client = await prisma.client.findFirst({ where: { userId, tenantId }, select: { id: true } });

    const message = await prisma.message.findUnique({
      where: { id },
      select: {
        id: true,
        viewed: true,
        receiverClientId: true,
        caseId: true,
        case: {
          select: {
            lawyerPrimaryId: true,
            clientPrimaryId: true,
            participantsClients: { select: { clientId: true } },
          },
        },
      },
    });

    if (!message || message.caseId === undefined) return res.status(404).json({ message: 'Mensagem não encontrada.' });

    const isLawyer = message.case.lawyerPrimaryId === userId;
    const isClient = client && (message.case.clientPrimaryId === client.id || message.case.participantsClients.some(p => p.clientId === client.id));

    if (!isLawyer && !isClient) return res.status(403).json({ message: 'Você não tem permissão para marcar esta mensagem como visualizada.' });

    if (message.viewed) return res.status(200).json({ message: 'Mensagem já visualizada.' });

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: { viewed: true, viewedAt: new Date() },
      select: { id: true, content: true, createdAt: true, viewed: true, viewedAt: true },
    });

    clearNotificationTimeout(message.id);
    res.status(200).json({ message: 'Mensagem marcada como visualizada!', messageData: updatedMessage });

  } catch (error: unknown) {
    next(error);
  }
};
