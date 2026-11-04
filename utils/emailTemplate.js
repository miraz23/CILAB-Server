const path = require('path');

const BRAND = {
  name: 'Computational Intelligence Lab',
  primary: '#626c49',
  primaryDark: '#1f321c',
  primaryDeep: '#141f12',
  accent: '#716f49',
  gold: '#c9c58a',
  page: '#e4e2d7',
  card: '#ffffff',
  text: '#262626',
  muted: '#737373',
  border: '#e5e5e5',
};

const GRADIENT = {
  header: `linear-gradient(135deg, ${BRAND.primaryDeep} 0%, ${BRAND.primaryDark} 55%, ${BRAND.primary} 100%)`,
  button: `linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryDark} 100%)`,
  accent: `linear-gradient(90deg, ${BRAND.gold} 0%, ${BRAND.primary} 50%, ${BRAND.primaryDark} 100%)`,
  footer: `linear-gradient(180deg, ${BRAND.primaryDark} 0%, ${BRAND.primaryDeep} 100%)`,
  page: `linear-gradient(180deg, ${BRAND.page} 0%, #d4d2c3 100%)`,
};

const FONT = "Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif";

// Logo is embedded as an inline (CID) attachment so it renders without hosting.
const LOGO_CID = 'cilab-logo';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo', 'logo.png');
const logoAttachments = () => [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function siteUrl() {
  return (process.env.CLIENT_URL || 'https://computational-intelligence-lab.vercel.app').replace(/\/$/, '');
}

/**
 * @param {object} opts
 * @param {string} opts.preheader  Inbox preview text
 * @param {string} opts.title      Heading inside the card
 * @param {string[]} opts.paragraphs  Body paragraphs (plain text, escaped)
 * @param {{label:string,url:string}} [opts.button]  Primary call to action
 * @param {string} [opts.note]     Small print under the button
 */
function renderEmail({ preheader = '', title, paragraphs = [], button, note }) {
  const base = siteUrl();
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:${BRAND.text};">${escapeHtml(p)}</p>`)
    .join('');

  const cta = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 8px;"><tr>
         <td align="center" bgcolor="${BRAND.primary}" style="border-radius:10px;background-color:${BRAND.primary};background-image:${GRADIENT.button};box-shadow:0 6px 16px rgba(31,50,28,0.28);">
           <a href="${escapeHtml(button.url)}" style="display:inline-block;padding:15px 36px;font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:0.6px;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(button.label)}</a>
         </td></tr></table>
       <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">Button not working? Paste this link into your browser:<br>
         <a href="${escapeHtml(button.url)}" style="color:${BRAND.accent};word-break:break-all;">${escapeHtml(button.url)}</a></p>`
    : '';

  const small = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>
         <td style="background:#f6f5ef;border-radius:6px;padding:14px 16px;font-size:12px;line-height:1.7;color:${BRAND.muted};">${escapeHtml(note)}</td>
       </tr></table>`
    : '';

  const link = (p, label) =>
    `<a href="${base}${p}" style="color:#d8d9d2;text-decoration:none;margin:0 10px;font-weight:500;">${label}</a>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};background-image:${GRADIENT.page};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.page};background-image:${GRADIENT.page};"><tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(31,50,28,0.18);">
    <tr><td bgcolor="${BRAND.primaryDark}" style="background-color:${BRAND.primaryDark};background-image:${GRADIENT.header};padding:34px 36px;border-radius:14px 14px 0 0;">
      <a href="${base}" style="text-decoration:none;">
        <span style="font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#ffffff;vertical-align:middle;">${BRAND.name}</span>
      </a>
    </td></tr>
    <tr><td height="4" style="height:4px;line-height:4px;font-size:0;background-color:${BRAND.primary};background-image:${GRADIENT.accent};">&nbsp;</td></tr>
    <tr><td style="background:${BRAND.card};padding:48px 36px 44px;font-family:${FONT};">
      <h1 style="margin:0 0 28px;font-size:26px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${BRAND.primaryDark};">${escapeHtml(title)}</h1>
      ${body}${cta}${small}
    </td></tr>
    <tr><td bgcolor="${BRAND.primaryDeep}" style="background-color:${BRAND.primaryDeep};background-image:${GRADIENT.footer};border-radius:0 0 14px 14px;padding:30px 36px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.8;color:#b9c48f;">
      ${link('/', 'Home')}${link('/news', 'News')}${link('/research/papers', 'Papers')}${link('/schedule', 'Schedule')}
      <div style="margin:18px auto 0;width:40px;height:1px;line-height:1px;font-size:0;background:${BRAND.accent};">&nbsp;</div>
      <div style="margin-top:16px;color:#a3a171;">Advancing the frontiers of computational intelligence.<br>&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

module.exports = { renderEmail, logoAttachments };