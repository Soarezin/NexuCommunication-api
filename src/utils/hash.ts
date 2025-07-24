// src/utils/hash.ts
import bcrypt from 'bcryptjs';

const saltRounds = 10; // Custo do hash, maior é mais seguro, mas mais lento

/**
 * Gera um hash de uma senha.
 * @param password - A senha em texto puro.
 * @returns O hash da senha.
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, saltRounds);
}

/**
 * Compara uma senha em texto puro com um hash.
 * @param password - A senha em texto puro.
 * @param hash - O hash da senha.
 * @returns True se a senha corresponder ao hash, caso contrário, false.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}