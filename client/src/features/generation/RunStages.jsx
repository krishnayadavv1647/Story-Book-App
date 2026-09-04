import { Check, Loader2 } from 'lucide-react';

import { cn } from '../../lib/cn.js';

/**
 * What the run is doing, and what it has already done.
 *
 * A run draws the cast before it touches a page, and the cover after the last
 * one lands. For most of its length the page counters are therefore either all
 * zero or all full, and a screen showing only those looks stuck twice — once at
 * the start and once at the end. This says which stage is actually running.
 *
 * The story stage is always finished: you only reach this screen because a plan
 * exists.
 */
const ORDER = { characters: 1, pages: 2, cover: 3, done: 4 };

export function RunStages({ stage, characters, pagesReady, pagesTotal, className }) {
  const current = ORDER[stage] ?? 0;

  const drawn = characters.filter((character) => character.status === 'ready').length;

  const stages = [
    { key: 'plan', label: 'Story written', detail: null },
    {
      key: 'characters',
      label: 'Characters',
      detail: characters.length ? `${drawn} of ${characters.length}` : null,
    },
    {
      key: 'pages',
      label: 'Illustrations',
      detail: pagesTotal ? `${pagesReady} of ${pagesTotal}` : null,
    },
    { key: 'cover', label: 'Cover', detail: null },
  ];

  return (
    <ol className={cn('flex flex-wrap items-center gap-x-2 gap-y-2', className)}>
      {stages.map(({ key, label, detail }, index) => {
        const done = index < current;
        const running = index === current;

        return (
          <li key={key} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-control-sm items-center gap-2 rounded-pill border px-3 text-2xs font-semibold',
                done && 'border-hairline bg-success-soft text-ink',
                running && 'border-hairline-strong bg-teal-soft text-ink',
                !done && !running && 'border-hairline bg-surface text-ink-muted',
              )}
            >
              {done && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
              {running && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />}
              {label}
              {detail && <span className="font-normal text-ink-muted">{detail}</span>}
              {/* The chips are colour-coded, and colour alone is not a state. */}
              <span className="sr-only">
                {done ? ' — done' : running ? ' — in progress' : ' — waiting'}
              </span>
            </span>

            {index < stages.length - 1 && (
              <span className="h-px w-4 bg-hairline" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default RunStages;
