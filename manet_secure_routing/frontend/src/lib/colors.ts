import type { Algorithm } from "./types";

// Categorical order validated with the dataviz palette checker (light, surface #F8FAFB):
// lightness band, chroma floor, CVD separation and normal-vision floor all pass in this order.
export const ALGORITHMS: Algorithm[] = ["HCDSO", "DSO", "COA", "POA", "BCO"];

export const ALGO_COLOR: Record<Algorithm, string> = {
  HCDSO: "#00939F",
  DSO: "#355CC9",
  COA: "#CC5FA0",
  POA: "#7D5FC9",
  BCO: "#6A8F1F",
};

export const ALGO_NAME: Record<Algorithm, string> = {
  HCDSO: "Hybrid coati–dolphin (proposed)",
  DSO: "Dolphin swarm",
  COA: "Coati optimization",
  POA: "Pelican optimization",
  BCO: "Bee colony",
};

// IDS models reuse the first four slots of the same validated order.
export const MODEL_ORDER = ["MD-LSTM", "DNN", "LSTM", "SVM"];
export const MODEL_COLOR: Record<string, string> = {
  "MD-LSTM": "#00939F",
  DNN: "#355CC9",
  LSTM: "#CC5FA0",
  SVM: "#7D5FC9",
};

export const PHASE_COLOR: Record<string, string> = {
  COA: "#7967B5",
  DSO: "#5966A9",
};
