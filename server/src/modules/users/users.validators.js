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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  // The same minimum the register form enforces; a weaker one here would be a
  // way around it.
  newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
});

export default { updateProfileSchema, changePasswordSchema };
