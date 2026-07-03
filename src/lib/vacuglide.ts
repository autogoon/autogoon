// Vacuglide cloud API client.
// https://developers.autoblow.com/reference/http-api-v1-vacuglide/

const LATENCY_SERVER = "https://latency.autoblowapi.com";

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

export class VacuglideDevice {
  readonly token: string;
  cluster: string | null = null;
  info: VacuglideInfo | null = null;
  // Latest device state, refreshed from every command's response.
  state: VacuglideState | null = null;

  private stateListeners: Array<(state: VacuglideState) => void> = [];

  constructor(token: string) {
    this.token = token;
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
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/target-speed", {
        method: "PUT",
        body: JSON.stringify({ targetSpeed: speed }),
      }),
    );
  }

  async targetSpeedStop(): Promise<VacuglideState> {
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/target-speed/stop", {
        method: "PUT",
      }),
    );
  }

  async valveStrokePlusSet(state: boolean): Promise<VacuglideState> {
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/valve/stroke-plus", {
        method: "PUT",
        body: JSON.stringify({ valveState: state }),
      }),
    );
  }

  async valveStrokeMinusSet(state: boolean): Promise<VacuglideState> {
    return this.applyState(
      await this.request<VacuglideState>("vacuglide/valve/stroke-minus", {
        method: "PUT",
        body: JSON.stringify({ valveState: state }),
      }),
    );
  }
}
