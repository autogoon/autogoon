// Vacuglide cloud API client.
// https://developers.autoblow.com/reference/http-api-v1-vacuglide/

const LATENCY_SERVER = "https://latency.autoblowapi.com";

// The API is rate limited to RATE_LIMIT requests per rolling RATE_WINDOW_MS. We
// can't read the server's own counter (the x-ratelimit-* headers aren't exposed
// to cross-origin JS), so we estimate it by tracking our own request times.
export const RATE_LIMIT = 160;
const RATE_WINDOW_MS = 60_000;

export interface RateLimitStatus {
  used: number;
  remaining: number;
  limit: number;
}

export interface VacuglideInfo {
  firmwareStatus: string;
  firmwareVersion: number;
  firmwareBranch: string;
  hardwareVersion: string;
  mac: string;
  deviceType: string;
}

export interface VacuglideState {
  operationalMode: string;
  localScript: number;
  targetSpeed: number;
  strokePlusValve: boolean;
  strokeMinusValve: boolean;
  syncScriptCurrentTime: number;
  syncScriptOffsetTime: number;
  syncScriptToken: string;
  syncScriptLoop: boolean;
}

interface ApiErrorBody {
  error?: { message?: string; code?: string } | string;
}

// Called with each command actually sent to the device, so the app's command
// log reflects device traffic regardless of who issued it (manual controls or
// an autopilot engine). Kept structural so this client stays independent of the
// React/logging layer.
export type CommandLog = (text: string, kind: "send") => void;

export class VacuglideDevice {
  readonly token: string;
  cluster: string | null = null;
  info: VacuglideInfo | null = null;
  // Latest device state, refreshed from every command's response.
  state: VacuglideState | null = null;

  private stateListeners: Array<(state: VacuglideState) => void> = [];
  private readonly log: CommandLog;
  // Timestamps of recent requests, for the self-tracked rate-limit estimate.
  private requestTimes: number[] = [];

  constructor(token: string, log: CommandLog = () => {}) {
    this.token = token;
    this.log = log;
  }

  private recordRequest(): void {
    this.requestTimes.push(Date.now());
    const cutoff = Date.now() - RATE_WINDOW_MS;
    while (this.requestTimes.length > 0 && this.requestTimes[0]! < cutoff) {
      this.requestTimes.shift();
    }
  }

  // How much of the rate-limit budget we've used in the trailing window.
  rateLimitStatus(): RateLimitStatus {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    const used = this.requestTimes.filter((t) => t >= cutoff).length;
    return { used, remaining: Math.max(0, RATE_LIMIT - used), limit: RATE_LIMIT };
  }

  onState(fn: (state: VacuglideState) => void): () => void {
    this.stateListeners.push(fn);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== fn);
    };
  }

  private applyState(state: VacuglideState): VacuglideState {
    this.state = state;
    this.stateListeners.forEach((fn) => fn(state));
    return state;
  }

  async connect(): Promise<VacuglideInfo> {
    const res = await fetch(`${LATENCY_SERVER}/vacuglide/connected`, {
      headers: { "x-device-token": this.token },
    });
    this.recordRequest();
    if (res.status === 429) throw new Error("Rate limited — try again shortly");
    if (!res.ok) throw new Error(`Connect check failed (${res.status})`);
    const data = (await res.json()) as { connected: boolean; cluster?: string };
    if (!data.connected || data.cluster === undefined || data.cluster === "") {
      throw new Error("Device is not connected to the Autoblow cloud");
    }
    const bare = data.cluster.replace(/\/$/, "");
    this.cluster = bare.startsWith("http") ? bare : `https://${bare}`;
    const info = await this.request<VacuglideInfo>("vacuglide/info", {
      method: "GET",
    });
    this.info = info;
    if (info.deviceType !== "vacuglide") {
      throw new Error(
        `Connected device is a ${info.deviceType}, not a Vacuglide`,
      );
    }
    return info;
  }

  async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    if (this.cluster === null) throw new Error("Not connected");
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string> | undefined),
      "x-device-token": this.token,
    };
    if (opts.body != null) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.cluster}/${path}`, { ...opts, headers });
    this.recordRequest();
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429) throw new Error("Rate limited");
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (typeof body.error === "string") detail = body.error;
      else if (body.error != null) {
        detail = body.error.message ?? body.error.code ?? detail;
      }
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new Error(detail);
  }

  async getState(): Promise<VacuglideState> {
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/state", { method: "GET" }),
    );
  }

  async targetSpeedSet(speed: number): Promise<VacuglideState> {
    this.log(`speed → ${speed}`, "send");
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/target-speed", {
        method: "PUT",
        body: JSON.stringify({ targetSpeed: speed }),
      }),
    );
  }

  async targetSpeedStop(): Promise<VacuglideState> {
    this.log("speed stop", "send");
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/target-speed/stop", {
        method: "PUT",
      }),
    );
  }

  async valveStrokePlusSet(state: boolean): Promise<VacuglideState> {
    this.log(`stroke+ valve ${state ? "open" : "close"}`, "send");
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/valve/stroke-plus", {
        method: "PUT",
        body: JSON.stringify({ valveState: state }),
      }),
    );
  }

  async valveStrokeMinusSet(state: boolean): Promise<VacuglideState> {
    this.log(`stroke- valve ${state ? "open" : "close"}`, "send");
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/valve/stroke-minus", {
        method: "PUT",
        body: JSON.stringify({ valveState: state }),
      }),
    );
  }
}
