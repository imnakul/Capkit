type PageHeaderProps = {
  title: string;
  /** Right-aligned status or action, such as a count or "Saved". */
  trailing?: React.ReactNode;
};

/** The single `h1` of a dashboard page: 15px, no eyebrow, no sentence. */
export function PageHeader({ title, trailing }: PageHeaderProps): React.JSX.Element {
  return (
    <header className="mb-4 flex min-h-7 items-center justify-between gap-3">
      <h1 className="text-[15px] font-semibold text-content">{title}</h1>
      {trailing === undefined ? null : <div className="text-[12px] text-content/45">{trailing}</div>}
    </header>
  );
}
