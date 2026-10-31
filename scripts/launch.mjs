import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function openBrowser(url) {
  const browser = spawn("cmd.exe", ["/c", "start", '""', url], {
    stdio: "ignore",
    windowsHide: true,
  });
  browser.on("error", () => console.log(`Open ${url} in your browser.`));
}
const existing = await Promise.all(
  Array.from({ length: 40 }, async (_, index) => {
    const url = `http://127.0.0.1:${4310 + index}`;
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(800),
      });
      const health = await response.json();
      return health.app === "reputation-monitor" && health.profile === "default"
        ? url
        : null;
    } catch {
      return null;
    }
  }),
);
const runningUrl = existing.find(Boolean);
if (runningUrl) {
  openBrowser(runningUrl);
  process.exit(0);
}
if (!existsSync("dist/index.html")) {
  console.error("Build missing. Run npm.cmd run build first.");
  process.exit(1);
}
let port = 4310;
while (port < 4350) {
  const available = await new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
  if (available) break;
  port++;
}
if (port === 4350) {
  console.error("No available local port.");
  process.exit(1);
}
const server = spawn(process.execPath, ["server/index.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["inherit", "pipe", "inherit"],
});
server.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (chunk.toString().includes("Reputation Monitor:"))
    openBrowser(`http://127.0.0.1:${port}`);
});
server.on("exit", (code) => process.exit(code || 0));
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
process.on("SIGINT", () => server.kill("SIGINT"));
