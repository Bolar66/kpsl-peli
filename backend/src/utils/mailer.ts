import nodemailer from 'nodemailer';

// Sähköpostin lähetys SMTP:llä (esim. Gmail sovellussalasanalla). Asetukset ympäristömuuttujista:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
// Jos asetuksia ei ole (kehitys), viesti tulostetaan palvelimen lokiin lähettämisen sijaan.
const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (Number(process.env.SMTP_PORT) || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    console.log(`[sähköposti ei käytössä] Vastaanottaja: ${to}\nAihe: ${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}
