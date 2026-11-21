import { Fragment, useState } from "react";
import {
  captureToolbarToolIds,
  type CaptureToolbarToolId,
  type CompletionActionId,
  type CompletionActionSetting,
  type SnaphubSettings,
  type ToolbarPlacement,
} from "../../domain/settings";
import { LAYER } from "../layers";
import { Switch } from "../ui/Switch";
import { completionActionCatalog } from "../captureActions";
import { getToolbarTool, toolbarCatalog } from "../toolbarCatalog";
import {
  Add as Plus,
  Cancel as X,
  Grip as GripVertical,
  List,
  Rows as Rows3,
  type CapkitIconComponent,
} from "../icons";

type ToolbarConfigurationProps = {
  toolbar: SnaphubSettings["toolbar"];
  onChange: (toolbar: SnaphubSettings["toolbar"]) => void;
  /** Keys the capture screen already uses (Select, Copy, Save…), so a tool can't take them. */
  reservedKeys?: readonly string[];
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
  reservedKeys = ["V"],
}: ToolbarConfigurationProps): React.JSX.Element {
  const keyedTools: CaptureToolbarToolId[] = toolbar.mode === "group"
    ? [...new Set(toolbar.groups.flat())]
    : captureToolbarToolIds.filter((toolId) => toolbar.individual[toolId]);

  function setToolKey(toolId: CaptureToolbarToolId, key: string | null): void {
    const others = Object.fromEntries(Object.entries(toolbar.keys).filter(([id]) => id !== toolId));
    onChange({ ...toolbar, keys: key === null ? others : { ...others, [toolId]: key } });
  }

  const [dragging, setDragging] = useState<PointerDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function setMode(mode: "individual" | "group"): void {
    onChange({ ...toolbar, mode });
  }

  function setToolPlacement(toolId: CaptureToolbarToolId, placement: ToolbarPlacement): void {
    const others = toolbar.verticalTools.filter((id) => id !== toolId);
    onChange({ ...toolbar, verticalTools: placement === "vertical" ? [...others, toolId] : others });
  }

  function setAction(actionId: CompletionActionId, next: CompletionActionSetting): void {
    onChange({ ...toolbar, actions: { ...toolbar.actions, [actionId]: next } });
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
        <p className="max-w-lg text-[12px] leading-4 text-content/60">
          Select stays fixed as the first recovery tool. Configure everything that follows it. In Group mode, groups always sit in the horizontal toolbar.
        </p>
        <div aria-label="Toolbar organization" className="grid grid-cols-2 rounded-md bg-content/6 p-0.5" role="radiogroup">
          <ModeButton active={toolbar.mode === "individual"} icon={List} label="Individual" onClick={() => setMode("individual")} />
          <ModeButton active={toolbar.mode === "group"} icon={Rows3} label="Group" onClick={() => setMode("group")} />
        </div>
      </div>

      {toolbar.mode === "individual" ? (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {toolbarCatalog.map((tool) => (
            <ItemRow
              enabled={toolbar.individual[tool.id]}
              icon={tool.icon}
              key={tool.id}
              label={tool.label}
              placement={toolbar.verticalTools.includes(tool.id) ? "vertical" : "horizontal"}
              onEnabledChange={(checked) => onChange({ ...toolbar, individual: { ...toolbar.individual, [tool.id]: checked } })}
              onPlacementChange={(placement) => setToolPlacement(tool.id, placement)}
            />
          ))}
        </div>
      ) : (
        <div>
          <div className="mb-4 grid gap-px overflow-hidden rounded-lg border border-content/10 bg-content/10 sm:grid-cols-3">
            <GroupRule number="01" title="Each row is one group" description="One primary toolbar slot opens the tools in that row." />
            <GroupRule number="02" title="Rows mean enabled" description="Anything left in Available tools stays disabled." />
            <GroupRule number="03" title="First is the starting tool" description="A group starts on its first tool, then remembers the one you used last." />
          </div>

          <div className="space-y-2">
            {toolbar.groups.map((group, rowIndex) => {
              const firstTool = group[0] === undefined ? null : getToolbarTool(group[0]);
              return (
                <div
                  aria-label={`Toolbar group ${String(rowIndex + 1)}`}
                  className={`grid min-h-16 grid-cols-[96px_1fr_32px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-120 motion-reduce:transition-none ${dropTarget?.row === rowIndex ? "border-accent bg-accent/10" : "border-content/10 bg-content/4"}`}
                  data-toolbar-row={rowIndex}
                  key={`group-${String(rowIndex)}`}
                >
                  <div>
                    <p className="text-[11px] font-medium tabular-nums text-content/45">Group {String(rowIndex + 1).padStart(2, "0")}</p>
                    <p className="mt-1 truncate text-[11px] text-content/60">{firstTool === null ? "Drop a default" : `Default: ${firstTool.label}`}</p>
                  </div>
                  <div className="flex min-h-9 flex-wrap items-center gap-1.5">
                    {group.length === 0 ? <span className="text-[12px] text-content/45">Drop tools here</span> : null}
                    {group.map((toolId, toolIndex) => (
                      <Fragment key={toolId}>
                        {dropTarget?.row === rowIndex && dropTarget.index === toolIndex && draggingToolId !== toolId ? <span aria-hidden="true" className="h-7 w-0.5 rounded-full bg-accent" /> : null}
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
                    {dropTarget?.row === rowIndex && dropTarget.index === group.length ? <span aria-hidden="true" className="h-7 w-0.5 rounded-full bg-accent" /> : null}
                  </div>
                  <button aria-label={`Remove toolbar group ${String(rowIndex + 1)}`} className="grid size-7 place-items-center rounded-md text-content/45 outline-none transition-colors duration-120 hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none" type="button" onClick={() => removeRow(rowIndex)}><X aria-hidden="true" size={14} /></button>
                </div>
              );
            })}
          </div>

          <button aria-label="Add toolbar group" className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-content/20 text-[12px] font-medium text-content/60 outline-none transition-colors duration-120 hover:border-content/40 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none" disabled={toolbar.groups.length >= 8} type="button" onClick={addRow}><Plus aria-hidden="true" size={13} />Add group</button>

          <div className="mt-5 border-t border-content/10 pt-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold text-content">Available tools</p><p className="text-[12px] text-content/45">Drag into a row to enable</p></div>
            <div
              className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-content/15 bg-content/4 p-2"
              data-toolbar-available="true"
            >
              {disabledTools.length === 0 ? <span className="text-[12px] text-content/45">Every tool is enabled</span> : disabledTools.map((toolId) => (
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

      <div className="mt-6 border-t border-content/10 pt-4">
        <p className="text-[13px] font-semibold text-content">Tool keys</p>
        <p className="mt-1 max-w-lg text-[12px] leading-4 text-content/60">
          Give a tool its own letter or number. Tools left on Auto use 1–9 and 0 in toolbar order. Click a field, then press a key; Backspace returns it to Auto.
        </p>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {keyedTools.map((toolId) => {
            const tool = getToolbarTool(toolId);
            const taken = (key: string): string | null => {
              if (reservedKeys.some((reserved) => reserved.toUpperCase() === key)) return "Used by the capture screen";
              const other = keyedTools.find((candidate) => candidate !== toolId && toolbar.keys[candidate] === key);
              return other === undefined ? null : `Used by ${getToolbarTool(other).label}`;
            };
            return <ToolKeyField key={toolId} label={tool.label} icon={tool.icon} value={toolbar.keys[toolId] ?? null} validate={taken} onChange={(key) => setToolKey(toolId, key)} />;
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-content/10 pt-4">
        <p className="text-[13px] font-semibold text-content">Finishing actions</p>
        <p className="mt-1 max-w-lg text-[12px] leading-4 text-content/60">
          Choose which actions appear and which toolbar holds them. Copy, Save and Copy &amp; Save keep their keyboard shortcuts even when hidden.
        </p>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {completionActionCatalog.map((action) => {
            const setting = toolbar.actions[action.id];
            return (
              <ItemRow
                enabled={setting.enabled}
                icon={action.icon}
                key={action.id}
                label={action.label}
                note={action.needsTextRecognition ? "Only where Windows can read text" : undefined}
                placement={setting.placement}
                onEnabledChange={(enabled) => setAction(action.id, { ...setting, enabled })}
                onPlacementChange={(placement) => setAction(action.id, { ...setting, placement })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type ToolKeyFieldProps = {
  label: string;
  icon: CapkitIconComponent;
  value: string | null;
  /** Returns why a key can't be used, or null when it is free. */
  validate: (key: string) => string | null;
  onChange: (key: string | null) => void;
};

function ToolKeyField({ label, icon: Icon, value, validate, onChange }: ToolKeyFieldProps): React.JSX.Element {
  const [problem, setProblem] = useState<string | null>(null);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Tab" || event.key === "Escape" || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      setProblem(null);
      onChange(null);
      return;
    }
    const key = event.key.toUpperCase();
    if (!/^[A-Z0-9]$/.test(key)) {
      setProblem("Use a letter or number");
      return;
    }
    const reason = validate(key);
    setProblem(reason);
    if (reason === null) onChange(key);
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-content/8 py-2 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-content">
        <Icon aria-hidden="true" className="shrink-0 text-content/60" size={16} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {problem === null ? null : <span className="text-[11px] text-red-500" role="status">{problem}</span>}
        <button
          aria-label={`${label} key`}
          className="h-7 min-w-14 rounded-md border border-content/15 bg-content/4 px-2 text-center font-mono text-[12px] text-content outline-none transition-colors duration-150 hover:bg-content/8 focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
          type="button"
          onBlur={() => setProblem(null)}
          onKeyDown={handleKeyDown}
        >
          {value ?? "Auto"}
        </button>
      </span>
    </div>
  );
}

type ItemRowProps = {
  label: string;
  icon: CapkitIconComponent;
  enabled: boolean;
  placement: ToolbarPlacement;
  note?: string | undefined;
  onEnabledChange: (enabled: boolean) => void;
  onPlacementChange: (placement: ToolbarPlacement) => void;
};
function ItemRow({ label, icon: Icon, enabled, placement, note, onEnabledChange, onPlacementChange }: ItemRowProps): React.JSX.Element {
  return (
    <div className="flex min-h-10 items-center gap-2.5 border-b border-content/8 py-2">
      <Icon aria-hidden="true" className={enabled ? "text-content" : "text-content/45"} size={14} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-content">{label}</span>
        {note === undefined ? null : <span className="block truncate text-[11px] text-content/45">{note}</span>}
      </span>
      <PlacementSwitch disabled={!enabled} label={label} value={placement} onChange={onPlacementChange} />
      <Switch checked={enabled} label={`Show ${label}`} onChange={onEnabledChange} />
    </div>
  );
}

const placementLabels: Record<ToolbarPlacement, string> = { horizontal: "Horizontal", vertical: "Vertical" };
const placementKeys: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

type PlacementSwitchProps = { label: string; value: ToolbarPlacement; disabled: boolean; onChange: (placement: ToolbarPlacement) => void };
/** Two-option radio group; arrow keys switch sides like a native radio group. */
function PlacementSwitch({ label, value, disabled, onChange }: PlacementSwitchProps): React.JSX.Element {
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (!placementKeys.has(event.key)) return;
    event.preventDefault();
    const next: ToolbarPlacement = value === "horizontal" ? "vertical" : "horizontal";
    onChange(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-placement="${next}"]`)?.focus();
  }
  return (
    <div aria-label={`${label} toolbar`} className="grid shrink-0 grid-cols-2 rounded-md bg-content/6 p-0.5" role="radiogroup">
      {(["horizontal", "vertical"] as const).map((option) => (
        <button
          aria-checked={value === option}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-content/60 outline-none transition-colors duration-150 ease-track focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 aria-checked:bg-content/8 aria-checked:text-content motion-reduce:transition-none"
          data-placement={option}
          disabled={disabled}
          key={option}
          role="radio"
          tabIndex={value === option ? 0 : -1}
          type="button"
          onClick={() => onChange(option)}
          onKeyDown={onKeyDown}
        >
          {placementLabels[option]}
        </button>
      ))}
    </div>
  );
}

type ModeButtonProps = { active: boolean; icon: typeof List; label: string; onClick: () => void };
function ModeButton({ active, icon: Icon, label, onClick }: ModeButtonProps): React.JSX.Element {
  return <button aria-label={`Use ${label} toolbar mode`} aria-checked={active} className="flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium text-content/60 outline-none transition-colors duration-150 ease-track focus-visible:ring-2 focus-visible:ring-accent/50 aria-checked:bg-content/8 aria-checked:text-content motion-reduce:transition-none" role="radio" type="button" onClick={onClick}><Icon aria-hidden="true" size={12} />{label}</button>;
}

type GroupRuleProps = { number: string; title: string; description: string };
function GroupRule({ number, title, description }: GroupRuleProps): React.JSX.Element {
  return <div className="bg-background-base p-3"><span className="text-[11px] font-medium tabular-nums text-content/45">{number}</span><p className="mt-1 text-[12px] font-semibold text-content">{title}</p><p className="mt-1 text-[11px] leading-4 text-content/60">{description}</p></div>;
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
  return <button aria-label={`${tool.label}${isDefault ? ", group default" : ""}. Drag to reorder; Delete disables`} className={`flex h-8 touch-none cursor-grab items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium outline-none transition-[transform,opacity,background-color] duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent/50 active:cursor-grabbing motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${isDefault ? "border-accent/55 bg-accent/10 text-content" : "border-content/10 bg-content/4 text-content/80"} ${dragging ? "scale-95 opacity-35" : "opacity-100"}`} data-toolbar-index={toolIndex} data-toolbar-pill="true" data-toolbar-row={rowIndex ?? undefined} data-toolbar-tool={toolId} type="button" onKeyDown={onKeyDown} onPointerCancel={onPointerCancel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}><GripVertical aria-hidden="true" className="text-content/45" size={11} /><Icon aria-hidden="true" size={12} />{tool.label}{isDefault ? <span className="ml-0.5 rounded bg-content/8 px-1 py-0.5 text-[11px]">Default</span> : null}</button>;
}

function DragPreview({ toolId, x, y }: { toolId: CaptureToolbarToolId; x: number; y: number }): React.JSX.Element {
  const tool = getToolbarTool(toolId);
  const Icon = tool.icon;
  return <div aria-hidden="true" className="pointer-events-none fixed flex h-8 items-center gap-1.5 rounded-md border border-accent/60 bg-background-base px-2 text-[11px] font-medium text-content shadow-xl" style={{ left: x + 12, top: y + 12, zIndex: LAYER.toast }}><GripVertical size={11} /><Icon size={12} />{tool.label}</div>;
}
