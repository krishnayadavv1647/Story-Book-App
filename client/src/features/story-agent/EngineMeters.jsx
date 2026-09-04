import { cn } from '../../lib/cn.js';

/**
 * The "AI WRITER / IMAGE ENGINE" status row at the foot of the agent screen.
 *
 * The design draws two filled bars. They report real state rather than being
 * decoration: the bar is teal when the engine is configured on this server and
 * an unfilled surface when it is not, so a user who cannot generate anything can
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
        aria-label={`${label}: ${configured ? `ready, ${engine.model}` : 'not configured'}`}
        title={configured ? engine.model : 'Not configured on this server'}
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
