/**
 * The CapKit app mark, identical to `src-tauri/icons/icon.svg`. Brand art keeps
 * its own fixed colours, so it ignores the theme tokens and reads the same in
 * light and dark.
 */
export function CapKitLogo({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="shrink-0" height={size} viewBox="0 0 512 512" width={size}>
      <rect fill="#151714" height="512" rx="116" width="512" />
      <path
        d="M104 210V120c0-9 7-16 16-16h90M302 104h90c9 0 16 7 16 16v90M408 302v90c0 9-7 16-16 16h-90M210 408h-90c-9 0-16-7-16-16v-90"
        fill="none"
        stroke="#D9FF43"
        strokeLinecap="round"
        strokeWidth="34"
      />
      <rect fill="#D9FF43" height="156" rx="24" width="156" x="178" y="178" />
      <path
        d="M226 282l64-64M254 218h36v36"
        fill="none"
        stroke="#151714"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="20"
      />
    </svg>
  );
}
