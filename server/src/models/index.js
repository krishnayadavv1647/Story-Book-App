import mongoose from 'mongoose';

export { User } from './User.js';
export { RefreshToken } from './RefreshToken.js';
export { Plan } from './Plan.js';
export { Subscription } from './Subscription.js';
export { CreditLedger } from './CreditLedger.js';
export { Book } from './Book.js';
export { BookPage } from './BookPage.js';
export { Character } from './Character.js';
export { CharacterReference } from './CharacterReference.js';
export { StoryWorld } from './StoryWorld.js';
export { MediaAsset } from './MediaAsset.js';
export { GenerationJob } from './GenerationJob.js';
export { PromptVersion } from './PromptVersion.js';
export { ExportJob } from './ExportJob.js';
export { Notification } from './Notification.js';
export { AIProviderConfig } from './AIProviderConfig.js';
export { ModerationEvent } from './ModerationEvent.js';
export { AuditLog } from './AuditLog.js';

export * as enums from './enums.js';

/** Every model the application defines. Asserted by the model contract test. */
export const MODEL_NAMES = Object.freeze([
  'User',
  'RefreshToken',
  'Plan',
  'Subscription',
  'CreditLedger',
  'Book',
  'BookPage',
  'Character',
  'CharacterReference',
  'StoryWorld',
  'MediaAsset',
  'GenerationJob',
  'PromptVersion',
  'ExportJob',
  'Notification',
  'AIProviderConfig',
  'ModerationEvent',
  'AuditLog',
]);

/**
 * Builds every declared index. Called explicitly at boot in production, where
 * `autoIndex` is off so a deploy never triggers a surprise index build.
 */
export async function syncIndexes() {
  const results = [];
  for (const name of MODEL_NAMES) {
    const model = mongoose.model(name);
    await model.createIndexes();
    results.push(name);
  }
  return results;
}
