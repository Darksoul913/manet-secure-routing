import { ChartSpline, FlaskConical, Radar, Route, ScanSearch, Settings2, Waypoints, type LucideIcon } from "lucide-react";

export interface PageInfo {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sim?: boolean; // shows simulation controls in the top bar
}

export const PAGES: PageInfo[] = [
  {
    path: "/",
    label: "Command Center",
    title: "Command Center",
    description: "Live mesh: detection, isolation and multicast routing, epoch by epoch",
    icon: Radar,
    sim: true,
  },
  {
    path: "/simulator",
    label: "Mesh Simulator",
    title: "Mesh Simulator",
    description: "Configure the network, attackers, mobility and optimizer for a live run",
    icon: Waypoints,
    sim: true,
  },
  {
    path: "/threats",
    label: "Threat Intelligence",
    title: "Threat Intelligence",
    description: "MD-LSTM against SVM, DNN and LSTM on three intrusion datasets",
    icon: ScanSearch,
  },
  {
    path: "/arena",
    label: "Routing Arena",
    title: "Routing Arena",
    description: "HCDSO against BCO, POA, COA and DSO on the same networks",
    icon: Route,
  },
  {
    path: "/experiments",
    label: "Experiments",
    title: "Experiments",
    description: "Run the project's experiment scripts and track their outputs",
    icon: FlaskConical,
  },
  {
    path: "/results",
    label: "Results Studio",
    title: "Results Studio",
    description: "Recorded tables, proposed-versus-baseline comparisons and exports",
    icon: ChartSpline,
  },
  {
    path: "/settings",
    label: "Settings",
    title: "Settings",
    description: "Playback, motion, map overlays and data source",
    icon: Settings2,
  },
];
