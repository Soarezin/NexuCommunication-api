// src/validations/caseValidations.ts
import { z } from 'zod';

// Lista de status válidos para um caso
const validCaseStatuses = [
    "Open",
    "In Progress",
    "Closed",
    "Pending",
    "On Hold"
] as const; // 'as const' para que o TS trate como um array de strings literais

// Schema para criação de um novo caso
export const createCaseSchema = z.object({
    title: z.string().min(1, 'Título é obrigatório.').max(255),
    description: z.string().max(1000).optional(),
    // Status deve ser um dos valores predefinidos
    // >>> CORREÇÃO AQUI para z.enum e errorMap <<<
    status: z.enum(validCaseStatuses).refine(
        (val) => validCaseStatuses.includes(val),
        { message: `Status inválido. Deve ser um de: ${validCaseStatuses.join(', ')}` }
    ),
    clientId: z.string().uuid('ID do cliente inválido.').min(1, 'ID do cliente é obrigatório.'), // O caso precisa estar ligado a um cliente
});

// Inferir o tipo TypeScript a partir do schema Zod
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

// Schema para atualização de um caso existente
export const updateCaseSchema = z.object({
    title: z.string().min(1, 'Título é obrigatório.').max(255).optional(),
    description: z.string().max(1000).optional(),
    // >>> CORREÇÃO AQUI para z.enum e errorMap <<<
    status: z.enum(validCaseStatuses).refine(
        (val) => validCaseStatuses.includes(val),
        { message: `Status inválido. Deve ser um de: ${validCaseStatuses.join(', ')}` }
    ).optional(),
    // O clientId não deve ser alterado após a criação, mas você pode decidir se isso faz sentido para seu negócio.
    // Se permitir, adicione: clientId: z.string().uuid('ID do cliente inválido.').min(1, 'ID do cliente é obrigatório.').optional(),
});
// .partial(); // REMOVIDO: partial() não é aplicado no final do z.object quando você já torna campos individuais opcionais

// Inferir o tipo TypeScript a partir do schema Zod
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;