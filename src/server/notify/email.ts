import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Risposta in un thread esistente (Message-ID del messaggio precedente) */
  inReplyTo?: string;
  references?: string[];
};
export type SendResult = { delivered: boolean; error?: string; messageId?: string };
export type EmailSender = (email: Email) => Promise<SendResult>;

let transport: Transporter | undefined;

/**
 * Invio via SMTP di Google Workspace. Se non è configurato non lancia errori:
 * registra il richiamo come «non inviato», così il resto del flusso (PM, CEO) funziona lo stesso.
 */
export const sendEmail: EmailSender = async (email) => {
  const e = env();
  if (!e.SMTP_USER || !e.SMTP_PASS) {
    console.info(`[email non configurata] a ${email.to}: ${email.subject}`);
    return { delivered: false, error: "Email non configurata" };
  }
  transport ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
  });
  try {
    const info = await transport.sendMail({ from: e.SMTP_FROM ?? e.SMTP_USER, ...email });
    return { delivered: true, messageId: info.messageId };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message.slice(0, 300) : "Invio non riuscito" };
  }
};
