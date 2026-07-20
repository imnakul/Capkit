type CaptureBackdropProps = {
  snapshotUrl: string;
};

export function CaptureBackdrop({ snapshotUrl }: CaptureBackdropProps): React.JSX.Element {
  if (snapshotUrl !== "") {
    return <img alt="" className="pointer-events-none absolute inset-0 size-full select-none object-fill" src={snapshotUrl} />;
  }

  return (
    <div aria-hidden="true" className="demo-desktop absolute inset-0 overflow-hidden">
      <div className="absolute left-[7vw] top-[10vh] h-[68vh] w-[62vw] rounded-xl border border-black/15 bg-[#f4f1e9] shadow-2xl">
        <div className="flex h-11 items-center gap-2 border-b border-stone-300/80 px-4">
          <span className="size-2.5 rounded-full bg-[#e76555]" />
          <span className="size-2.5 rounded-full bg-[#dfb94c]" />
          <span className="size-2.5 rounded-full bg-[#78a76f]" />
          <span className="ml-5 h-5 w-52 rounded bg-stone-300/70" />
        </div>
        <div className="grid h-[calc(100%-2.75rem)] grid-cols-[160px_1fr]">
          <div className="border-r border-stone-300/80 p-4">
            <div className="mb-6 h-6 w-24 rounded bg-stone-900" />
            <div className="space-y-3">
              <div className="h-3 w-full rounded bg-stone-300" />
              <div className="h-3 w-4/5 rounded bg-stone-300" />
              <div className="h-3 w-3/5 rounded bg-lime-500/50" />
            </div>
          </div>
          <div className="p-8">
            <div className="mb-5 h-7 w-2/5 rounded bg-stone-800" />
            <div className="mb-10 h-3 w-3/4 rounded bg-stone-300" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-36 rounded-lg bg-[#d7dfd2]" />
              <div className="h-36 rounded-lg bg-[#e5d7c8]" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[7vh] right-[6vw] h-[42vh] w-[28vw] rounded-xl border border-white/15 bg-[#20231f] shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4 text-xs font-semibold text-stone-300">release-notes.md</div>
        <div className="space-y-3 p-6 font-mono text-[10px] text-stone-500">
          <p className="text-lime-300"># Capture, explain, continue.</p>
          <p>Snaphub keeps the tools around the work.</p>
          <p className="text-sky-300">const flow = ["select", "edit", "copy"];</p>
        </div>
      </div>
    </div>
  );
}

