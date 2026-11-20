import { Star } from "../icons";
import { IconSwapButton } from "./IconSwapButton";

type FavoriteButtonProps = {
  label: string;
  favorite: boolean;
  onToggle: () => void;
};

/**
 * Star action that sits left of the copy button. Outline on hover; morphs to a filled
 * star when `favorite`, and stays visible then so favourites are easy to spot.
 */
export function FavoriteButton({ label, favorite, onToggle }: FavoriteButtonProps): React.JSX.Element {
  return (
    <IconSwapButton
      active={favorite}
      activeIcon={<Star className="fill-current" size={14} />}
      idleIcon={<Star size={14} />}
      label={label}
      offsetRightClass="right-11"
      persistWhenActive
      statusText={{ off: "Not a favourite", on: "Favourite" }}
      onPress={onToggle}
    />
  );
}
