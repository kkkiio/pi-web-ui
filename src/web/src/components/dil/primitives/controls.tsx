import { createContext, type ReactNode, useContext, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DilHandler, ResolvedProps } from "../render-tree";
import { useDilRuntime } from "../runtime-context";

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
  const handler = props.onClick as DilHandler | undefined;
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sends = handler?.sends === true;
  const host = context?.host ?? null;
  const blocked = sends && (host === null || host.busy);
  const color = typeof props.color === "string" ? props.color : undefined;

  const onClick = async () => {
    if (!context || !handler) return;
    setFailed(false);
    if (sends) setSending(true);
    try {
      await context.runtime.invoke(handler);
    } catch {
      setFailed(true);
    } finally {
      if (sends) setSending(false);
    }
  };

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Button
        aria-busy={sending || undefined}
        className={cn(props.block === true && "w-full", sending && "gap-2")}
        data-dil-action={sends ? "issueNewTurn" : undefined}
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
  const handler = props.onChange as DilHandler | undefined;
  const [draft, setDraft] = useState<{ value: unknown }>();
  const version = useRef(0);
  const select = (value: unknown) => {
    if (!context || !handler) return;
    const edit = ++version.current;
    setDraft({ value });
    void context.runtime
      .invoke(handler, [value])
      .catch(() => undefined)
      .finally(() => {
        if (edit === version.current) setDraft(undefined);
      });
  };
  const disabled = !context || !handler;
  const value = { selected: draft ? draft.value : props.value, select, disabled, name };
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
  const handler = props.onChange as DilHandler | undefined;
  const rows = typeof props.rows === "number" && props.rows > 0 ? Math.min(props.rows, 20) : 3;
  const [draft, setDraft] = useState<string>();
  const version = useRef(0);
  return (
    <Textarea
      className="resize-y text-sm"
      disabled={!context || !handler}
      onChange={(event) => {
        if (!context || !handler) return;
        const value = event.currentTarget.value;
        const edit = ++version.current;
        setDraft(value);
        void context.runtime
          .invoke(handler, [value])
          .catch(() => undefined)
          .finally(() => {
            if (edit === version.current) setDraft(undefined);
          });
      }}
      placeholder={typeof props.placeholder === "string" ? props.placeholder : undefined}
      rows={rows}
      value={draft ?? text(props.value)}
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
