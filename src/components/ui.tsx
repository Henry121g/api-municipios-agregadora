"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { buttonStyles } from "./button-styles";


export function SubmitButton({
  children,
  pendingLabel = "Enviando…",
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { pendingLabel?: string; variant?: keyof typeof buttonStyles }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-disabled={pending || props.disabled}
      className={`${buttonStyles[variant]} ${className}`}
      {...props}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  id: idProp,
  ...props
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = idProp ?? `campo-${name}`;
  const describedBy = [error && `${id}-erro`, hint && `${id}-dica`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base aria-[invalid=true]:border-danger"
        {...props}
      />
      {hint && (
        <p id={`${id}-dica`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const styles = kind === "error" ? "bg-danger-bg text-danger" : "bg-success-bg text-success";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
