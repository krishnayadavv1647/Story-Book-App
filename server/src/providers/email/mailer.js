import { Resend } from 'resend';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Transactional email, through Resend.
 *
 * One send path for the whole server: a caller hands over an already-rendered
 * subject, HTML and plain-text body (see `templates.js`) and this file decides
 * how it reaches an inbox. Nothing above it knows the provider's name.
 *
 * Contract confirmed against the Resend Node SDK v6 (2026-09-07):
 *   send  — resend.emails.send({ from, to, subject, html, text, replyTo, tags })
 *   reply — { data: { id }, error: null } | { data: null, error: { name,
 *           message, statusCode } }. It RESOLVES on a rejected send instead of
 *           throwing, so `error` has to be checked explicitly — a `try` alone
 *           would treat every rejection as a success.
 *   auth  — the API key passed to the constructor.
 *
 * Mail is optional. With no RESEND_API_KEY or MAIL_FROM the server behaves
 * exactly as it did before one existed: callers ask `isMailConfigured()` first
 * and fall back (in development the password-reset link is logged instead).
 */

export class MailError extends Error {
  constructor(message, { status, code, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MailError';
    this.status = status ?? 0;
    this.code = code ?? 'MAIL_ERROR';
    this.retryable = retryable;
    this.isProviderError = true;
    this.provider = 'resend';
  }
}

/**
 * Provider error names worth trying again. Everything else — a bad address, an
 * unverified sending domain, a rejected key — fails the same way on a retry, so
 * retrying it only delays the report.
 */
const RETRYABLE = new Set([
  'rate_limit_exceeded',
  'internal_server_error',
  'application_error',
  'concurrent_idempotent_requests',
]);

/**
 * Enabled only when both the key and a sender are configured. Resend refuses a
 * send from an address on a domain that has not been verified, so MAIL_FROM is
 * as load-bearing as the key itself and there is no useful default for it.
 */
export function isMailConfigured() {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

let client;

function getClient() {
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Resend's `error` object → one of ours.
 *
 * Kept separate and pure so the mapping — in particular which failures are
 * worth a second attempt — is testable without a network call.
 */
export function toMailError(error) {
  const name = error?.name ?? 'application_error';
  const status = error?.statusCode ?? 0;

  return new MailError(error?.message ?? 'The mail provider rejected the message', {
    status,
    code: `MAIL_${name.toUpperCase()}`,
    retryable: RETRYABLE.has(name) || status >= 500,
  });
}

/**
 * The SDK takes no timeout and Node's `fetch` has no default one, so a provider
 * that simply never answers would hold an HTTP request open for as long as it
 * liked. The send is not cancelled — nothing here can cancel it — but the
 * caller stops waiting.
 */
function withTimeout(promise) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new MailError('The mail provider did not respond in time', {
            code: 'MAIL_TIMEOUT',
            retryable: true,
          }),
        ),
      env.MAIL_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

/**
 * Sends one message and resolves with the provider's id for it.
 *
 * Throws rather than reporting failure in a return value. A caller that can do
 * nothing useful about a failure — a password reset, where the reply must look
 * identical whatever happens — catches and logs it; one that can retry reads
 * `error.retryable`.
 *
 * Neither the recipient nor the body is ever logged here.
 */
export async function sendMail({ to, subject, html, text, replyTo, tags, idempotencyKey } = {}) {
  if (!isMailConfigured()) {
    throw new MailError('No mail provider is configured on this server', {
      code: 'MAIL_NOT_CONFIGURED',
    });
  }

  const reply = replyTo || env.MAIL_REPLY_TO;
  const payload = {
    from: env.MAIL_FROM,
    to,
    subject,
    html,
    text,
    ...(reply ? { replyTo: reply } : {}),
    ...(tags ? { tags } : {}),
  };

  let result;
  try {
    result = await withTimeout(
      getClient().emails.send(payload, idempotencyKey ? { idempotencyKey } : undefined),
    );
  } catch (cause) {
    if (cause instanceof MailError) throw cause;
    throw new MailError('Could not reach the mail provider', {
      code: 'MAIL_UNAVAILABLE',
      retryable: true,
      cause,
    });
  }

  if (result?.error) throw toMailError(result.error);

  const id = result?.data?.id ?? null;
  logger.info({ mailId: id, subject }, 'Email sent');
  return { id };
}

export default { MailError, isMailConfigured, sendMail, toMailError };
