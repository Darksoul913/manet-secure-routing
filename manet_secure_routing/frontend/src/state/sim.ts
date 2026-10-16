import { create } from "zustand";
import { simSocketUrl } from "../lib/api";
import type { Edge, SimEpoch, SimInit, SimParams } from "../lib/types";
import { useConnection } from "./connection";
import { eventsForEpoch, type Phase, type SimEvent } from "./events";

export type Selection = { kind: "node"; id: number } | { kind: "route" } | { kind: "link"; edge: Edge } | null;
export type Status = "idle" | "connecting" | "ready" | "error" | "ended";

interface SimState {
  status: Status;
  error?: string;
  init?: SimInit;
  epochs: SimEpoch[];
  events: SimEvent[];
  cursor: number; // index into epochs that is on screen; -1 = initial topology
  phase: Phase | "done";
  iter: number; // optimiser iteration on screen during the optimize phase
  animate: boolean; // false when the user scrubs to an epoch: show its end state without replaying
  playing: boolean;
  pending: boolean;
  latencyMs?: number;
  selection: Selection;
  focus?: { nodes: number[]; nonce: number };
  seenEvents: number; // events acknowledged in the notification tray

  reset: (params?: Partial<SimParams>) => Promise<void>;
  advance: () => Promise<boolean>;
  prefetch: () => void;
  play: () => void;
  pause: () => void;
  seek: (cursor: number) => void;
  setPhase: (phase: Phase | "done", iter?: number) => void;
  select: (s: Selection) => void;
  focusOn: (nodes: number[]) => void;
  markSeen: () => void;
}

// ---- transport: one request in flight at a time over a single socket

let socket: WebSocket | null = null;
let waiter: { resolve: (m: unknown) => void; reject: (e: Error) => void } | null = null;
let demoCursor = 0;

function openSocket(): Promise<WebSocket> {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(simSocketUrl());
    ws.onopen = () => {
      socket = ws;
      resolve(ws);
    };
    ws.onerror = () => reject(new Error("Could not open the simulation socket."));
    ws.onclose = () => {
      socket = null;
      waiter?.reject(new Error("The simulation socket closed."));
      waiter = null;
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const w = waiter;
      waiter = null;
      if (msg.type === "error") w?.reject(new Error(msg.message));
      else w?.resolve(msg);
    };
  });
}

async function request<T>(msg: object): Promise<T> {
  const ws = await openSocket();
  return new Promise<T>((resolve, reject) => {
    waiter = { resolve: resolve as (m: unknown) => void, reject };
    ws.send(JSON.stringify(msg));
  });
}

export const useSim = create<SimState>((set, get) => ({
  status: "idle",
  epochs: [],
  events: [],
  cursor: -1,
  phase: "done",
  iter: 0,
  animate: true,
  playing: false,
  pending: false,
  selection: null,
  seenEvents: 0,

  reset: async (params) => {
    const { mode, demo } = useConnection.getState();
    set({ status: "connecting", playing: false, error: undefined });
    if (inflight) await inflight; // the socket carries one request at a time
    try {
      let init: SimInit;
      if (mode === "demo" && demo) {
        init = demo.session.init;
        demoCursor = 0;
        inflight = null;
      } else {
        init = await request<SimInit>({ type: "reset", params: params ?? {} });
      }
      set({
        status: "ready", init, epochs: [], events: [], cursor: -1, phase: "done", iter: 0,
        selection: null, pending: false, seenEvents: 0, latencyMs: undefined,
      });
    } catch (e) {
      set({ status: "error", error: (e as Error).message, playing: false });
    }
  },

  /** Show the next epoch, fetching it from the simulator if it has not been received yet. */
  advance: async () => {
    const s = get();
    if (!s.init) return false;
    if (s.cursor >= s.epochs.length - 1) {
      if (!(await fetchNext())) return false;
    }
    const st = get();
    if (st.cursor >= st.epochs.length - 1) return false;
    set({ cursor: st.cursor + 1, phase: "detect", iter: 0, animate: true });
    return true;
  },

  /** Fetch the next epoch in the background while the current one is still animating. */
  prefetch: () => {
    const s = get();
    if (s.init && !s.pending && s.cursor === s.epochs.length - 1 && s.status === "ready") void fetchNext();
  },

  play: () => {
    const s = get();
    if (!s.init || s.status === "ended") return;
    set({ playing: true });
    if (s.phase === "done") void get().advance();
  },
  pause: () => set({ playing: false }),
  seek: (cursor) => set({ cursor, phase: "done", animate: false, playing: false }),
  setPhase: (phase, iter) => set(iter === undefined ? { phase } : { phase, iter }),
  select: (selection) => set({ selection }),
  focusOn: (nodes) => set({ focus: { nodes, nonce: Math.random() } }),
  markSeen: () => set({ seenEvents: visibleEvents(get()).length }),
}));

let inflight: Promise<boolean> | null = null;

/** Receive one more epoch from the simulator (or the recorded demo) and append it. Deduplicates concurrent calls. */
function fetchNext(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { mode, demo } = useConnection.getState();
    useSim.setState({ pending: true });
    const t0 = performance.now();
    try {
      let epoch: SimEpoch;
      if (mode === "demo" && demo) {
        if (demoCursor >= demo.session.epochs.length) {
          useSim.setState({ pending: false, playing: false, status: "ended" });
          return false;
        }
        epoch = demo.session.epochs[demoCursor++];
      } else {
        epoch = await request<SimEpoch>({ type: "step" });
      }
      const st = useSim.getState();
      if (!st.init) return false;
      const prev = st.epochs[st.epochs.length - 1];
      useSim.setState({
        epochs: [...st.epochs, epoch],
        events: [...st.events, ...eventsForEpoch(st.init, epoch, prev)],
        pending: false,
        latencyMs: mode === "demo" ? undefined : performance.now() - t0,
      });
      return true;
    } catch (e) {
      useSim.setState({ pending: false, playing: false, status: "error", error: (e as Error).message });
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Events that have happened up to what is currently on screen. */
export function visibleEvents(s: Pick<SimState, "events" | "cursor" | "phase" | "epochs">) {
  const current = s.epochs[s.cursor]?.epoch ?? 0;
  const order = ["detect", "isolate", "optimize", "route", "deliver", "done"];
  const pi = order.indexOf(s.phase);
  return s.events.filter((e) => e.epoch < current || (e.epoch === current && order.indexOf(e.phase) <= pi));
}
