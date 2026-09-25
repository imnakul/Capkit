import { useRef } from "react";
import {
  clampCropInset,
  cropDragDelta,
  dropShadowValue,
  hasEffects,
  normalizeCrop,
  shadowValue,
  type CropEdge,
  type CropInsets,
  type EffectSettings,
  type FrameSettings,
  type ImageSettings,
  type Size,
} from "../../../domain/showcase";

const noiseLayer =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.75'/%3E%3C/svg%3E\") 0 0 / 180px 180px repeat";

const textureLayer =
  "repeating-linear-gradient(45deg,rgb(255 255 255 / 22%) 0 1px,transparent 1px 4px),repeating-linear-gradient(-45deg,rgb(0 0 0 / 22%) 0 1px,transparent 1px 4px)";

/** Grain, weave, glow, and falloff layers shared by the image and the stage. */
export function EffectLayers({ effects, radius = 0 }: { effects: EffectSettings; radius?: number }): React.JSX.Element | null {
  if (!hasEffects(effects)) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={radius > 0 ? { borderRadius: `${String(radius)}px` } : undefined}
    >
      {effects.noise > 0 ? <div className="absolute inset-0" style={{ background: noiseLayer, opacity: (effects.noise / 100) * 0.4 }} /> : null}
      {effects.texture > 0 ? (
        <div className="absolute inset-0 mix-blend-overlay" style={{ background: textureLayer, opacity: (effects.texture / 100) * 0.65 }} />
      ) : null}
      {effects.spotlight > 0 ? (
        <div
          className="absolute inset-0 mix-blend-soft-light"
          style={{ background: "radial-gradient(circle at 50% 34%,rgb(255 255 255 / 88%),transparent 62%)", opacity: effects.spotlight / 100 }}
        />
      ) : null}
      {effects.vignette > 0 ? (
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 50% 45%,transparent 38%,rgb(0 0 0 / 82%) 100%)", opacity: effects.vignette / 100 }}
        />
      ) : null}
    </div>
  );
}

/*
 * Handles sit *inside* the crop rectangle rather than straddling its edge: the
 * media box clips its overflow, and centred handles were being cut in half —
 * which is why the crop frame appeared to be missing entirely.
 */
const cropHandles: readonly { readonly id: string; readonly edges: readonly CropEdge[]; readonly className: string; readonly label: string }[] = [
  { id: "top", edges: ["top"], className: "left-1/2 top-0.5 h-1.5 w-9 -translate-x-1/2 cursor-ns-resize", label: "top edge" },
  { id: "bottom", edges: ["bottom"], className: "bottom-0.5 left-1/2 h-1.5 w-9 -translate-x-1/2 cursor-ns-resize", label: "bottom edge" },
  { id: "left", edges: ["left"], className: "left-0.5 top-1/2 h-9 w-1.5 -translate-y-1/2 cursor-ew-resize", label: "left edge" },
  { id: "right", edges: ["right"], className: "right-0.5 top-1/2 h-9 w-1.5 -translate-y-1/2 cursor-ew-resize", label: "right edge" },
  { id: "top-left", edges: ["top", "left"], className: "left-0.5 top-0.5 size-4 cursor-nwse-resize", label: "top left corner" },
  { id: "top-right", edges: ["top", "right"], className: "right-0.5 top-0.5 size-4 cursor-nesw-resize", label: "top right corner" },
  { id: "bottom-left", edges: ["bottom", "left"], className: "bottom-0.5 left-0.5 size-4 cursor-nesw-resize", label: "bottom left corner" },
  { id: "bottom-right", edges: ["bottom", "right"], className: "bottom-0.5 right-0.5 size-4 cursor-nwse-resize", label: "bottom right corner" },
];

/**
 * Direct-manipulation crop handles laid over the media.
 *
 * Dragging the frame is what people already expect from a crop tool; the
 * numeric sliders stay available in the panel for precision and for keyboard
 * users, who can reach the same values without a pointer.
 */
export function CropOverlay({
  image,
  displaySize,
  onChange,
}: {
  image: ImageSettings;
  displaySize: Size;
  onChange: (crop: CropInsets) => void;
}): React.JSX.Element {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; crop: CropInsets; edges: readonly CropEdge[] } | null>(null);

  function begin(event: React.PointerEvent<HTMLButtonElement>, edges: readonly CropEdge[]): void {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, crop: image.crop, edges };
  }

  function move(event: React.PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const delta = cropDragDelta(event.clientX - drag.startX, event.clientY - drag.startY, image);
    const next = { ...drag.crop };
    for (const edge of drag.edges) {
      const along = edge === "left" || edge === "right" ? delta.x : delta.y;
      const towardsCentre = edge === "left" || edge === "top" ? along : -along;
      const span = edge === "left" || edge === "right" ? displaySize.width : displaySize.height;
      if (span <= 0) continue;
      next[edge] = clampCropInset(drag.crop[edge] + towardsCentre / span);
    }
    onChange(normalizeCrop(next));
  }

  function end(event: React.PointerEvent<HTMLButtonElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-0 border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/45%),inset_0_0_0_1px_rgb(0_0_0/45%)]" />
      <div className="absolute inset-x-0 top-1/3 border-t border-white/45 mix-blend-difference" />
      <div className="absolute inset-x-0 top-2/3 border-t border-white/45 mix-blend-difference" />
      <div className="absolute inset-y-0 left-1/3 border-l border-white/45 mix-blend-difference" />
      <div className="absolute inset-y-0 left-2/3 border-l border-white/45 mix-blend-difference" />
      {cropHandles.map((handle) => (
        <button
          aria-label={`Drag the ${handle.label} to crop`}
          className={`pointer-events-auto absolute touch-none rounded-[2px] border border-stone-900/60 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] ${handle.className}`}
          key={handle.id}
          type="button"
          onPointerCancel={end}
          onPointerDown={(event) => begin(event, handle.edges)}
          onPointerMove={move}
          onPointerUp={end}
        />
      ))}
    </div>
  );
}

export function ShowcaseFrame({
  frame,
  radius,
  tiltX = 0,
  tiltY = 0,
  children,
}: {
  frame: FrameSettings;
  radius: number;
  tiltX?: number;
  tiltY?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const shadow = shadowValue(frame.shadow, frame.shadowColor, frame.shadowSpread, tiltX, tiltY);
  const dropShadow = dropShadowValue(frame.shadow, frame.shadowColor, frame.shadowSpread, tiltX, tiltY);

  if (!frame.frameEnabled || frame.frameId === "clean") {
    return <div className="overflow-hidden" style={{ borderRadius: `${String(radius)}px`, boxShadow: shadow }}>{children}</div>;
  }
  if (frame.frameId === "glass") {
    return (
      <div className="border border-white/55 bg-white/20 p-2 shadow-2xl backdrop-blur-xl" style={{ borderRadius: `${String(radius + 8)}px`, boxShadow: shadow }}>
        {children}
      </div>
    );
  }
  if (frame.frameId === "iphone") {
    return (
      <div className="relative rounded-[28px] border-[7px] border-[#171918] bg-[#171918] p-1.5" style={{ boxShadow: shadow }}>
        <div className="absolute left-1/2 top-1 z-20 h-3 w-16 -translate-x-1/2 rounded-full bg-black" />
        <div className="overflow-hidden" style={{ borderRadius: `${String(Math.max(14, radius))}px` }}>{children}</div>
      </div>
    );
  }
  if (frame.frameId === "tablet") {
    return (
      <div className="relative rounded-[22px] border-[8px] border-[#171918] bg-[#171918] p-1.5" style={{ boxShadow: shadow }}>
        <div className="absolute left-1/2 top-1 z-20 size-1.5 -translate-x-1/2 rounded-full bg-white/25" />
        <div className="overflow-hidden" style={{ borderRadius: `${String(Math.max(10, radius - 2))}px` }}>{children}</div>
      </div>
    );
  }
  if (frame.frameId === "laptop") {
    return (
      <div className="relative pb-4" style={{ filter: dropShadow }}>
        <div className="rounded-[10px] border-[7px] border-[#171918] bg-[#171918] p-1.5">
          <div className="overflow-hidden" style={{ borderRadius: `${String(Math.max(4, radius - 4))}px` }}>{children}</div>
        </div>
        <div className="absolute bottom-0 left-[-7%] h-3 w-[114%] rounded-b-xl bg-[#a4a7a0] shadow-lg" />
      </div>
    );
  }
  if (frame.frameId === "desktop") {
    return (
      <div className="relative pb-8" style={{ filter: dropShadow }}>
        <div className="rounded-[10px] border-[7px] border-[#171918] bg-[#171918] p-1.5">
          <div className="overflow-hidden" style={{ borderRadius: `${String(Math.max(4, radius - 4))}px` }}>{children}</div>
        </div>
        <div className="absolute bottom-0 left-1/2 h-7 w-16 -translate-x-1/2 bg-[#292c29]" />
        <div className="absolute bottom-[-2px] left-1/2 h-2 w-32 -translate-x-1/2 rounded-full bg-[#292c29]" />
      </div>
    );
  }
  return (
    <div className="overflow-hidden border border-stone-900/35 bg-[#171918] p-1.5" style={{ borderRadius: `${String(radius + 4)}px`, boxShadow: shadow }}>
      <div className="mb-1.5 flex items-center gap-1 px-1">
        <span className="size-1.5 rounded-full bg-red-400/80" />
        <span className="size-1.5 rounded-full bg-amber-300/80" />
        <span className="size-1.5 rounded-full bg-emerald-300/80" />
        <span className="ml-2 h-2 flex-1 rounded-sm bg-white/8" />
      </div>
      <div className="overflow-hidden" style={{ borderRadius: `${String(Math.max(3, radius - 4))}px` }}>{children}</div>
    </div>
  );
}

export function DemoScreenshot(): React.JSX.Element {
  return (
    <div className="flex size-full flex-col bg-[#f8f9f7] text-left">
      <div className="flex items-center gap-2 border-b border-stone-200 px-[3%] py-[2.5%]">
        <span className="size-2 rounded-full bg-[#d9ff43]" />
        <span className="text-[11px] font-semibold text-stone-700">CapKit workspace</span>
        <span className="ml-auto h-2 w-[18%] rounded-full bg-stone-200" />
      </div>
      <div className="grid flex-1 grid-cols-[22%_1fr] gap-[3%] p-[3%]">
        <div className="space-y-2 border-r border-stone-200 pr-[6%]">
          <div className="h-2 w-3/5 rounded bg-stone-800/80" />
          <div className="h-2 w-4/5 rounded bg-stone-200" />
          <div className="h-2 w-3/4 rounded bg-stone-200" />
          <div className="h-2 w-1/2 rounded bg-stone-200" />
        </div>
        <div className="flex flex-col gap-[3%]">
          <div className="h-[24%] rounded-md bg-[#d9ff43]/70" />
          <div className="grid flex-1 grid-cols-2 gap-[3%]">
            <div className="rounded-md bg-stone-100" />
            <div className="rounded-md bg-stone-200/80" />
          </div>
          <div className="h-2 w-2/5 rounded bg-stone-300" />
        </div>
      </div>
    </div>
  );
}
