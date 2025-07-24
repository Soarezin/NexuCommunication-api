// src/middlewares/validateMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
        schema.parse(req.body);
        next();
    } catch (error) {
        if (error instanceof ZodError) {
            const errors = error.issues.map((err: import('zod').ZodIssue) => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return res.status(400).json({ errors });
        }
        console.error('Erro de validação:', error);
        next(error);
    }
};