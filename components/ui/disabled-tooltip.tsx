"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DisabledTooltipProps {
  label: string;
  children: React.ReactElement<{ disabled?: boolean }>;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Wraps a disabled button with a tooltip explaining why it is disabled.
 * When the child is not disabled, renders it unchanged.
 *
 * Radix tooltips don't fire on disabled elements (no pointer events), so we
 * intercept via a <span> that stays interactive.
 */
export function DisabledTooltip({ label, children, side = "top" }: DisabledTooltipProps) {
  if (!children.props.disabled) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0} style={{ pointerEvents: "auto" }}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
