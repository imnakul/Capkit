import { ChevronDown, type CapkitIconComponent } from "../icons";

type SettingsCardProps<Id extends string> = {
  id: Id;
  open: boolean;
  onToggle: (id: Id) => void;
  icon: CapkitIconComponent;
  title: string;
  /** The current value, shown while the card is closed so most people never expand it. */
  summary?: React.ReactNode;
  /** One supporting line, shown only when open. */
  hint?: string;
  children: React.ReactNode;
};

/**
 * One collapsible settings group, following the ARIA accordion pattern: the
 * `h2` holds a single button, and that whole header row is the click target.
 * The body animates with `grid-template-rows` (open 220 ms, close 160 ms) and is
 * `inert` while closed so focus and the accessibility tree skip it. Several
 * cards may be open at once; each animates alone.
 */
export function SettingsCard<Id extends string>({ id, open, onToggle, icon: Icon, title, summary, hint, children }: SettingsCardProps<Id>): React.JSX.Element {
  const bodyId = `settings-section-${id}`;
  return (
    <section className="overflow-hidden rounded-lg border border-content/10 bg-content/4">
      <h2>
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-120 hover:bg-content/6 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 motion-reduce:transition-none"
          type="button"
          onClick={() => onToggle(id)}
        >
          <Icon aria-hidden="true" className="shrink-0 text-content/60" size={16} strokeWidth={1.75} />
          <span className="text-[13px] font-semibold text-content">{title}</span>
          <span className="ml-auto flex min-w-0 items-center gap-2 truncate text-[12px] text-content/45">{summary}</span>
          <ChevronDown
            aria-hidden="true"
            className={`shrink-0 text-content/45 transition-transform ease-settle motion-reduce:transition-none ${open ? "rotate-180 duration-[220ms]" : "duration-[160ms]"}`}
            size={14}
            strokeWidth={1.75}
          />
        </button>
      </h2>
      <div
        className={`grid transition-[grid-template-rows] ease-settle motion-reduce:transition-none ${open ? "grid-rows-[1fr] duration-[220ms]" : "grid-rows-[0fr] duration-[160ms]"}`}
        id={bodyId}
        inert={!open}
      >
        <div className={`min-h-0 overflow-hidden transition-opacity ease-settle motion-reduce:transition-none ${open ? "opacity-100 duration-[220ms]" : "opacity-0 duration-[160ms]"}`}>
          <div className={`px-4 pb-4 ${hint === undefined ? "pt-3" : "pt-1"}`}>
            {hint === undefined ? null : <p className="mb-3 text-[12px] text-content/60">{hint}</p>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
