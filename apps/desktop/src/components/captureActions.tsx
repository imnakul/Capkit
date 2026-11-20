import type { CompletionActionId, SnaphubSettings, ToolbarPlacement } from "../domain/settings";
import {
  Clipboard,
  Copy,
  Download,
  Pin,
  Presentation,
  SecurityCheck,
  TextSelection,
  type CapkitIconComponent,
  type CapkitIconProps,
} from "./icons";

/** One button that can live in either capture toolbar. */
export type RailItem = {
  id: string;
  label: string;
  icon: CapkitIconComponent;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type CompletionActionDefinition = {
  id: CompletionActionId;
  label: string;
  icon: CapkitIconComponent;
  /** Only listed when the OS can read text from images. */
  needsTextRecognition: boolean;
};

export const completionActionCatalog: readonly CompletionActionDefinition[] = [
  { id: "copy", label: "Copy", icon: Clipboard, needsTextRecognition: false },
  { id: "copy-and-save", label: "Copy & Save", icon: CopyAndSaveIcon, needsTextRecognition: false },
  { id: "save", label: "Save", icon: Download, needsTextRecognition: false },
  { id: "pin", label: "Pin", icon: Pin, needsTextRecognition: false },
  { id: "showcase", label: "Save & Showcase", icon: Presentation, needsTextRecognition: false },
  { id: "copy-text", label: "Copy text", icon: TextSelection, needsTextRecognition: true },
  { id: "find-sensitive", label: "Find sensitive text", icon: SecurityCheck, needsTextRecognition: true },
];

export type CompletionHandlers = {
  copyShortcut: string;
  copyAndSaveShortcut: string;
  saveShortcut: string;
  disabled: boolean;
  onAction: (id: CompletionActionId) => void;
  /** False hides Copy text and Find sensitive text. */
  canReadText: boolean;
};

/** The enabled finishing actions that belong to one toolbar, in catalog order. */
export function completionRailItems(
  actions: SnaphubSettings["toolbar"]["actions"],
  placement: ToolbarPlacement,
  handlers: CompletionHandlers,
): RailItem[] {
  const shortcuts: Partial<Record<CompletionActionId, string>> = {
    copy: handlers.copyShortcut,
    "copy-and-save": handlers.copyAndSaveShortcut,
    save: handlers.saveShortcut,
  };
  return completionActionCatalog
    .filter((action) => actions[action.id].enabled && actions[action.id].placement === placement)
    .filter((action) => handlers.canReadText || !action.needsTextRecognition)
    .map((action) => {
      const shortcut = shortcuts[action.id];
      return {
        id: `action-${action.id}`,
        label: action.label,
        icon: action.icon,
        ...(shortcut === undefined ? {} : { shortcut }),
        disabled: handlers.disabled,
        onSelect: () => handlers.onAction(action.id),
      };
    });
}

function CopyAndSaveIcon({ className }: CapkitIconProps): React.JSX.Element {
  return (
    <span className={`relative inline-flex size-[18px] items-center justify-center ${className ?? ""}`}>
      <Copy aria-hidden="true" className="absolute left-0 top-0" size={14} strokeWidth={2} />
      <Download aria-hidden="true" className="absolute bottom-0 right-0" size={14} strokeWidth={2} />
    </span>
  );
}
