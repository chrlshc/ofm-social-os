"use client";

import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "gradient";
  size?: "sm" | "default" | "lg";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", asChild = false, children, ...props }, ref) => {
    const variantClasses = {
      default: "bg-gray-900 text-white hover:bg-gray-800",
      outline: "btn-outline-gradient",
      ghost: "hover:bg-gray-100",
      gradient: "btn-gradient"
    }[variant];
    
    const sizeClasses = {
      sm: "h-9 px-4 text-sm",
      default: "h-11 px-6",
      lg: "h-12 px-8 text-lg"
    }[size];
    
    const baseClasses = "inline-flex items-center justify-center rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
    
    const combinedClassName = `${baseClasses} ${variantClasses} ${sizeClasses} ${className}`.trim();
    
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        className: combinedClassName,
        ref,
        ...props
      });
    }
    
    return (
      <button
        ref={ref}
        className={combinedClassName}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };