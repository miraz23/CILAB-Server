const nodemailer = require('nodemailer');

const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD &&
  process.env.MAIL_FROM
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null;

async function sendPasswordResetEmail(email, resetUrl) {
  if (!transporter) {
    throw new Error('SMTP mail settings are not configured.');
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Reset your CILab password',
    text: `Use this link to reset your CILab password: ${resetUrl}\n\nThis link expires in one hour.`,
    html: `<p>Use this link to reset your CILab password:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in one hour.</p>`,
  });
}

module.exports = { sendPasswordResetEmail };
