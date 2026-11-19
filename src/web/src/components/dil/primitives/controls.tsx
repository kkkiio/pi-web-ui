import { createContext, type ReactNode, useContext, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ResolvedProps } from "../resolve";
import { useDilRuntime } from "../runtime-context";

/**
 * The interactive controls of `#48` — the five the corpus actually contains.
 *
 * `button` / `radio-group` / `radio` / `label` / `textarea` are the whole interaction
 * vocabulary, so these components carry the only DOM in the DIL pipeline. Everything
 * they know about behaviour comes from the runtime:
 *
 *   - handlers are `SafeObject`s, invoked through `DilRuntime.invoke` (never called);
 *   - a button's intent comes from `DilRuntime.probe`, which runs it with side effects
 *     off, so "this sends a message" is decided by the handler itself, not by its text;
 *   - state reads go through getters, so a control never sees a stale value.
 *
 * Failure policy matches the rest of the renderer: a missing or unusable prop degrades
 * (an unknown `size`, a `value` that is not a string), never throws.
 */

export interface ControlProps {
  readonly props: ResolvedProps;
  readonly children?: ReactNode;
}

/** `md` is the corpus' default; anything unknown falls back to it. */
const BUTTON_SIZE = { sm: "sm", md: "default", lg: "lg" } as const;

function buttonSize(value: unknown): "sm" | "default" | "lg" {
  return typeof value === "string" ? (BUTTON_SIZE[value as keyof typeof BUTTON_SIZE] ?? "default") : "default";
}

export function ControlButton({ props, children }: ControlProps) {
  const context = useDilRuntime();
  const action = useMemo(() => context?.runtime.probe(props.onClick) ?? null, [context, props.onClick]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const sends = action !== null;
  const host = context?.host ?? null;
  const blocked = sends && (host === null || host.busy);
  const color = typeof props.color === "string" ? props.color : undefined;

  const onClick = async () => {
    if (!context) return;
    setFailed(false);
    if (!sends) {
      context.runtime.invoke(props.onClick);
      return;
    }
    // The click is the send: a card never drafts, and `busy` is the only gate.
    setSending(true);
    try {
      await context.runtime.invoke(props.onClick);
    } catch (error) {
      setFailed(true);
      void error;
    } finally {
      setSending(false);
    }
  };

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Button
        aria-busy={sending || undefined}
        className={cn(props.block === true && "w-full", sending && "gap-2")}
        data-dil-action={action?.kind}
        disabled={blocked || sending}
        onClick={onClick}
        size={buttonSize(props.size)}
        title={sends ? "Sends a new message" : undefined}
        type="button"
        variant={color === "primary" || sends ? "default" : "outline"}
      >
        {children}
        {sending && <Spinner aria-label="Sending" className="size-3" />}
      </Button>
      {failed && (
        <span className="text-destructive text-xs" role="alert">
          Could not send. Pi may be busy or disconnected.
        </span>
      )}
    </span>
  );
}

interface RadioGroupContextValue {
  readonly selected: unknown;
  readonly select: (value: unknown) => void;
  readonly disabled: boolean;
  /** One native radio group per `<radio-group>`, so arrow keys move between options. */
  readonly name: string;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export function ControlRadioGroup({ props, children }: ControlProps) {
  const context = useDilRuntime();
  const name = useId();
  const select = (value: unknown) => context?.runtime.invoke(props.onChange, [value]);
  const disabled = !context || props.onChange === undefined;
  const value = { selected: props.value, select, disabled, name };
  return (
    <RadioGroupContext.Provider value={value}>
      <div
        aria-disabled={disabled || undefined}
        className={cn(
          "flex min-w-0 gap-1.5",
          props.direction === "row" ? "flex-row flex-wrap items-center gap-4" : "flex-col",
        )}
        role="radiogroup"
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export function ControlRadio({ props, children }: ControlProps) {
  const group = useContext(RadioGroupContext);
  const checked = group !== null && sameValue(group.selected, props.value);
  return (
    <label className={cn("flex min-w-0 items-start gap-2 text-sm", group?.disabled ? "opacity-60" : "cursor-pointer")}>
      <input
        checked={checked}
        className="mt-[3px] size-3.5 shrink-0 accent-primary"
        disabled={group?.disabled ?? true}
        name={group?.name}
        onChange={() => group?.select(props.value)}
        type="radio"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/** A form field heading. The corpus writes `<label>` with no props and no `for`. */
export function ControlLabel({ children }: ControlProps) {
  return <div className="font-medium text-foreground text-sm">{children}</div>;
}

export function ControlTextarea({ props }: ControlProps) {
  const context = useDilRuntime();
  const rows = typeof props.rows === "number" && props.rows > 0 ? Math.min(props.rows, 20) : 3;
  return (
    <Textarea
      className="resize-y text-sm"
      disabled={!context || props.onChange === undefined}
      onChange={(event) => context?.runtime.invoke(props.onChange, [event.currentTarget.value])}
      placeholder={typeof props.placeholder === "string" ? props.placeholder : undefined}
      rows={rows}
      value={text(props.value)}
    />
  );
}

/** `value` is a DIL value, not a DOM string: numbers and booleans format like they do in prose. */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || (a !== undefined && b !== undefined && String(a) === String(b));
}
