import type { LucideIcon } from "lucide-react";

type ToolButtonProps = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onClick: () => void;
};

export function ToolButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  shortcut,
  onClick,
}: ToolButtonProps): React.JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="group relative grid size-10 shrink-0 place-items-center rounded-[11px] text-stone-300 outline-none transition duration-150 hover:bg-white/9 hover:text-white focus-visible:ring-2 focus-visible:ring-lime-300 disabled:cursor-not-allowed disabled:opacity-30 data-[active=true]:bg-lime-300 data-[active=true]:text-stone-950"
      data-active={active}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={active ? 2.4 : 1.9} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-stone-950 px-2 py-1 text-[11px] font-medium text-stone-100 shadow-xl group-hover:block group-focus-visible:block">
        {label}
        {shortcut === undefined ? null : <kbd className="ml-2 text-stone-500">{shortcut}</kbd>}
      </span>
    </button>
  );
}

