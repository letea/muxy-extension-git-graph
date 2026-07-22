import { GitGraphApp } from "@/gitgraph/app";
import "@/styles/global.css";

const root = document.getElementById("root");
if (root) new GitGraphApp(root, { compact: true }).start();
