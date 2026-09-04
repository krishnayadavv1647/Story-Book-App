/**
 * Statuses that get no chip on the cover.
 *
 * Set by the owner. Both are states the cover already answers for, and a chip
 * over the artwork is a real cost — it is the one thing allowed to cover a
 * generated cover's own lettering:
 *
 *   `published` — the Published Books screen is entirely published books, and on
 *                 the other screens "published" is not a state you act on.
 *   `failed`    — the Illustrate screen reports which pages failed and offers
 *                 the retry, and a notification is raised when it happens. A
 *                 chip in the library only says something went wrong somewhere.
 *
 * Screens may hide more than this — the Dashboard also leaves a finished book
 * unbadged — but never less.
 */
export const UNBADGED_STATUSES = new Set(['published', 'failed']);

export default UNBADGED_STATUSES;
