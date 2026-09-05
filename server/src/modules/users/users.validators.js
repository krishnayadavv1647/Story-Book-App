import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Your name cannot be empty').max(120),
    preferences: z
      .object({
        theme: z.enum(['light', 'dark', 'system']),
        emailNotifications: z.boolean(),
      })
      .partial(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

// A provider key: a non-empty string to set, or the empty string to clear.
// Bounds keep an accidental paste of something huge out of the database; the
// real validity check is whether the provider accepts it at generation time.
const apiKey = z.union([z.literal(''), z.string().trim().min(10).max(400)]);

export const apiKeysSchema = z
  .object({ gemini: apiKey, kie: apiKey })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  // The same minimum the register form enforces; a weaker one here would be a
  // way around it.
  newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
});

export default { updateProfileSchema, changePasswordSchema, apiKeysSchema };
