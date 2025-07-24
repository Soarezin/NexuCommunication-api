// src/services/emailService.ts
import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer'; // Importe o tipo Transporter

// Declare transporter com um tipo que permita reatribuição, ou null inicialmente
let transporter: Transporter;

// Função assíncrona para configurar o transporter.
// Ela será chamada na inicialização do módulo ou do aplicativo.
async function configureTransporter() {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        // Se as credenciais estiverem no .env, use-as
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        console.log('Nodemailer configurado com credenciais do .env.');
    } else {
        // Se não houver credenciais no .env, gere uma conta de teste Ethereal
        try {
            const testAccount = await nodemailer.createTestAccount();
            console.warn(`
                ----------------------------------------------------------------------
                EMAIL DE TESTE ETHEREAL: Por favor, adicione estas credenciais ao seu .env:
                EMAIL_USER='${testAccount.user}'
                EMAIL_PASS='${testAccount.pass}'
                ----------------------------------------------------------------------
                Acesse o email de teste em: ${testAccount.web}
                ----------------------------------------------------------------------
            `);
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });
            console.log('Nodemailer configurado com conta de teste Ethereal.');
        } catch (e) {
            console.error('Falha ao criar conta de teste Ethereal:', e);
            // Fallback para um transporter básico que não enviará e-mails se a conta de teste falhar
            transporter = nodemailer.createTransport({
                host: "localhost", // Um host que provavelmente não existe para evitar envio real
                port: 25,
                secure: false,
            });
        }
    }

    // Verifica a conexão do transporter
    try {
        await transporter.verify();
        console.log("Servidor de e-mail pronto para enviar mensagens.");
    } catch (error) {
        console.error("Erro ao verificar conexão do servidor de e-mail:", error);
    }
}

// Chame a função de configuração para inicializar o transporter
// Idealmente, você chamaria isso uma vez na inicialização do seu app (ex: no app.ts)
// ou garantiria que ela seja executada antes de qualquer sendEmail.
configureTransporter();

/**
 * Envia um e-mail de notificação.
 * @param to - Endereço de e-mail do destinatário.
 * @param subject - Assunto do e-mail.
 * @param text - Conteúdo do e-mail em texto puro.
 * @param html - Conteúdo do e-mail em HTML (opcional).
 */
export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
    // Garante que o transporter foi configurado antes de tentar enviar
    if (!transporter) {
        console.error('Erro: Transporter de e-mail não configurado. Tentando configurar agora...');
        await configureTransporter(); // Tenta configurar se não estiver
        if (!transporter) {
             console.error('Erro: Transporter de e-mail ainda não está disponível após tentativa de configuração.');
             return false;
        }
    }

    const mailOptions = {
        from: `Nexu Communication <${process.env.EMAIL_FROM || 'noreply@nexucomm.com'}>`,
        to,
        subject,
        text,
        html: html || text,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('E-mail de notificação enviado:', info.messageId);
        // A URL de visualização só funciona para Ethereal accounts
        const transporterHost = (transporter as any).getOptions?.().host || (transporter as any).options?.host;
        if (transporterHost === "smtp.ethereal.email" && nodemailer.getTestMessageUrl(info)) {
            console.log('URL de visualização (Ethereal):', nodemailer.getTestMessageUrl(info));
        }
        return true;
    } catch (error) {
        console.error('Erro ao enviar e-mail de notificação:', error);
        return false;
    }
};