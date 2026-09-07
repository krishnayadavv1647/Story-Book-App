/**
 * The messages this server sends, rendered to subject + HTML + plain text.
 *
 * Deliberately hand-written HTML rather than a component library: mail clients
 * are twenty years behind browsers, so everything here is a table with inline
 * styles, no external stylesheet, no image and no web font. Anything cleverer
 * survives the preview and then falls apart in Outlook.
 *
 * Every message ships a plain-text part as well. Some clients show it, spam
 * filters read it, and a mail with no text alternative scores worse.
 *
 * Colours are the app's own dark palette (client/src/styles/index.css). They
 * are literals here because a server module cannot read the browser's CSS
 * variables — keep them in step by hand if the palette changes.
 */

const APP_NAME = 'StoryBook Studio';

const COLOR = {
  ground: '#010609',
  surface: '#071216',
  border: '#0c2a2c',
  heading: '#f7f8f8',
  body: '#a9b4b5',
  muted: '#6f7e80',
  gold: '#dba51c',
  goldInk: '#221600',
};

/** A name, a title, anything a user typed — never trusted as markup. */
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/**
 * The shell every message sits in: centred card, one gold call to action.
 *
 * `preheader` is the grey line a client shows next to the subject in the inbox
 * list. Left out, clients grab the first words of the body instead, which for a
 * card layout is usually the word "StoryBook" repeated.
 */
function layout({ preheader, heading, paragraphs = [], cta, footer = [] }) {
  const body = paragraphs
    .map(
      (html) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLOR.body};">${html}</p>`,
    )
    .join('');

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr>
              <td align="center" bgcolor="${COLOR.gold}" style="border-radius:10px;">
                <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${COLOR.goldInk};text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
              </td>
            </tr>
          </table>`
    : '';

  const notes = footer
    .map(
      (html) =>
        `<p style="margin:0 0 8px;font-size:12px;line-height:19px;color:${COLOR.muted};">${html}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.ground};font-family:Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader ?? '')}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.ground};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 24px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.gold};">${APP_NAME}</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:${COLOR.heading};">${escapeHtml(heading)}</h1>
                ${body}
                ${button}
                ${notes}
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:${COLOR.muted};">${APP_NAME}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * The password-reset link.
 *
 * The URL appears as plain text under the button as well: link buttons are the
 * first thing a corporate mail scanner rewrites or strips, and a reset nobody
 * can complete is worse than an ugly line of text.
 */
export function passwordResetEmail({ name, link, expiresInMinutes }) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const href = escapeHtml(link);

  return {
    subject: `Reset your ${APP_NAME} password`,
    html: layout({
      preheader: `Your reset link expires in ${expiresInMinutes} minutes.`,
      heading: 'Reset your password',
      paragraphs: [
        greeting,
        `Someone asked to reset the password for this ${APP_NAME} account. Choose a new one here:`,
      ],
      cta: { label: 'Choose a new password', href: link },
      footer: [
        `This link expires in ${expiresInMinutes} minutes and can be used once.`,
        `If the button does not work, paste this into your browser:<br /><span style="color:${COLOR.body};word-break:break-all;">${href}</span>`,
        'If you did not ask for this, you can ignore this email — your password stays as it is.',
      ],
    }),
    text: [
      name ? `Hi ${name},` : 'Hi,',
      '',
      `Someone asked to reset the password for this ${APP_NAME} account.`,
      'Open this link to choose a new one:',
      link,
      '',
      `The link expires in ${expiresInMinutes} minutes and can be used once.`,
      'If you did not ask for this, ignore this email — your password stays as it is.',
      '',
      APP_NAME,
    ].join('\n'),
  };
}

export default { passwordResetEmail };
