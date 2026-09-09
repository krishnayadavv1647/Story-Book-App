import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address')
  .email('Enter a valid email address')
  .max(254);

/**
 * Length is the requirement that actually resists guessing; composition rules
 * mostly push people toward predictable substitutions. Twelve characters, with
 * an upper bound because bcrypt silently ignores bytes past 72.
 */
const password = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(72, 'Use at most 72 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(72),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'This reset link is not valid'),
  password,
});

/**
 * Asking for a sign-in code. `name` is optional and only used when the address
 * turns out to be new — a partner app that knows who it is registering can pass
 * one so the account is not named after an email prefix.
 */
export const requestLoginCodeSchema = z.object({
  email,
  name: z.string().trim().min(1).max(120).optional(),
});

export const verifyLoginCodeSchema = z.object({
  email,
  // Trimmed and stripped of spaces first: a code read off a phone is often
  // pasted as "482 913", and refusing that is a pointless way to lose someone.
  code: z
    .string()
    .transform((value) => value.replace(/[^0-9]/g, ''))
    .refine((value) => value.length === 6, 'Enter the 6-digit code'),
});

export default {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  requestLoginCodeSchema,
  verifyLoginCodeSchema,
};
