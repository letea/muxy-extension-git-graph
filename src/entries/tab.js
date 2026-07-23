import { GitGraphApp } from "@/gitgraph/app";
import "@/styles/global.css";

// tabTypes have no manifest `icon` field — set it at runtime (resets on
// restart, so this must run on every load), matching the icon used
// elsewhere in the manifest (panel, topbar item).
muxy.tabs.setIcon({ symbol: "point.3.connected.trianglepath.dotted" });

const root = document.getElementById("root");
if (root) new GitGraphApp(root, { compact: false }).start();
