const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = process.env.EMAIL_USER
      ? nodemailer.createTransport({
          host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
          port:   parseInt(process.env.EMAIL_PORT || '587'),
          secure: false,
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        })
      : null;
  }

  async send({ to, subject, html, text }) {
    if (!this.transporter) {
      console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject}`);
      if (text) console.log('[EMAIL DEV]', text);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM || 'FonzControl <noreply@fonz.mx>',
      to, subject, html, text,
    });
  }

  // Renderiza plantilla con variables {{folio}}, {{name}}, etc.
  render(template, vars = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }
}

module.exports = new EmailService();
