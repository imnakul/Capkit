import { Copy, Tick } from "../icons";
import { IconSwapButton } from "./IconSwapButton";

type CopyButtonProps = {
  label: string;
  copied: boolean;
  onCopy: () => void;
};

/** Hover-revealed copy action for a card; the copy icon glides into a check when `copied`. */
export function CopyButton({ label, copied, onCopy }: CopyButtonProps): React.JSX.Element {
  return (
    <IconSwapButton
      active={copied}
      activeIcon={<Tick size={14} />}
      idleIcon={<Copy size={14} />}
      label={label}
      offsetRightClass="right-2"
      statusText={{ off: "Copy", on: "Copied" }}
      onPress={onCopy}
    />
  );
}
