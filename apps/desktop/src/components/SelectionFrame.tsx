import type { Rect } from "../domain/capture";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type SelectionFrameProps = {
  rect: Rect;
  children: React.ReactNode;
  onMoveStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (handle: ResizeHandle, event: React.PointerEvent<HTMLButtonElement>) => void;
};

const handles: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function SelectionFrame({
  rect,
  children,
  onMoveStart,
  onResizeStart,
}: SelectionFrameProps): React.JSX.Element {
  return (
    <div
      className="capture-selection-mask absolute z-10 cursor-grab border border-lime-300/90 active:cursor-grabbing"
      data-capture-interactive="true"
      style={{ height: rect.height, left: rect.x, top: rect.y, width: rect.width }}
      onPointerDown={onMoveStart}
    >
      {children}
      {handles.map((handle) => (
        <button
          aria-label={`Resize selection ${handle}`}
          className={`selection-handle selection-handle-${handle}`}
          key={handle}
          type="button"
          onPointerDown={(event) => onResizeStart(handle, event)}
        />
      ))}
      <div className="pointer-events-none absolute -top-7 left-0 rounded-md border border-white/10 bg-stone-950/90 px-2 py-1 font-mono text-[10px] font-semibold tracking-wide text-stone-200 shadow-lg">
        {Math.round(rect.width)} × {Math.round(rect.height)} px
      </div>
    </div>
  );
}
