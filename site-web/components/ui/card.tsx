"use client";

import * as React from "react";
import { cn } from "../../src/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "p-8 rounded-xl bg-white soft-shadow",
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export { Card };