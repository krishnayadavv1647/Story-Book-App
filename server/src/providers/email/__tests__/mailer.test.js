import { describe, it, expect } from 'vitest';

import { isMailConfigured, sendMail, toMailError } from '../mailer.js';
import { passwordResetEmail } from '../templates.js';

/**
 * The test environment configures no RESEND_API_KEY (see vitest.config.js), so
 * this covers the "no mailer" guard and the pure parts — provider-error mapping
 * and template rendering — without a network call. A real send cannot run
 * offline; that the password-reset flow hands the right message to the mailer
 * is covered over HTTP in the auth tests, with this module mocked.
 */
describe('mailer (unconfigured)', () => {
  it('reports that mail is off', () => {
    expect(isMailConfigured()).toBe(false);
  });

  it('refuses to send rather than pretending it did', async () => {
    await expect(
      sendMail({ to: 'reader@example.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }),
    ).rejects.toMatchObject({ code: 'MAIL_NOT_CONFIGURED', retryable: false });
  });
});

describe('provider error mapping', () => {
  it('treats a rate limit as worth retrying', () => {
    const error = toMailError({
      name: 'rate_limit_exceeded',
      message: 'Too many',
      statusCode: 429,
    });

    expect(error).toMatchObject({
      code: 'MAIL_RATE_LIMIT_EXCEEDED',
      status: 429,
      retryable: true,
      provider: 'resend',
    });
  });

  it('treats any 5xx as worth retrying, whatever it is called', () => {
    expect(toMailError({ name: 'security_error', message: 'Boom', statusCode: 503 })).toMatchObject(
      {
        retryable: true,
      },
    );
  });

  it('does not retry a message the provider will reject again', () => {
    // A malformed address or an unverified sending domain fails identically on
    // a second attempt, so retrying only delays the report.
    expect(
      toMailError({ name: 'invalid_from_address', message: 'Bad sender', statusCode: 422 }),
    ).toMatchObject({ code: 'MAIL_INVALID_FROM_ADDRESS', retryable: false });
  });

  it('still produces an error when the provider says nothing useful', () => {
    expect(toMailError(undefined)).toMatchObject({ code: 'MAIL_APPLICATION_ERROR', status: 0 });
  });
});

describe('password reset email', () => {
  const link = 'http://localhost:5173/reset-password?token=abc123_-';

  it('carries the link in both the HTML and the text part', () => {
    const message = passwordResetEmail({ name: 'Krishna', link, expiresInMinutes: 30 });

    expect(message.subject).toMatch(/reset/i);
    expect(message.html).toContain(link);
    expect(message.text).toContain(link);
  });

  it('shows the link as text as well as a button', () => {
    // Corporate mail scanners rewrite or strip link buttons; a reset nobody can
    // complete is worse than an ugly line of text.
    const { html } = passwordResetEmail({ name: 'Krishna', link, expiresInMinutes: 30 });
    const occurrences = html.split(link).length - 1;

    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('says how long the link lasts', () => {
    const message = passwordResetEmail({ name: 'Krishna', link, expiresInMinutes: 30 });

    expect(message.html).toContain('30 minutes');
    expect(message.text).toContain('30 minutes');
  });

  it('never lets a chosen name become markup', () => {
    const { html } = passwordResetEmail({
      name: '<script>alert(1)</script>',
      link,
      expiresInMinutes: 30,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('greets an account with no name without an empty gap', () => {
    const message = passwordResetEmail({ name: '', link, expiresInMinutes: 30 });

    expect(message.text.startsWith('Hi,')).toBe(true);
    expect(message.html).toContain('Hi,');
  });
});
