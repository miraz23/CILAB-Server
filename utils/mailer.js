const nodemailer = require('nodemailer');
const { renderEmail, logoAttachments } = require('./emailTemplate');

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
    attachments: logoAttachments(),
    html: renderEmail({
      preheader: 'Reset your CILab password. This link expires in one hour.',
      title: 'Reset your password',
      paragraphs: [
        'We received a request to reset the password for your Computational Intelligence Lab account.',
        'Click the button below to choose a new password. This link expires in one hour.',
      ],
      button: { label: 'Reset password', url: resetUrl },
      note: "If you didn't request this, you can safely ignore this email. Your password won't change.",
    }),
  });
}

async function sendRegistrationVerificationEmail(email, verificationUrl) {
  if (!transporter) {
    throw new Error('SMTP mail settings are not configured.');
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Verify your CILab account',
    text: `Verify your CILab account by opening this link: ${verificationUrl}\n\nThis link expires in 24 hours.`,
    attachments: logoAttachments(),
    html: renderEmail({
      preheader: 'Verify your CILab account. This link expires in 24 hours.',
      title: 'Verify your account',
      paragraphs: [
        'Thank you for registering with the Computational Intelligence Lab.',
        'Click the button below to verify your email address and create your account. This link expires in 24 hours.',
      ],
      button: { label: 'Verify email address', url: verificationUrl },
      note: "If you didn't create this registration, you can safely ignore this email.",
    }),
  });
}

module.exports = { sendPasswordResetEmail, sendRegistrationVerificationEmail };
