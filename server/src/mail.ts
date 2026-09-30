import { Resend } from 'resend';
export async function sendCode(email: string, code: string) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new Error('mail_unavailable');
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.MAIL_FROM, to: email, subject: `${code} — your Vencera Echo Game sign-in code`,
    text: `Your sign-in code: ${code}. Valid for 10 minutes.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Your sign-in code</h2>
      <p style="font-size:32px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>Valid for 10 minutes.</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
      <p style="color:#888;font-size:12px">Vencera Echo Game · built at ADMIT Hackathon 2026</p>
    </div>`,
  });
  if (error) throw new Error('mail_unavailable');
}
