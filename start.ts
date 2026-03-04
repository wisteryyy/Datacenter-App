import { spawn } from "child_process";

const run = (cmd: string, args: string[]) =>
  spawn(cmd, args, { shell: true, stdio: "inherit" });

console.log("\n🚀 Запускаем проект...\n");

const backend = run("npm", ["run", "dev", "--workspace=todo-backend"]);
const frontend = run("npx", ["vite"]);

const stop = () => {
  console.log("\n🛑 Останавливаемся...");
  backend.kill();
  frontend.kill();
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);