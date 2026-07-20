import { GripVertical, List, Plus, Rows3, X } from "lucide-react";
import { Fragment, useState } from "react";
import {
  captureToolbarToolIds,
  type CaptureToolbarToolId,
  type SnaphubSettings,
} from "../../domain/settings";
import { getToolbarTool, toolbarCatalog } from "../toolbarCatalog";

type ToolbarConfigurationProps = {
  toolbar: SnaphubSettings["toolbar"];
  onChange: (toolbar: SnaphubSettings["toolbar"]) => void;
};

type DropTarget = { row: number; index: number };
type PointerDrag = {
  toolId: CaptureToolbarToolId;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
};
type DropDestination = { kind: "row"; row: number; index: number } | { kind: "available" };

export function ToolbarConfiguration({
  toolbar,
  onChange,
}: ToolbarConfigurationProps): React.JSX.Element {
  const [dragging, setDragging] = useState<PointerDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function setMode(mode: "individual" | "group"): void {
    onChange({ ...toolbar, mode });
  }

  function moveTool(toolId: CaptureToolbarToolId, rowIndex: number, targetIndex: number): void {
    const sourceRowIndex = toolbar.groups.findIndex((group) => group.includes(toolId));
    const sourceToolIndex = sourceRowIndex < 0 ? -1 : toolbar.groups[sourceRowIndex]?.indexOf(toolId) ?? -1;
    const groups = toolbar.groups.map((group) => group.filter((id) => id !== toolId));
    const targetRow = groups[rowIndex];
    if (targetRow === undefined) return;
    const adjustedIndex = sourceRowIndex === rowIndex && sourceToolIndex >= 0 && sourceToolIndex < targetIndex
      ? targetIndex - 1
      : targetIndex;
    targetRow.splice(Math.max(0, Math.min(adjustedIndex, targetRow.length)), 0, toolId);
    onChange({ ...toolbar, groups });
  }

  function removeRow(rowIndex: number): void {
    onChange({ ...toolbar, groups: toolbar.groups.filter((_, index) => index !== rowIndex) });
  }

  function disableTool(toolId: CaptureToolbarToolId): void {
    onChange({
      ...toolbar,
      groups: toolbar.groups.map((group) => group.filter((id) => id !== toolId)),
    });
  }

  function addRow(): void {
    if (toolbar.groups.length >= 8) return;
    onChange({ ...toolbar, groups: [...toolbar.groups, []] });
  }

  function resolveDropDestination(clientX: number, clientY: number, toolId: CaptureToolbarToolId): DropDestination | null {
    const hit = document.elementFromPoint(clientX, clientY);
    if (hit === null) return null;
    const availableElement = hit.closest("[data-toolbar-available]");
    if (availableElement instanceof HTMLElement) return { kind: "available" };
    const rowElement = hit.closest("[data-toolbar-row]");
    if (!(rowElement instanceof HTMLElement)) return null;
    const row = Number(rowElement.dataset.toolbarRow);
    if (!Number.isInteger(row) || toolbar.groups[row] === undefined) return null;
    const pills = Array.from(rowElement.querySelectorAll<HTMLElement>("[data-toolbar-pill]"))
      .filter((pill) => pill.dataset.toolbarTool !== toolId);
    let index = toolbar.groups[row].length;
    for (const pill of pills) {
      const bounds = pill.getBoundingClientRect();
      const pillIndex = Number(pill.dataset.toolbarIndex);
      const before = clientY < bounds.top + bounds.height / 2
        || (clientY <= bounds.bottom && clientX < bounds.left + bounds.width / 2);
      if (before && Number.isInteger(pillIndex)) {
        index = pillIndex;
        break;
      }
    }
    return { kind: "row", row, index };
  }

  function beginPointerDrag(event: React.PointerEvent<HTMLButtonElement>, toolId: CaptureToolbarToolId): void {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      toolId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    });
  }

  function continuePointerDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (dragging?.pointerId !== event.pointerId) return;
    const active = dragging.active || Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) >= 4;
    if (active) event.preventDefault();
    const next = { ...dragging, x: event.clientX, y: event.clientY, active };
    setDragging(next);
    if (!active) return;
    const destination = resolveDropDestination(event.clientX, event.clientY, dragging.toolId);
    setDropTarget(destination?.kind === "row" ? { row: destination.row, index: destination.index } : null);
  }

  function finishPointerDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (dragging?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragging.active) {
      const destination = resolveDropDestination(event.clientX, event.clientY, dragging.toolId);
      if (destination?.kind === "row") moveTool(dragging.toolId, destination.row, destination.index);
      else if (destination?.kind === "available") disableTool(dragging.toolId);
    }
    setDragging(null);
    setDropTarget(null);
  }

  function cancelPointerDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (dragging?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
    setDropTarget(null);
  }

  function keyboardMove(
    event: React.KeyboardEvent<HTMLButtonElement>,
    toolId: CaptureToolbarToolId,
    rowIndex: number | null,
    toolIndex: number,
  ): void {
    if (rowIndex === null && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (toolbar.groups.length === 0) {
        onChange({ ...toolbar, groups: [[toolId]] });
      } else {
        moveTool(toolId, 0, toolbar.groups[0]?.length ?? 0);
      }
      return;
    }
    if (rowIndex !== null && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      disableTool(toolId);
      return;
    }
    if (!event.altKey || rowIndex === null) return;
    const horizontalDelta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const verticalDelta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (horizontalDelta === 0 && verticalDelta === 0) return;
    event.preventDefault();
    if (horizontalDelta !== 0) {
      moveTool(toolId, rowIndex, Math.max(0, toolIndex + horizontalDelta));
    } else {
      const nextRow = Math.max(0, Math.min(toolbar.groups.length - 1, rowIndex + verticalDelta));
      moveTool(toolId, nextRow, toolbar.groups[nextRow]?.length ?? 0);
    }
  }

  const assigned = new Set(toolbar.groups.flat());
  const disabledTools = captureToolbarToolIds.filter((toolId) => !assigned.has(toolId));
  const draggingToolId = dragging?.toolId ?? null;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="max-w-lg text-[10px] leading-4 text-stone-500 dark:text-stone-400">
          Select stays fixed as the first recovery tool. Configure everything that follows it.
        </p>
        <div aria-label="Toolbar organization" className="grid grid-cols-2 rounded-md border border-stone-300 bg-stone-100 p-1 dark:border-white/10 dark:bg-[#20211f]" role="radiogroup">
          <ModeButton active={toolbar.mode === "individual"} icon={List} label="Individual" onClick={() => setMode("individual")} />
          <ModeButton active={toolbar.mode === "group"} icon={Rows3} label="Group" onClick={() => setMode("group")} />
        </div>
      </div>

      {toolbar.mode === "individual" ? (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {toolbarCatalog.map((tool) => {
            const Icon = tool.icon;
            const enabled = toolbar.individual[tool.id];
            return (
              <label className="flex min-h-10 cursor-pointer items-center gap-2.5 border-b border-stone-200/80 py-2 dark:border-white/7" key={tool.id}>
                <Icon aria-hidden="true" className={enabled ? "text-[var(--snaphub-accent)]" : "text-stone-400 dark:text-stone-600"} size={14} />
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-stone-700 dark:text-stone-300">{tool.label}</span>
                <CompactToggle checked={enabled} label={`Show ${tool.label}`} onChange={(checked) => onChange({ ...toolbar, individual: { ...toolbar.individual, [tool.id]: checked } })} />
              </label>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="mb-4 grid gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 sm:grid-cols-3 dark:border-white/9 dark:bg-white/9">
            <GroupRule number="01" title="Each row is one group" description="One primary toolbar slot opens the tools in that row." />
            <GroupRule number="02" title="Rows mean enabled" description="Anything left in Available tools stays disabled." />
            <GroupRule number="03" title="First means default" description="Order tools by dragging; the first tool represents the group." />
          </div>

          <div className="space-y-2">
            {toolbar.groups.map((group, rowIndex) => {
              const firstTool = group[0] === undefined ? null : getToolbarTool(group[0]);
              return (
                <div
                  aria-label={`Toolbar group ${String(rowIndex + 1)}`}
                  className={`grid min-h-16 grid-cols-[96px_1fr_32px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${dropTarget?.row === rowIndex ? "border-[var(--snaphub-accent)] bg-[color-mix(in_srgb,var(--snaphub-accent)_7%,transparent)]" : "border-stone-200 bg-white dark:border-white/9 dark:bg-[#2b2c29]"}`}
                  data-toolbar-row={rowIndex}
                  key={`group-${String(rowIndex)}`}
                >
                  <div>
                    <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-400">Group {String(rowIndex + 1).padStart(2, "0")}</p>
                    <p className="mt-1 truncate text-[9px] text-stone-500 dark:text-stone-500">{firstTool === null ? "Drop a default" : `Default · ${firstTool.label}`}</p>
                  </div>
                  <div className="flex min-h-9 flex-wrap items-center gap-1.5">
                    {group.length === 0 ? <span className="text-[10px] text-stone-400 dark:text-stone-600">Drop tools here</span> : null}
                    {group.map((toolId, toolIndex) => (
                      <Fragment key={toolId}>
                        {dropTarget?.row === rowIndex && dropTarget.index === toolIndex && draggingToolId !== toolId ? <span aria-hidden="true" className="h-7 w-0.5 rounded-full bg-[var(--snaphub-accent)] shadow-[0_0_8px_var(--snaphub-accent)]" /> : null}
                        <ToolPill
                          dragging={draggingToolId === toolId}
                          isDefault={toolIndex === 0}
                          rowIndex={rowIndex}
                          toolId={toolId}
                          toolIndex={toolIndex}
                          onKeyDown={(event) => keyboardMove(event, toolId, rowIndex, toolIndex)}
                          onPointerCancel={cancelPointerDrag}
                          onPointerDown={(event) => beginPointerDrag(event, toolId)}
                          onPointerMove={continuePointerDrag}
                          onPointerUp={finishPointerDrag}
                        />
                      </Fragment>
                    ))}
                    {dropTarget?.row === rowIndex && dropTarget.index === group.length ? <span aria-hidden="true" className="h-7 w-0.5 rounded-full bg-[var(--snaphub-accent)] shadow-[0_0_8px_var(--snaphub-accent)]" /> : null}
                  </div>
                  <button aria-label={`Remove toolbar group ${String(rowIndex + 1)}`} className="grid size-7 place-items-center rounded-md text-stone-400 outline-none transition hover:bg-red-500/10 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:hover:text-red-300" type="button" onClick={() => removeRow(rowIndex)}><X aria-hidden="true" size={14} /></button>
                </div>
              );
            })}
          </div>

          <button aria-label="Add toolbar group" className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 text-[10px] font-semibold text-stone-500 outline-none transition hover:border-stone-500 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/12 dark:text-stone-400 dark:hover:border-white/25 dark:hover:text-stone-200" disabled={toolbar.groups.length >= 8} type="button" onClick={addRow}><Plus aria-hidden="true" size={13} />Add group</button>

          <div className="mt-5 border-t border-stone-200 pt-4 dark:border-white/8">
            <div className="mb-2 flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">Available tools</p><p className="text-[9px] text-stone-400">Drag into a row to enable</p></div>
            <div
              className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-stone-300 bg-stone-100/60 p-2 transition-colors dark:border-white/10 dark:bg-black/10"
              data-toolbar-available="true"
            >
              {disabledTools.length === 0 ? <span className="text-[10px] text-stone-400">Every tool is enabled</span> : disabledTools.map((toolId) => (
                <ToolPill
                  dragging={draggingToolId === toolId}
                  isDefault={false}
                  key={toolId}
                  rowIndex={null}
                  toolId={toolId}
                  toolIndex={0}
                  onKeyDown={(event) => keyboardMove(event, toolId, null, 0)}
                  onPointerCancel={cancelPointerDrag}
                  onPointerDown={(event) => beginPointerDrag(event, toolId)}
                  onPointerMove={continuePointerDrag}
                  onPointerUp={finishPointerDrag}
                />
              ))}
            </div>
          </div>
          {dragging?.active === true ? <DragPreview toolId={dragging.toolId} x={dragging.x} y={dragging.y} /> : null}
        </div>
      )}
    </div>
  );
}

type ModeButtonProps = { active: boolean; icon: typeof List; label: string; onClick: () => void };
function ModeButton({ active, icon: Icon, label, onClick }: ModeButtonProps): React.JSX.Element {
  return <button aria-label={`Use ${label} toolbar mode`} aria-checked={active} className="flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-semibold text-stone-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-checked:bg-white aria-checked:text-stone-900 dark:text-stone-400 dark:aria-checked:bg-white/9 dark:aria-checked:text-white" role="radio" type="button" onClick={onClick}><Icon aria-hidden="true" size={12} />{label}</button>;
}

type GroupRuleProps = { number: string; title: string; description: string };
function GroupRule({ number, title, description }: GroupRuleProps): React.JSX.Element {
  return <div className="bg-white p-3 dark:bg-[#2b2c29]"><span className="font-mono text-[9px] font-bold text-[var(--snaphub-accent)]">{number}</span><p className="mt-1 text-[10px] font-semibold text-stone-700 dark:text-stone-200">{title}</p><p className="mt-1 text-[9px] leading-4 text-stone-500 dark:text-stone-400">{description}</p></div>;
}

type ToolPillProps = {
  toolId: CaptureToolbarToolId;
  rowIndex: number | null;
  toolIndex: number;
  isDefault: boolean;
  dragging: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
};
function ToolPill({ toolId, rowIndex, toolIndex, isDefault, dragging, onKeyDown, onPointerCancel, onPointerDown, onPointerMove, onPointerUp }: ToolPillProps): React.JSX.Element {
  const tool = getToolbarTool(toolId);
  const Icon = tool.icon;
  return <button aria-label={`${tool.label}${isDefault ? ", group default" : ""}. Drag to reorder; Delete disables`} className={`flex h-8 touch-none cursor-grab items-center gap-1.5 rounded-md border px-2 text-[9px] font-semibold outline-none transition-[transform,opacity,border-color,background-color] duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] active:cursor-grabbing ${isDefault ? "border-[var(--snaphub-accent)]/55 bg-[color-mix(in_srgb,var(--snaphub-accent)_9%,white)] text-stone-800 dark:bg-[color-mix(in_srgb,var(--snaphub-accent)_12%,#2b2c29)] dark:text-stone-100" : "border-stone-200 bg-stone-50 text-stone-600 dark:border-white/10 dark:bg-[#343532] dark:text-stone-300"} ${dragging ? "scale-95 opacity-35" : "opacity-100"}`} data-toolbar-index={toolIndex} data-toolbar-pill="true" data-toolbar-row={rowIndex ?? undefined} data-toolbar-tool={toolId} type="button" onKeyDown={onKeyDown} onPointerCancel={onPointerCancel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}><GripVertical aria-hidden="true" className="text-stone-400" size={11} /><Icon aria-hidden="true" size={12} />{tool.label}{isDefault ? <span className="ml-0.5 rounded bg-black/6 px-1 py-0.5 font-mono text-[7px] uppercase tracking-wide dark:bg-white/8">Default</span> : null}</button>;
}

function DragPreview({ toolId, x, y }: { toolId: CaptureToolbarToolId; x: number; y: number }): React.JSX.Element {
  const tool = getToolbarTool(toolId);
  const Icon = tool.icon;
  return <div aria-hidden="true" className="pointer-events-none fixed z-[200] flex h-8 items-center gap-1.5 rounded-md border border-[var(--snaphub-accent)]/60 bg-[#242522] px-2 text-[9px] font-semibold text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)]" style={{ left: x + 12, top: y + 12 }}><GripVertical size={11} /><Icon size={12} />{tool.label}</div>;
}

type CompactToggleProps = { checked: boolean; label: string; onChange: (checked: boolean) => void };
function CompactToggle({ checked, label, onChange }: CompactToggleProps): React.JSX.Element {
  return <span className="relative shrink-0"><input aria-label={label} checked={checked} className="peer sr-only" role="switch" type="checkbox" onChange={(event) => onChange(event.currentTarget.checked)} /><span className="block h-4 w-7 rounded-full bg-stone-300 transition peer-checked:bg-[var(--snaphub-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-stone-900 peer-focus-visible:ring-offset-2 dark:bg-stone-700 dark:peer-focus-visible:ring-white" /><span className="absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3 peer-checked:bg-[#171815]" /></span>;
}
