import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[13px] text-sm font-semibold transition-[transform,background-color,border-color,box-shadow,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary = brand purple with glow
        default:
          "bg-[var(--accent)] text-white shadow-[0_12px_28px_-10px_var(--accent)] hover:brightness-[1.07]",
        destructive:
          "bg-[var(--down)] text-white shadow-[0_8px_20px_-8px_var(--down)] hover:brightness-[1.07]",
        outline:
          "border border-[var(--line)] bg-transparent text-[var(--tx)] hover:bg-[var(--bg2)] hover:[border-color:color-mix(in_srgb,var(--accent)_40%,var(--line))]",
        // Secondary = panel surface + hairline
        secondary:
          "border border-[var(--line)] bg-[var(--panel)] text-[var(--tx)] hover:bg-[var(--bg2)]",
        ghost: "text-[var(--tx)] hover:bg-[var(--bg2)]",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[11px] px-3 text-xs",
        lg: "h-11 rounded-[14px] px-7",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
