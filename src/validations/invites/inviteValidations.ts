// src/validations/invites/inviteValidations.ts
import { z } from 'zod';

export const inviteClientSchema = z.object({
    email: z.string().email('Email inválido.').max(255),
});

export type InviteClientInput = z.infer<typeof inviteClientSchema>;


export const registerViaInviteSchema = z.object({
    token: z.string().uuid('Token de convite inválido (formato UUID esperado).'), // Assumindo UUID v4 para o token
    firstName: z.string().min(1, 'Nome é obrigatório.').max(100),
    lastName: z.string().min(1, 'Sobrenome é obrigatório.').max(100),
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.').max(255),
});

export type RegisterViaInviteInput = z.infer<typeof registerViaInviteSchema>;