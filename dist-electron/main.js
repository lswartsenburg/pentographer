"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const crypto_1 = __importDefault(require("crypto"));
const PREFERRED_PORT = 3737;
const MAX_PORT_ATTEMPTS = 10;
const SERVER_READY_TIMEOUT_MS = 30000;
let mainWindow = null;
let nextProcess = null;
let serverPort = PREFERRED_PORT;
// ── Utilities ─────────────────────────────────────────────────────────────────
async function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryPort = (port) => {
      if (attempts++ >= MAX_PORT_ATTEMPTS) {
        reject(new Error("Could not find a free port"));
        return;
      }
      const server = http_1.default.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };
    tryPort(startPort);
  });
}
async function waitForServer(url) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        http_1.default
          .get(url, (res) => {
            res.resume();
            resolve();
          })
          .on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server at ${url} did not become ready within ${SERVER_READY_TIMEOUT_MS}ms`);
}
function ensureSecret(secretPath) {
  if (fs_1.default.existsSync(secretPath)) {
    return fs_1.default.readFileSync(secretPath, "utf8").trim();
  }
  const secret = crypto_1.default.randomBytes(32).toString("hex");
  fs_1.default.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}
function runMigrations(dbPath) {
  // Require at runtime so the import is not bundled into the renderer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require("../db/schema.sqlite");
  const client = new Database(dbPath);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  const db = drizzle(client, { schema });
  const migrationsFolder = electron_1.app.isPackaged
    ? path_1.default.join(process.resourcesPath, "migrations/sqlite")
    : path_1.default.join(electron_1.app.getAppPath(), "db/migrations/sqlite");
  migrate(db, { migrationsFolder });
  client.close();
}
// ── Next.js server ────────────────────────────────────────────────────────────
function startNextServer(port, dbPath, secret, storagePath) {
  const serverScript = electron_1.app.isPackaged
    ? path_1.default.join(process.resourcesPath, "app/server.js")
    : path_1.default.join(electron_1.app.getAppPath(), ".next/standalone/server.js");
  const nodeBin = electron_1.app.isPackaged
    ? path_1.default.join(process.resourcesPath, "node")
    : process.execPath.includes("electron")
      ? "node"
      : process.execPath;
  nextProcess = (0, child_process_1.spawn)(nodeBin, [serverScript], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `file:${dbPath}`,
      STORAGE_BACKEND: "local",
      STORAGE_PATH: storagePath,
      NEXTAUTH_URL: `http://127.0.0.1:${port}`,
      NEXTAUTH_SECRET: secret,
      // Disable telemetry in desktop mode
      ELECTRON: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  nextProcess.stdout?.on("data", (d) => {
    if (process.env.ELECTRON_LOG) console.log("[next]", d.toString().trim());
  });
  nextProcess.stderr?.on("data", (d) => {
    if (process.env.ELECTRON_LOG) console.error("[next]", d.toString().trim());
  });
  nextProcess.on("exit", (code) => {
    if (code !== 0 && mainWindow) {
      electron_1.dialog.showErrorBox(
        "Server crashed",
        `The Pentographer server exited unexpectedly (code ${code}). Please restart the app.`
      );
    }
  });
}
// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(port) {
  mainWindow = new electron_1.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path_1.default.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  // Open external links in the system browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      electron_1.shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(async () => {
  const userData = electron_1.app.getPath("userData");
  const dbPath = path_1.default.join(userData, "pentographer.db");
  const secretPath = path_1.default.join(userData, ".nextauth-secret");
  const storagePath = path_1.default.join(userData, "storage");
  fs_1.default.mkdirSync(storagePath, { recursive: true });
  try {
    runMigrations(dbPath);
  } catch (err) {
    electron_1.dialog.showErrorBox(
      "Database error",
      `Failed to initialise the database:\n${String(err)}\n\nPlease contact support.`
    );
    electron_1.app.quit();
    return;
  }
  const secret = ensureSecret(secretPath);
  serverPort = await findFreePort(PREFERRED_PORT);
  startNextServer(serverPort, dbPath, secret, storagePath);
  try {
    await waitForServer(`http://127.0.0.1:${serverPort}/login`);
  } catch {
    electron_1.dialog.showErrorBox(
      "Startup timeout",
      "Pentographer took too long to start. Please try again."
    );
    electron_1.app.quit();
    return;
  }
  createWindow(serverPort);
  electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) createWindow(serverPort);
  });
});
electron_1.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron_1.app.quit();
});
electron_1.app.on("before-quit", () => {
  nextProcess?.kill();
});
