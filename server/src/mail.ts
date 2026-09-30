import { Resend } from 'resend';
export async function sendCode(email: string, code: string) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new Error('mail_unavailable');
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.MAIL_FROM, to: email, subject: `${code} — код входа в ECHO`,
    text: `Твой код входа в ECHO: ${code}. Действует 10 минут.`,
  });
  if (error) throw new Error('mail_unavailable');
}
