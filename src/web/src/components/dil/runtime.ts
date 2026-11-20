import type { DilProgram } from "./compiler.ts";
import type { DilHandler, ResolvedNode } from "./render-tree.ts";
import { readTree, readViewState } from "./render-tree.ts";
import frameHtml from "./sandbox-frame.html?raw";
import type { DilResult } from "./sandbox-worker.js";
import workerSource from "./sandbox-worker.js?raw";

export interface DilHost {
  readonly busy: boolean;
  issueNewTurn(prompt: string): Promise<void> | void;
}

interface Revision {
  readonly revision: number;
  readonly program: DilProgram;
}

type Request = (Revision & { kind: "load" }) | { kind: "trigger"; revision: number; handler: string; args: unknown[] };

interface EventRequest {
  readonly request: Extract<Request, { kind: "trigger" }>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

/** Own the runner, preserving the last usable revision and its state while a message is mounted. */
export class DilSandbox {
  private frame: HTMLIFrameElement | undefined;
  private port: MessagePort | undefined;
  private ready = false;
  private visible = false;
  private sequence = 0;
  private revision = 0;
  private loaded = 0;
  private attempted = 0;
  private desired: Revision | undefined;
  private committed: Revision | undefined;
  private state: Record<string, unknown> = {};
  private events: EventRequest[] = [];
  private pending: { id: number; request: Request; event?: EventRequest } | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onTree: (tree: readonly ResolvedNode[]) => void,
    private readonly getHost: () => DilHost | null,
  ) {}

  update(program: DilProgram | undefined): void {
    if (program === this.desired?.program) return;
    if (!program) {
      this.stop();
      this.desired = undefined;
      return;
    }
    this.desired = { program, revision: ++this.revision };
    if (this.visible) this.connect();
    this.pump();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    clearTimeout(this.idle);
    if (visible) {
      this.connect();
      this.pump();
    } else if (this.frame) {
      this.idle = setTimeout(() => {
        if (this.pending || this.events.length) this.setVisible(false);
        else this.stop();
      }, 1_000);
    }
  }

  invoke(handler: DilHandler, args: unknown[] = []): Promise<void> {
    if (!this.committed) return Promise.resolve();
    const revision = this.committed.revision;
    return new Promise((resolve, reject) => {
      this.events.push({ request: { kind: "trigger", revision, handler: handler.id, args }, resolve, reject });
      this.connect();
      this.pump();
    });
  }

  stop(): void {
    clearTimeout(this.watchdog);
    clearTimeout(this.idle);
    this.port?.close();
    this.frame?.remove();
    this.frame = undefined;
    this.port = undefined;
    this.ready = false;
    this.loaded = 0;
    this.attempted = 0;
    this.pending?.event?.resolve();
    this.pending = undefined;
    for (const event of this.events.splice(0)) event.resolve();
  }

  private connect(): void {
    if (this.frame || !this.desired) return;
    const frame = document.createElement("iframe");
    const channel = new MessageChannel();
    frame.hidden = true;
    frame.title = "DIL sandbox";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.referrerPolicy = "no-referrer";
    frame.srcdoc = frameHtml;
    this.frame = frame;
    this.port = channel.port1;
    const stopped = () => {
      if (this.frame === frame) this.stop();
    };
    frame.addEventListener(
      "load",
      () => {
        frame.contentWindow?.postMessage({ source: workerSource, state: this.state }, "*", [channel.port2]);
      },
      { once: true },
    );
    channel.port1.onmessage = ({ data }) => {
      if (data?.stopped) {
        stopped();
      } else if (data?.ready) {
        clearTimeout(this.watchdog);
        this.ready = true;
        this.pump();
      } else {
        this.receive(data);
      }
    };
    this.watchdog = setTimeout(stopped, 5_500);
    document.body.append(frame);
  }

  private pump(): void {
    if (!this.ready || this.pending || !this.desired || !this.port) return;
    const event = this.events[0];
    const restore = this.committed && this.loaded === 0 && this.attempted === 0 && this.committed;
    let request: Request;
    let dispatched: EventRequest | undefined;
    if (restore) {
      request = { ...restore, kind: "load" };
    } else if (event) {
      if (this.loaded === 0) {
        this.events.shift()?.resolve();
        this.pump();
        return;
      }
      request = { ...event.request, revision: this.loaded };
      dispatched = this.events.shift();
    } else if (this.desired.revision > this.attempted) {
      request = { ...this.desired, kind: "load" };
    } else {
      return;
    }
    const id = ++this.sequence;
    this.pending = { id, request, event: dispatched };
    this.watchdog = setTimeout(() => this.stop(), 1_500);
    this.port.postMessage({ id, request });
  }

  private receive(data: { id: number; result: DilResult | null } | undefined): void {
    const pending = this.pending;
    if (!pending || pending.id !== data?.id) return;
    this.pending = undefined;
    clearTimeout(this.watchdog);
    const { request, event } = pending;
    const revision = request.kind === "load" ? request : this.committed;
    if (request.kind === "load") this.attempted = request.revision;
    let prompt: string | undefined;
    try {
      if (data.result && revision) {
        const tree = readTree(data.result.tree, revision.program.data);
        this.state = readViewState(data.result.state);
        this.committed = revision;
        this.loaded = revision.revision;
        this.onTree(tree);
        const first = Array.isArray(data.result.effects) ? data.result.effects[0] : undefined;
        if (event && typeof first === "string" && first.length <= 1_000_000 && first.trim()) prompt = first.trim();
      }
    } catch {
      event?.resolve();
      this.stop();
      return;
    }
    if (event && prompt) {
      const host = this.getHost();
      if (!host || host.busy) {
        event.reject(new Error("Pi is unavailable"));
      } else {
        const message = prompt;
        void Promise.resolve()
          .then(() => host.issueNewTurn(message))
          .then(event.resolve, event.reject);
      }
    } else {
      event?.resolve();
    }
    this.pump();
  }
}
