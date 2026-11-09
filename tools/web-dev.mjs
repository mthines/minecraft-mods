// npm run web:dev: the kit menu API (tools/web.mjs, :8080) and Vite with hot reloading (:5173, /api goes to :8080), stopped together.
import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["tools/web.mjs"], { stdio: "inherit" }),
  spawn("npx", ["vite", "--config", "web/vite.config.js"], { stdio: "inherit" }),
];
const stop = () => children.forEach((child) => child.kill());
for (const child of children) child.on("exit", stop);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
