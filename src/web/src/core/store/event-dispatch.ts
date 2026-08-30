import type { AgentSessionInfo } from "../../../../protocol/index";
import { formatCompactionText } from "../chat-conversion";
import type { RpcEvent, StateSyncPayload, WsEvent } from "../types";
import type { PiWebUiStore } from "./types";

export function dispatchPiEvent(store: PiWebUiStore, data: WsEvent) {
  const payload = data.payload ?? {};
  if (data.event === "hub:sessions") {
    store.applyHubSessions((payload.sessions as AgentSessionInfo[] | undefined) ?? []);
    return;
  }
  if (data.event === "hub:agent_gone") {
    if (typeof payload.agentId === "string") store.applyAgentGone(payload.agentId);
    return;
  }
  if (data.event === "state_sync") {
    store.applyStateSync(payload as StateSyncPayload);
    return;
  }
  if (data.event === "webui_state") {
    store.applyWebUiState(payload);
    return;
  }

  const event = { type: data.event, ...payload } as RpcEvent;
  switch (event.type) {
    case "agent_start":
      store.applyAgentStart();
      break;
    case "agent_end":
      store.applyAgentEnd();
      break;
    case "turn_end":
    case "session_tree":
      void store.requestConversationSync({ debounce: true });
      store.requestGitStatusRefresh({ debounce: true });
      break;
    case "message_start":
      store.applyMessageStart(event);
      break;
    case "message_update":
      store.applyMessageUpdate(event);
      break;
    case "message_end":
      store.applyMessageEnd(event);
      break;
    case "tool_execution_start":
      store.applyToolExecutionStart(event);
      break;
    case "tool_execution_update":
      store.applyToolExecutionUpdate(event);
      break;
    case "tool_execution_end":
      store.applyToolExecutionEnd(event);
      break;
    case "auto_compaction_start":
      store.addSystemMessage("Compacting context...");
      break;
    case "auto_compaction_end":
      // The completion banner comes from session_compact (fired for manual,
      // threshold, and overflow compactions alike); here we only reset usage.
      store.setLastUsage(null);
      break;
    case "session_compact": {
      store.addSystemMessage(
        formatCompactionText({
          summary: event.compactionEntry?.summary,
          tokensBefore: event.compactionEntry?.tokensBefore,
          reason: event.reason,
        }),
        "success",
      );
      store.setLastUsage(null);
      break;
    }
    case "extension_ui_request":
      if (event.id && event.method) {
        store.setDialog({
          id: event.id,
          method: event.method,
          title: event.title,
          message: event.message as string | undefined,
          options: event.options,
          timeout: event.timeout,
          placeholder: event.placeholder,
          prefill: event.prefill,
        });
      }
      break;
    case "extension_error":
      store.addSystemMessage(`Extension error: ${event.error || "Unknown error"}`, "error");
      break;
    case "session_name":
      if (event.name) store.setSessionName(event.name);
      break;
    case "auth_changed":
      store.setAuthEnabled(Boolean(event.enabled));
      break;
    case "arch:state-changed":
      store.setArchModeEnabled(Boolean(event.enabled));
      break;
    case "model_select":
      if (event.model) store.setCurrentModel(event.model);
      break;
    default:
      break;
  }
}
