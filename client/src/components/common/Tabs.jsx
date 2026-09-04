import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../lib/cn.js';

/**
 * Two tab treatments appear in the approved screens, so both exist here.
 *
 * `Tabs` — underline, from the Dashboard (TEMPLATES / GENRE): a 3px rule under
 * the active label, sitting on a full-width hairline. The rule is gold, as the
 * brief directs; the reference image tints it teal, and that difference is
 * recorded in the design source map.
 *
 * `SegmentedTabs` — the three-up mode selector from the Character screen
 * (Select Existing / Upload Character / Generate with AI): equal-width bordered
 * cards. The active one is a raised dark surface with a bright teal border —
 * teal because choosing a mode is a selection, not the screen's main action.
 *
 * Both use Radix Tabs, so arrow-key roving focus and the tab/panel ARIA
 * relationship come for free.
 */
export function Tabs({ value, onValueChange, items, className, children }) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="relative flex items-center gap-8 border-b border-hairline">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              'relative -mb-px pb-2.5 pt-1 text-base font-semibold uppercase tracking-wide',
              'text-ink-muted transition-colors hover:text-ink',
              'data-[state=active]:text-ink',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[3px] after:rounded-pill',
              'after:bg-transparent data-[state=active]:after:bg-gold',
            )}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export function SegmentedTabs({ value, onValueChange, items, className, children }) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ value: itemValue, label, icon: Icon, disabled }) => (
          <RadixTabs.Trigger
            key={itemValue}
            value={itemValue}
            disabled={disabled}
            className={cn(
              'inline-flex h-control-2xl items-center justify-center gap-2 rounded-lg border',
              'border-hairline bg-surface text-sm font-semibold text-ink transition-colors',
              'hover:bg-surface-hover',
              'data-[state=active]:border-hairline-strong data-[state=active]:bg-teal-soft',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export const TabPanel = RadixTabs.Content;

export default Tabs;
