// src/utils/jwt.ts
import jwt, { Secret, SignOptions } from 'jsonwebtoken';

export interface JwtPayload {
    id: string;
    tenantId: string;
}

const JWT_SECRET: Secret = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '1d';

export function generateToken(payload: JwtPayload): string {
    const options: SignOptions = {
        expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch (error) {
        return null;
    }
}