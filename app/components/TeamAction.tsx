"use client";
import type { ButtonHTMLAttributes } from "react";

// A card's main action and its team links are sibling controls, never nested buttons/links.
export function TeamAction({ children, className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <div className={`${className ?? ""} team-action`} style={style}>
    {children}
    <button {...props} className="team-action-target" type="button" />
  </div>;
}
