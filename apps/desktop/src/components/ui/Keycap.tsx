/** A keyboard key or shortcut, in Geist Mono when installed. */
export function Keycap({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex items-center rounded-md border border-content/10 bg-content/6 px-1.5 py-0.5 font-keycap text-[11px] leading-4 text-content/80">
      {children}
    </kbd>
  );
}
