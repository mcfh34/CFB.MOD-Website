"use client";
import type {ButtonHTMLAttributes} from "react";
import {cva, type VariantProps} from "class-variance-authority";
import {clsx} from "clsx";
import {twMerge} from "tailwind-merge";
// Editable shadcn-style components: shared styling, native semantics, no global theme dependency.
export const buttonVariants=cva("ui-button",{variants:{variant:{default:"ui-button-default",outline:"ui-button-outline",ghost:"ui-button-ghost"},size:{default:"ui-button-md",sm:"ui-button-sm"}},defaultVariants:{variant:"default",size:"default"}});
export function Button({className,variant,size,...props}:ButtonHTMLAttributes<HTMLButtonElement>&VariantProps<typeof buttonVariants>){return <button type="button" className={twMerge(clsx(buttonVariants({variant,size}),className))} {...props}/>;}
