/** Shared enumerations. Single source of truth for model + validator layers. */

export const USER_ROLES = ['user', 'admin'];
export const USER_STATUS = ['active', 'suspended', 'deleted'];

// Audience bands. The lower four are the children's ladder the approved design
// offers on the Review Story Plan screen (Figma H98QB4Tdo6iH2EaXCerUlv frame
// 1:2, node 1:78). The top two extend the product beyond children — StoryBook
// Studio now makes illustrated books for teens and adults as well, so the
// planner needs a way to say "write this for a 15-year-old" or "for an adult".
// The old open-ended '12+' is replaced by '13-17' and '18+', which name the two
// audiences distinctly rather than lumping every reader over twelve together.
export const AGE_GROUPS = ['0-3', '3-5', '6-9', '9-12', '13-17', '18+'];

export const BOOK_STATUS = [
  'draft',
  'planning',
  'plan_ready',
  'characters_ready',
  'generating',
  'ready',
  // Published books are finished and listed under Published Books; they are
  // still editable, and unpublishing returns them to `ready`.
  'published',
  'failed',
  'archived',
];

export const PAGE_STATUS = ['pending', 'queued', 'generating', 'ready', 'failed'];

// The role a page plays in the finished book. `story` is the default so every
// existing page — all of which are story pages — keeps its meaning without a
// migration; the structural pages (covers, title, ending) are set explicitly
// when a book is built or when they are added to an older book.
export const BOOK_PAGE_TYPES = ['cover_front', 'title', 'story', 'ending', 'cover_back'];

// Print production options. Kept as enums so the model, the validators and the
// print-geometry engine share one source of truth.
export const BOOK_BINDINGS = ['paperback', 'hardcover', 'stapled'];
export const PAPER_FINISHES = ['matte', 'glossy'];
export const BOOK_ORIENTATIONS = ['square', 'portrait', 'landscape'];

export const CHARACTER_ROLES = ['main', 'supporting', 'other'];
export const CHARACTER_STATUS = ['draft', 'queued', 'generating', 'ready', 'failed'];

export const JOB_STATUS = ['queued', 'processing', 'succeeded', 'failed', 'cancelled'];
export const JOB_TYPES = [
  'story_plan',
  'story_chat',
  'character_image',
  'page_image',
  'page_regenerate',
  'image_edit',
  // A book's front cover. Unlike a page image this one is *supposed* to carry
  // text: the title and subtitle are rendered into the artwork itself, which is
  // why the library card no longer prints them beside it.
  'book_cover',
];

export const AI_PROVIDERS = ['gemini', 'kie'];

// `html` is the interactive flipbook: a single self-contained web page that
// keeps the page-turn animation a PDF cannot carry. `print_pdf` is the
// print-ready PDF (true physical size, bleed, crop marks); `cover_spread` is the
// full wrap-around cover (back + spine + front) as one 300-DPI image.
export const EXPORT_FORMATS = [
  'pdf',
  'png',
  'html',
  'print_pdf',
  'cover_spread',
  // `png_pages` is a zip of one 300-DPI PNG per page; the cover files are single
  // panels.
  'png_pages',
  'cover_front',
  'cover_back',
];
export const EXPORT_STATUS = ['queued', 'processing', 'succeeded', 'failed', 'cancelled'];
export const EXPORT_QUALITY = ['standard', 'high', 'print'];

export const MEDIA_KINDS = [
  'page_image',
  'character_image',
  'book_cover',
  'reference',
  'upload',
  'export',
];
export const MEDIA_STATUS = ['pending', 'stored', 'failed', 'deleted'];

export const SUBSCRIPTION_STATUS = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
];

// What moved a balance. The sign of the ledger row's `amount` says which way:
// a debit is negative, a grant or a refund positive. `admin_adjust` covers both
// directions because an admin correction can go either way.
export const CREDIT_ENTRY_TYPES = ['signup_grant', 'debit', 'refund', 'admin_adjust'];

export const MODERATION_STATUS = ['pending', 'approved', 'flagged', 'rejected'];
export const MODERATION_SUBJECTS = ['prompt', 'story_plan', 'image', 'upload', 'character'];

export const NOTIFICATION_TYPES = [
  'book_ready',
  'book_failed',
  'page_failed',
  'character_ready',
  'export_ready',
  'export_failed',
  'subscription',
  'system',
];

export default {
  USER_ROLES,
  USER_STATUS,
  AGE_GROUPS,
  BOOK_STATUS,
  PAGE_STATUS,
  BOOK_PAGE_TYPES,
  BOOK_BINDINGS,
  PAPER_FINISHES,
  BOOK_ORIENTATIONS,
  CHARACTER_ROLES,
  CHARACTER_STATUS,
  JOB_STATUS,
  JOB_TYPES,
  AI_PROVIDERS,
  EXPORT_FORMATS,
  EXPORT_STATUS,
  EXPORT_QUALITY,
  MEDIA_KINDS,
  MEDIA_STATUS,
  SUBSCRIPTION_STATUS,
  CREDIT_ENTRY_TYPES,
  MODERATION_STATUS,
  MODERATION_SUBJECTS,
  NOTIFICATION_TYPES,
};
