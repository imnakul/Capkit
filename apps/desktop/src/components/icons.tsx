import {
  Add01Icon,
  ArrowUpRight01Icon,
  AspectRatioIcon,
  BlurIcon,
  Cancel01Icon,
  ChevronDownIcon,
  CircleIcon,
  ClipboardIcon,
  Clock03Icon,
  ColorPickerIcon,
  ComputerIcon,
  Copy01Icon,
  CropIcon,
  CurvyRightDirectionIcon,
  Cursor01Icon,
  DashboardSquare02Icon,
  Delete02Icon,
  Download04Icon,
  EraserIcon,
  Film01Icon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  FocusPointIcon,
  FolderAddIcon,
  FolderCogIcon,
  FolderOpenIcon,
  FrameIcon,
  GridIcon,
  GripVerticalIcon,
  HandIcon,
  HardDriveIcon,
  HashtagIcon,
  HighlighterIcon,
  Image02Icon,
  ImageAdd02Icon,
  KeyboardIcon,
  Layers02Icon,
  LayoutThreeRowIcon,
  ListViewIcon,
  LockIcon,
  MagicWand02Icon,
  MinusSignIcon,
  Moon02Icon,
  PaintBrush02Icon,
  PencilEdit01Icon,
  PinIcon,
  Presentation01Icon,
  Mic01Icon,
  PauseIcon,
  PlayIcon,
  RecordIcon,
  Speaker01Icon,
  Video01Icon,
  StopCircleIcon,
  Redo03Icon,
  RefreshIcon,
  RotateClockwiseIcon,
  RotateLeft02Icon,
  SaveIcon,
  ScanIcon,
  ScrollVerticalIcon,
  SearchAreaIcon,
  Settings02Icon,
  SlidersHorizontalIcon,
  SmartPhone01Icon,
  SparklesIcon,
  SplinePointerIcon,
  SpotlightIcon,
  SquareIcon,
  Sun03Icon,
  Tablet01Icon,
  TextIcon,
  Tick02Icon,
  Undo03Icon,
  Upload04Icon,
  ViewIcon,
  ViewOffSlashIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";
import {
  HugeiconsIcon,
  type HugeiconsIconProps,
  type IconSvgElement,
} from "@hugeicons/react";
import type { ComponentType } from "react";

export type CapkitIconProps = Omit<HugeiconsIconProps, "altIcon" | "icon">;
export type CapkitIconComponent = ComponentType<CapkitIconProps>;

function createCapkitIcon(icon: IconSvgElement): CapkitIconComponent {
  function CapkitIcon({
    strokeWidth = 1.8,
    ...props
  }: CapkitIconProps): React.JSX.Element {
    return (
      <HugeiconsIcon
        aria-hidden={props["aria-label"] === undefined ? "true" : undefined}
        color="currentColor"
        icon={icon}
        strokeWidth={strokeWidth}
        {...props}
      />
    );
  }

  return CapkitIcon;
}

export const Add = createCapkitIcon(Add01Icon);
export const Arrow = createCapkitIcon(ArrowUpRight01Icon);
export const AspectRatio = createCapkitIcon(AspectRatioIcon);
export const Blackout = createCapkitIcon(ViewOffSlashIcon);
export const Blur = createCapkitIcon(BlurIcon);
export const Cancel = createCapkitIcon(Cancel01Icon);
export const ChevronDown = createCapkitIcon(ChevronDownIcon);
export const CircleShape = createCapkitIcon(CircleIcon);
export const Clipboard = createCapkitIcon(ClipboardIcon);
export const Clock = createCapkitIcon(Clock03Icon);
export const Computer = createCapkitIcon(ComputerIcon);
export const Copy = createCapkitIcon(Copy01Icon);
export const Crop = createCapkitIcon(CropIcon);
export const CurvedArrow = createCapkitIcon(CurvyRightDirectionIcon);
export const Dashboard = createCapkitIcon(DashboardSquare02Icon);
export const Delete = createCapkitIcon(Delete02Icon);
export const Download = createCapkitIcon(Download04Icon);
export const Eraser = createCapkitIcon(EraserIcon);
export const Film = createCapkitIcon(Film01Icon);
export const FlipHorizontal = createCapkitIcon(FlipHorizontalIcon);
export const FlipVertical = createCapkitIcon(FlipVerticalIcon);
export const Focus = createCapkitIcon(FocusPointIcon);
export const FolderAdd = createCapkitIcon(FolderAddIcon);
export const FolderSettings = createCapkitIcon(FolderCogIcon);
export const FolderOpen = createCapkitIcon(FolderOpenIcon);
export const Frame = createCapkitIcon(FrameIcon);
export const Grip = createCapkitIcon(GripVerticalIcon);
export const Hand = createCapkitIcon(HandIcon);
export const HardDrive = createCapkitIcon(HardDriveIcon);
export const Hashtag = createCapkitIcon(HashtagIcon);
export const Highlighter = createCapkitIcon(HighlighterIcon);
export const Image = createCapkitIcon(Image02Icon);
export const ImageAdd = createCapkitIcon(ImageAdd02Icon);
export const Keyboard = createCapkitIcon(KeyboardIcon);
export const Layers = createCapkitIcon(Layers02Icon);
export const List = createCapkitIcon(ListViewIcon);
export const Lock = createCapkitIcon(LockIcon);
export const MagicWand = createCapkitIcon(MagicWand02Icon);
export const Magnifier = createCapkitIcon(ZoomInAreaIcon);
export const Minus = createCapkitIcon(MinusSignIcon);
export const Moon = createCapkitIcon(Moon02Icon);
export const PaintBrush = createCapkitIcon(PaintBrush02Icon);
export const Palette = createCapkitIcon(ColorPickerIcon);
export const Pencil = createCapkitIcon(PencilEdit01Icon);
export const Pin = createCapkitIcon(PinIcon);
export const Pixelate = createCapkitIcon(GridIcon);
export const Presentation = createCapkitIcon(Presentation01Icon);
export const PresentationPointer = createCapkitIcon(SplinePointerIcon);
export const Mic = createCapkitIcon(Mic01Icon);
export const Pause = createCapkitIcon(PauseIcon);
export const Play = createCapkitIcon(PlayIcon);
export const Record = createCapkitIcon(RecordIcon);
export const Speaker = createCapkitIcon(Speaker01Icon);
export const Video = createCapkitIcon(Video01Icon);
export const Stop = createCapkitIcon(StopCircleIcon);
export const Redo = createCapkitIcon(Redo03Icon);
export const Refresh = createCapkitIcon(RefreshIcon);
export const RotateClockwise = createCapkitIcon(RotateClockwiseIcon);
export const RotateCounterClockwise = createCapkitIcon(RotateLeft02Icon);
export const Rows = createCapkitIcon(LayoutThreeRowIcon);
export const Save = createCapkitIcon(SaveIcon);
export const Scan = createCapkitIcon(ScanIcon);
export const SearchArea = createCapkitIcon(SearchAreaIcon);
export const SelectPointer = createCapkitIcon(Cursor01Icon);
export const Settings = createCapkitIcon(Settings02Icon);
export const Sliders = createCapkitIcon(SlidersHorizontalIcon);
export const Smartphone = createCapkitIcon(SmartPhone01Icon);
export const Sparkles = createCapkitIcon(SparklesIcon);
export const Spotlight = createCapkitIcon(SpotlightIcon);
export const SquareShape = createCapkitIcon(SquareIcon);
export const Sun = createCapkitIcon(Sun03Icon);
export const Tablet = createCapkitIcon(Tablet01Icon);
export const Text = createCapkitIcon(TextIcon);
export const Tick = createCapkitIcon(Tick02Icon);
export const Undo = createCapkitIcon(Undo03Icon);
export const Upload = createCapkitIcon(Upload04Icon);
export const View = createCapkitIcon(ViewIcon);
export const VerticalScroll = createCapkitIcon(ScrollVerticalIcon);
