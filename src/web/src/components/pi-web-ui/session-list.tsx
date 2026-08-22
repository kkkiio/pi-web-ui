import { CircleIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { AgentSessionInfo } from "../../../../protocol/index";

interface SessionListProps {
  sessions: AgentSessionInfo[];
  attachedAgentId: string | null;
  onSwitchAgent: (agentId: string) => void;
}

function sessionLabel(session: AgentSessionInfo): string {
  return session.sessionName ?? session.sessionId ?? session.agentId;
}

export function SessionList({ sessions, attachedAgentId, onSwitchAgent }: SessionListProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupContent>
        {sessions.length === 0 ? (
          <div className="px-2 py-4 text-muted-foreground text-xs">
            No agents connected. Run <span className="font-mono">/webui:connect</span> in a Pi session to attach it
            here.
          </div>
        ) : (
          <SidebarMenu>
            {sessions.map((session) => {
              const isActive = session.agentId === attachedAgentId;
              return (
                <SidebarMenuItem key={session.agentId}>
                  <SidebarMenuButton
                    aria-current={isActive ? "true" : undefined}
                    className="h-auto py-2"
                    data-testid="session-list-row"
                    isActive={isActive}
                    onClick={() => {
                      if (!isActive) onSwitchAgent(session.agentId);
                    }}
                    title={session.cwd}
                  >
                    <CircleIcon
                      className={cn(
                        "size-2 shrink-0 fill-current",
                        session.isStreaming ? "animate-pulse text-amber-500" : "text-emerald-500",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate">{sessionLabel(session)}</span>
                      <span className="truncate font-normal text-muted-foreground text-xs">{session.cwd}</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
