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
  SecurityCheckIcon,
  Settings02Icon,
  SlidersHorizontalIcon,
  SmartPhone01Icon,
  SparklesIcon,
  SplinePointerIcon,
  SpotlightIcon,
  SquareIcon,
  SquareRoundCornerIcon,
  StickyNote02Icon,
  StarIcon,
  Sun03Icon,
  Tablet01Icon,
  TextIcon,
  TextSelectionIcon,
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

/** A round pin with a speech-bubble tail, for the Note tool. */
const notePinIcon: IconSvgElement = [
  [
    "path",
    {
      d: "M12 3a8 8 0 1 1-3.6 15.15L4 20l1.3-4.1A8 8 0 0 1 12 3Z",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      key: "0",
    },
  ],
  ["path", { d: "M12 8v6M9 11h6", stroke: "currentColor", strokeLinecap: "round", key: "1" }],
];
export const NotePin = createCapkitIcon(notePinIcon);
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
export const SecurityCheck = createCapkitIcon(SecurityCheckIcon);
export const SelectPointer = createCapkitIcon(Cursor01Icon);
export const Settings = createCapkitIcon(Settings02Icon);
export const Sliders = createCapkitIcon(SlidersHorizontalIcon);
export const Smartphone = createCapkitIcon(SmartPhone01Icon);
export const Sparkles = createCapkitIcon(SparklesIcon);
export const Spotlight = createCapkitIcon(SpotlightIcon);
export const SquareShape = createCapkitIcon(SquareIcon);
export const RoundedSquareShape = createCapkitIcon(SquareRoundCornerIcon);
export const Star = createCapkitIcon(StarIcon);
export const StickyNote = createCapkitIcon(StickyNote02Icon);
export const Sun = createCapkitIcon(Sun03Icon);
export const Tablet = createCapkitIcon(Tablet01Icon);
export const Text = createCapkitIcon(TextIcon);
export const TextSelection = createCapkitIcon(TextSelectionIcon);
export const Tick = createCapkitIcon(Tick02Icon);
export const Undo = createCapkitIcon(Undo03Icon);
export const Upload = createCapkitIcon(Upload04Icon);
export const View = createCapkitIcon(ViewIcon);
export const VerticalScroll = createCapkitIcon(ScrollVerticalIcon);

/** Inline 24px line-style previews; they draw the style itself so they read at a glance. */
function createLineStyleIcon(children: React.JSX.Element): CapkitIconComponent {
  function LineStyleIcon({ size = 16, strokeWidth = 1.8, className }: CapkitIconProps): React.JSX.Element {
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
        width={size}
      >
        {children}
      </svg>
    );
  }
  return LineStyleIcon;
}

export const LineStyleSolid = createLineStyleIcon(<path d="M3 12h18" />);
export const LineStyleDashed = createLineStyleIcon(<path d="M3 12h4M10 12h4M17 12h4" />);
export const LineStyleDotted = createLineStyleIcon(
  <path d="M4 12h.01M8.5 12h.01M13 12h.01M17.5 12h.01M21 12h.01" strokeWidth={3} />,
);
export const LineStyleSketchy = createLineStyleIcon(<path d="M3 13c3-3 5 2 8-1s5 2 10-1M4 15c4-1 6 1 9 0" />);
