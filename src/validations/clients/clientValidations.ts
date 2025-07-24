// src/validations/clientValidations.ts
import { z } from 'zod';

// Schema para criação de um novo cliente
export const createClientSchema = z.object({
    firstName: z.string().min(1, 'Nome é obrigatório.').max(100),
    lastName: z.string().min(1, 'Sobrenome é obrigatório.').max(100),
    email: z.string().email('Email inválido.').max(255).optional(), // Email pode ser opcional se o cliente não tiver
    phoneNumber: z.string().min(5, 'Telefone inválido.').max(20).optional(), // Telefone pode ser opcional
});

// Inferir o tipo TypeScript a partir do schema Zod
export type CreateClientInput = z.infer<typeof createClientSchema>;

// Schema para atualização de um cliente existente
// Partial faz com que todos os campos sejam opcionais
export const updateClientSchema = createClientSchema.partial();

// Inferir o tipo TypeScript a partir do schema Zod
export type UpdateClientInput = z.infer<typeof updateClientSchema>;