// src/middlewares/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod'; // Importa ZodError para tratar erros de validação Zod
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Importa erros conhecidos do Prisma

// Interface para um erro HTTP customizado, se você quiser criar um futuramente
// class HttpError extends Error {
//     statusCode: number;
//     constructor(message: string, statusCode: number) {
//         super(message);
//         this.statusCode = statusCode;
//     }
// }

export const errorHandler = (
    err: Error, // O erro capturado
    req: Request,
    res: Response,
    next: NextFunction // É importante ter o next aqui, mesmo que não seja usado diretamente no final
) => {
    // Log do erro para depuração (em produção, use um logger mais robusto como Winston ou Pino)
    console.error('Erro Capturado:', err);

    let statusCode = 500; // Padrão: Erro interno do servidor
    let message = 'Ocorreu um erro interno no servidor.';
    let errors: any[] | undefined = undefined; // Para erros de validação, etc.

    // Tratamento de erros de validação Zod
    if (err instanceof ZodError) {
        statusCode = 400; // Bad Request
        message = 'Erro de validação nos dados fornecidos.';
        errors = err.issues.map(error => ({
            path: error.path.join('.'),
            message: error.message
        }));
    }
    // Tratamento de erros conhecidos do Prisma (ex: registro duplicado, ID não encontrado)
    else if (err instanceof PrismaClientKnownRequestError) {
        // Exemplo de tratamento para código de erro P2002 (violação de restrição única)
        if (err.code === 'P2002') {
            statusCode = 409; // Conflict
            message = 'Dados duplicados. Já existe um registro com este valor.';
            // Pode extrair campos específicos do erro para dar mais detalhes
            if (err.meta && typeof err.meta.target === 'object' && Array.isArray(err.meta.target)) {
                message = `Este ${err.meta.target.join(', ')} já está em uso.`;
            }
        }
        // Outros erros do Prisma podem ser tratados aqui
        else if (err.code === 'P2025') { // Por exemplo, registro não encontrado para update/delete
            statusCode = 404; // Not Found
            message = 'Recurso não encontrado.';
        }
        else {
            statusCode = 400; // Erro padrão para outros erros do Prisma que podem ser de cliente
            message = `Erro de banco de dados: ${err.message.split('\n')[0]}`; // Pega a primeira linha da mensagem
        }
    }
    // Tratamento de erros customizados (se você implementar a classe HttpError)
    // else if (err instanceof HttpError) {
    //     statusCode = err.statusCode;
    //     message = err.message;
    // }
    // Erros gerais (catch-all)
    else if (err instanceof Error) {
        // Você pode ter erros que você lança com uma mensagem específica
        statusCode = 400; // Por exemplo, um erro de regra de negócio customizado
        message = err.message || message;
    }


    // Envia a resposta de erro padronizada
    res.status(statusCode).json({
        status: 'error',
        message,
        ...(errors && { errors }) // Adiciona 'errors' apenas se ele existir
    });
};