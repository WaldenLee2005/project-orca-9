const { spawn } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const child = spawn(npmCommand, ["run", "start", "--", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EXPO_PUBLIC_ORCA_DEV_MODE: "1"
  },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
