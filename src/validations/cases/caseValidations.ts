// src/validations/caseValidations.ts
import { z } from 'zod';
import { CaseStatus } from '@prisma/client'; // Importe o Enum do Prisma Client

const validCaseStatuses = Object.values(CaseStatus) as [CaseStatus, ...CaseStatus[]];

export const createCaseSchema = z.object({
    title: z.string().min(1, 'Título é obrigatório.').max(255),
    description: z.string().max(1000).optional(),
    status: z.enum(validCaseStatuses),
    clientId: z.string().uuid('ID do cliente inválido.').min(1, 'ID do cliente é obrigatório.'),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
    title: z.string().min(1, 'Título é obrigatório.').max(255).optional(),
    description: z.string().max(1000).optional(),
    status: z.enum(validCaseStatuses).optional(),
});

export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;