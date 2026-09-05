import { cn } from '../../lib/cn.js';

/**
 * The "AI WRITER / IMAGE ENGINE" status row at the foot of the agent screen.
 *
 * The design draws two filled bars. They report real state rather than being
 * decoration: the bar is teal when the user has set that engine's API key and an
 * unfilled surface when they have not, so a user who cannot generate anything can
 * see why. It is deliberately not gold — this is status, not an action.
 */
function Meter({ label, engine }) {
  const configured = Boolean(engine?.configured);

  return (
    <div className="flex items-center gap-3">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span
        role="img"
        aria-label={`${label}: ${configured ? `ready, ${engine.model}` : 'add your API key in Settings'}`}
        title={configured ? engine.model : 'Add your API key in Settings'}
        className={cn(
          'h-1.5 w-16 rounded-pill',
          configured ? 'bg-teal-bright' : 'bg-surface-elevated',
        )}
      />
    </div>
  );
}

export function EngineMeters({ engines, className }) {
  return (
    <div className={cn('flex items-center justify-center gap-10', className)}>
      <Meter label="AI Writer" engine={engines?.writer} />
      <Meter label="Image Engine" engine={engines?.image} />
    </div>
  );
}

export default EngineMeters;
