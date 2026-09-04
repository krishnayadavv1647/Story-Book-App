import { cn } from '../../lib/cn.js';
import { Sidebar } from './Sidebar.jsx';

/**
 * The application chrome every authenticated screen sits inside.
 *
 * Content inset is measured from the sources: 28px from the sidebar edge,
 * 30px from the right of the frame. Only the content column scrolls — the
 * sidebar stays put, which is what keeps a sticky action bar meaningful on a
 * short viewport.
 *
 * The 64px context strip the Figma frames draw across the top of the content
 * column ("STORY_BOOK_STUDIO • EXPLORE ACTIVE") was removed at the owner's
 * request. It was the same on every screen, carried no control, and repeated a
 * context each screen's own PageHeader already states. Recorded in the design
 * source map; reinstating it is one element in this file.
 *
 * No background of its own: the ground is the body's fixed theme gradient, and
 * painting a flat colour here would cover it.
 */
export function AppShell({ children, className, contentClassName }) {
  return (
    <div className={cn('flex h-full overflow-hidden', className)}>
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pl-7 pr-[30px] pt-[22px]', contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
