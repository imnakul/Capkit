/** A fabricated "frozen desktop" — faux app windows, no real screenshot needed. */
export function DesktopBackdrop(): React.JSX.Element {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[28px]" aria-hidden="true">
      <div className="absolute inset-0 bg-[#0d0d0d] bg-grid" />

      {/* faux editor window, back-left */}
      <div className="absolute left-[4%] top-[10%] h-[62%] w-[46%] rounded-xl border border-white/10 bg-[#141414] shadow-none">
        <div className="flex h-8 items-center gap-1.5 border-b border-white/10 px-3">
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
        </div>
        <div className="space-y-2.5 p-4">
          {[92, 68, 80, 45, 72, 58].map((w, i) => (
            <div key={i} className="h-2 rounded-full bg-white/10" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>

      {/* faux browser window, front-right — this is what gets "selected" */}
      <div className="absolute bottom-[8%] right-[5%] h-[58%] w-[52%] rounded-xl border border-white/15 bg-[#191919]">
        <div className="flex h-8 items-center gap-2 border-b border-white/10 px-3">
          <span className="h-2 w-2 rounded-full bg-focus/70" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <div className="ml-2 h-3.5 flex-1 rounded-full bg-white/[0.06]" />
        </div>
        <div className="grid grid-cols-3 gap-2.5 p-4">
          <div className="col-span-3 h-16 rounded-lg bg-white/[0.07]" />
          <div className="h-10 rounded-lg bg-white/[0.06]" />
          <div className="h-10 rounded-lg bg-white/[0.06]" />
          <div className="h-10 rounded-lg bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}
