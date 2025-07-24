// src/validations/messageValidations.ts
import { z } from 'zod';

// Schema para criação de uma nova mensagem
export const createMessageSchema = z.object({
    content: z.string().min(1, 'A mensagem não pode ser vazia.').max(1000, 'A mensagem é muito longa.'),
    caseId: z.string().uuid('ID do caso inválido.').min(1, 'ID do caso é obrigatório.'),
    receiverClientId: z.string().uuid('ID do cliente recebedor inválido.').min(1, 'ID do cliente recebedor é obrigatório.'),
});

// Inferir o tipo TypeScript a partir do schema Zod
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

// Schema para marcar mensagem como visualizada
export const markMessageAsViewedSchema = z.object({
    // Não há campos no body para esta ação, mas o ID virá da URL.
    // Opcional: Se quiser, pode incluir um campo para confirmar a visualização
    // messageId: z.string().uuid(),
});

// Inferir o tipo TypeScript a partir do schema Zod
export type MarkMessageAsViewedInput = z.infer<typeof markMessageAsViewedSchema>;