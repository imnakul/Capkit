type SettingRowProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

/** A label (and optional hint) on the left, its control on the right. Rows divide themselves. */
export function SettingRow({ label, hint, children }: SettingRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-content/8 py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-content">{label}</p>
        {hint === undefined ? null : <p className="mt-0.5 text-[12px] text-content/45">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
