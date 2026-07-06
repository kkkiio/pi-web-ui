import { Building2Icon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ArchModeToggleProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export function ArchModeToggle({ enabled, onToggle, disabled }: ArchModeToggleProps) {
  const label = enabled ? "Exit Architecture Mode" : "Architecture Mode";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-checked={enabled}
          disabled={disabled}
          onClick={onToggle}
          role="switch"
          type="button"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Building2Icon className={cn("size-3.5", enabled ? "text-accent-foreground" : "text-muted-foreground")} />
          {/* Switch track */}
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
              enabled ? "bg-primary" : "bg-input",
            )}
          >
            {/* Switch thumb */}
            <span
              className={cn(
                "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
                enabled ? "translate-x-4" : "translate-x-0",
              )}
            />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
