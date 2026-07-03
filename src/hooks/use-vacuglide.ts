"use client";

// Mirrors the Vacuglide cloud API as a React hook: connection, raw commands,
// live device state, and a log of every command sent to the device. Knows
// nothing about autopilot algorithms — those consume this via getDevice.
// https://developers.autoblow.com/reference/http-api-v1-vacuglide/

import { useCallback, useEffect, useRef, useState } from "react";
import { VacuglideDevice } from "@/lib/vacuglide";

const TOKEN_STORAGE_KEY = "vacuglideToken";

export type LogKind = "send" | "error" | "info";

export interface CommandLogEntry {
  id: number;
  time: string;
  text: string;
  kind: LogKind;
}

export type DeviceStatusKind = "idle" | "ok" | "error";

function timestamp(): string {
  return new Date().toLocaleTimeString(undefined, { hour12: false });
}

export function useVacuglide() {
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState("Not connected");
  const [deviceStatusKind, setDeviceStatusKind] =
    useState<DeviceStatusKind>("idle");
  // Ground-truth device state, refreshed from every command's response.
  const [deviceSpeed, setDeviceSpeed] = useState(0);
  const [strokePlusValve, setStrokePlusValve] = useState(false);
  const [strokeMinusValve, setStrokeMinusValve] = useState(false);
  const [operationalMode, setOperationalMode] = useState("");
  const [logEntries, setLogEntries] = useState<CommandLogEntry[]>([]);

  const deviceRef = useRef<VacuglideDevice | null>(null);
  const logIdRef = useRef(0);

  // Restore the last-used token from localStorage. Done in an effect (not a
  // lazy initializer) so server and first client render agree — the input
  // starts empty and fills in after hydration.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored !== null) setToken(stored);
  }, []);

  const log = useCallback((text: string, kind: LogKind = "info") => {
    logIdRef.current += 1;
    const entry: CommandLogEntry = {
      id: logIdRef.current,
      time: timestamp(),
      text,
      kind,
    };
    setLogEntries((prev) => [...prev.slice(-199), entry]);
  }, []);

  // Stable accessor so consumers (e.g. the autopilot engine) always reach the
  // currently-connected device across reconnects.
  const getDevice = useCallback(() => deviceRef.current, []);

  const connect = useCallback(async (): Promise<boolean> => {
    const trimmed = token.trim();
    if (trimmed === "") {
      setDeviceStatus("Enter a device token");
      setDeviceStatusKind("error");
      return false;
    }
    setConnecting(true);
    setDeviceStatus("Connecting…");
    setDeviceStatusKind("idle");
    try {
      const device = new VacuglideDevice(trimmed);
      const info = await device.connect();
      device.onState((state) => {
        setDeviceSpeed(state.targetSpeed);
        setStrokePlusValve(state.strokePlusValve);
        setStrokeMinusValve(state.strokeMinusValve);
        setOperationalMode(state.operationalMode);
      });
      deviceRef.current = device;
      localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
      setDeviceStatus(
        `Connected — fw ${info.firmwareVersion} (${info.firmwareBranch}), ` +
          `cluster ${(device.cluster ?? "").replace("https://", "")}`,
      );
      setDeviceStatusKind("ok");
      setConnected(true);
      log("device connected", "send");
      // Seed the status indicators with the device's current state.
      device.getState().catch(() => undefined);
      return true;
    } catch (err) {
      deviceRef.current = null;
      setConnected(false);
      setDeviceSpeed(0);
      setStrokePlusValve(false);
      setStrokeMinusValve(false);
      setOperationalMode("");
      setDeviceStatus((err as Error).message);
      setDeviceStatusKind("error");
      return false;
    } finally {
      setConnecting(false);
    }
  }, [log, token]);

  const valvePlus = useCallback(
    (state: boolean): Promise<unknown> => {
      const device = deviceRef.current;
      if (device === null) {
        return Promise.reject(new Error("No device connected"));
      }
      log(`stroke+ valve ${state ? "open" : "close"}`, "send");
      return device.valveStrokePlusSet(state);
    },
    [log],
  );

  const valveMinus = useCallback(
    (state: boolean): Promise<unknown> => {
      const device = deviceRef.current;
      if (device === null) {
        return Promise.reject(new Error("No device connected"));
      }
      log(`stroke- valve ${state ? "open" : "close"}`, "send");
      return device.valveStrokeMinusSet(state);
    },
    [log],
  );

  return {
    token,
    setToken,
    connecting,
    connected,
    deviceStatus,
    deviceStatusKind,
    connect,
    getDevice,
    deviceSpeed,
    strokePlusValve,
    strokeMinusValve,
    operationalMode,
    valvePlus,
    valveMinus,
    log,
    logEntries,
  };
}

export type VacuglideController = ReturnType<typeof useVacuglide>;
