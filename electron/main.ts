import { app, BrowserWindow, shell, dialog } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import http from "http";
import crypto from "crypto";

const PREFERRED_PORT = 3737;
const MAX_PORT_ATTEMPTS = 10;
const SERVER_READY_TIMEOUT_MS = 30_000;

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let serverPort = PREFERRED_PORT;

// ── Utilities ─────────────────────────────────────────────────────────────────

async function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryPort = (port: number) => {
      if (attempts++ >= MAX_PORT_ATTEMPTS) {
        reject(new Error("Could not find a free port"));
        return;
      }
      const server = http.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };
    tryPort(startPort);
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        http
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

function ensureSecret(secretPath: string): string {
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

function runMigrations(dbPath: string) {
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

  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, "migrations/sqlite")
    : path.join(app.getAppPath(), "db/migrations/sqlite");

  migrate(db, { migrationsFolder });
  client.close();
}

// ── Next.js server ────────────────────────────────────────────────────────────

function startNextServer(port: number, dbPath: string, secret: string, storagePath: string) {
  const serverScript = app.isPackaged
    ? path.join(process.resourcesPath, "app/server.js")
    : path.join(app.getAppPath(), ".next/standalone/server.js");

  const nodeBin = app.isPackaged
    ? path.join(process.resourcesPath, "node")
    : process.execPath.includes("electron")
      ? "node"
      : process.execPath;

  nextProcess = spawn(nodeBin, [serverScript], {
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

  nextProcess.stdout?.on("data", (d: Buffer) => {
    if (process.env.ELECTRON_LOG) console.log("[next]", d.toString().trim());
  });
  nextProcess.stderr?.on("data", (d: Buffer) => {
    if (process.env.ELECTRON_LOG) console.error("[next]", d.toString().trim());
  });
  nextProcess.on("exit", (code) => {
    if (code !== 0 && mainWindow) {
      dialog.showErrorBox(
        "Server crashed",
        `The Pentographer server exited unexpectedly (code ${code}). Please restart the app.`
      );
    }
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "pentographer.db");
  const secretPath = path.join(userData, ".nextauth-secret");
  const storagePath = path.join(userData, "storage");

  fs.mkdirSync(storagePath, { recursive: true });

  try {
    runMigrations(dbPath);
  } catch (err) {
    dialog.showErrorBox(
      "Database error",
      `Failed to initialise the database:\n${String(err)}\n\nPlease contact support.`
    );
    app.quit();
    return;
  }

  const secret = ensureSecret(secretPath);
  serverPort = await findFreePort(PREFERRED_PORT);
  startNextServer(serverPort, dbPath, secret, storagePath);

  try {
    await waitForServer(`http://127.0.0.1:${serverPort}/login`);
  } catch {
    dialog.showErrorBox(
      "Startup timeout",
      "Pentographer took too long to start. Please try again."
    );
    app.quit();
    return;
  }

  createWindow(serverPort);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(serverPort);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  nextProcess?.kill();
});
