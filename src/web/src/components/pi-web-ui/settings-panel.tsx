import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { THINKING_LEVELS } from "../../core/constants";
import type { LightPalette, ThemeMode } from "../../core/types";
import { Modal } from "./modal";

const lightPalettes = [
  { id: "warm-paper", label: "Warm Paper" },
  { id: "solarized-light", label: "Solarized Light" },
] as const;

export function SettingsPanel(props: {
  authConfigured: boolean;
  authEnabled: boolean;
  autoCompaction: boolean;
  lightPalette: LightPalette;
  onSetLightPalette: (palette: LightPalette) => void;
  resolvedTheme: "light" | "dark";
  onClose: () => void;
  onRenameSession: (name: string) => void;
  onSetAutoCompaction: (enabled: boolean) => Promise<void>;
  onSetTheme: (theme: ThemeMode) => void;
  onSetThinking: (level: string) => Promise<void>;
  onToggleAuth: () => void;
  sessionName: string;
  showThinking: boolean;
  setShowThinking: (show: boolean) => void;
  themeMode: ThemeMode;
  thinkingLevel: string;
}) {
  const [draftName, setDraftName] = useState(props.sessionName);

  return (
    <Modal onClose={props.onClose} title="Settings">
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="font-medium text-sm">Appearance</h3>
          <div className="grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as ThemeMode[]).map((theme) => (
              <Button
                aria-pressed={props.themeMode === theme}
                className="capitalize"
                key={theme}
                onClick={() => props.onSetTheme(theme)}
                type="button"
                variant={props.themeMode === theme ? "default" : "outline"}
              >
                {theme}
              </Button>
            ))}
          </div>
        </section>

        <fieldset className="space-y-2">
          <legend className="font-medium text-sm">Color Palette</legend>
          <div className="grid grid-cols-2 gap-2">
            {props.resolvedTheme === "dark" ? (
              <div className="flex items-center gap-2 rounded-md border border-foreground px-2 py-1.5 text-sm">
                <span aria-hidden="true" className="palette-swatch" data-swatch="solarized-dark" />
                <span>Solarized Dark</span>
              </div>
            ) : (
              lightPalettes.map(({ id, label }) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm has-checked:border-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
                  key={id}
                >
                  <input
                    checked={props.lightPalette === id}
                    className="sr-only"
                    name="light-palette"
                    onChange={() => props.onSetLightPalette(id)}
                    type="radio"
                    value={id}
                  />
                  <span aria-hidden="true" className="palette-swatch" data-swatch={id} />
                  <span>{label}</span>
                </label>
              ))
            )}
          </div>
        </fieldset>

        <section className="space-y-2">
          <h3 className="font-medium text-sm">Session</h3>
          <div className="flex gap-2">
            <Input onChange={(event) => setDraftName(event.target.value)} value={draftName} />
            <Button onClick={() => props.onRenameSession(draftName)} type="button">
              Rename
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium text-sm">Agent</h3>
          <SettingRow
            label="Auto-compaction"
            onClick={() => props.onSetAutoCompaction(!props.autoCompaction)}
            value={props.autoCompaction}
          />
          <div className="flex flex-wrap gap-2">
            {THINKING_LEVELS.map((level) => (
              <Button
                key={level}
                onClick={() => props.onSetThinking(level)}
                size="sm"
                type="button"
                variant={props.thinkingLevel === level ? "default" : "outline"}
              >
                {level}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium text-sm">Display</h3>
          <SettingRow
            label="Show thinking"
            onClick={() => props.setShowThinking(!props.showThinking)}
            value={props.showThinking}
          />
        </section>

        {props.authConfigured && (
          <section className="space-y-2">
            <h3 className="font-medium text-sm">Authentication</h3>
            <SettingRow label="Require login" onClick={props.onToggleAuth} value={props.authEnabled} />
          </section>
        )}
      </div>
    </Modal>
  );
}

function SettingRow({ label, onClick, value }: { label: string; onClick: () => void; value: boolean }) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-md border px-3 py-2"
      onClick={onClick}
      type="button"
    >
      <span className="text-sm">{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs",
          value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {value ? "On" : "Off"}
      </span>
    </button>
  );
}
