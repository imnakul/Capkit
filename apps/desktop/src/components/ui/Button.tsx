import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-95 active:scale-[0.97]",
  secondary: "bg-content/6 text-content hover:bg-content/10 active:scale-[0.97]",
  ghost: "text-content/60 hover:bg-content/6 hover:text-content",
};

/**
 * Press feedback (`scale 0.97`) is limited to primary and secondary: those commit
 * an action. Disabled buttons drop to 40% and ignore hover and press.
 */
export function Button({ variant = "secondary", className = "", type = "button", ...rest }: ButtonProps): React.JSX.Element {
  return (
    <button
      className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium outline-none transition-[transform,background-color,color,filter] duration-100 ease-out focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 ${variantClasses[variant]} ${className}`}
      type={type}
      {...rest}
    />
  );
}
