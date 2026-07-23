import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost-dark" | "ghost-light";

type CommonProps = {
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { as?: "button" };

type ButtonAsAnchor = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { as: "a"; href: string };

type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-focus text-paper border border-focus hover:bg-transparent hover:text-focus",
  secondary:
    "bg-paper text-ink border border-ink hover:bg-ink hover:text-paper",
  "ghost-dark":
    "bg-transparent text-paper border border-line-on-dark hover:border-paper",
  "ghost-light":
    "bg-transparent text-ink border border-ink/20 hover:border-ink",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const sharedClassName = `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-mono text-[13px] font-medium uppercase tracking-[0.08em] transition-[color,background-color,border-color,transform] duration-150 [transition-timing-function:var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97] ${variantClasses[variant]} ${className}`;

  if (props.as === "a") {
    const { as, ...anchorProps } = props;
    void as;
    return (
      <a className={sharedClassName} {...anchorProps}>
        {children}
      </a>
    );
  }

  const { as, ...buttonProps } = props;
  void as;
  return (
    <button className={sharedClassName} {...buttonProps}>
      {children}
    </button>
  );
}
