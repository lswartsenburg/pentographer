import type { StorageAdapter } from "./types";

// Lazily imported so the unused adapter's dependencies don't need to be installed
let _adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;
  if (process.env.STORAGE_BACKEND === "local") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _adapter = require("./local").localAdapter;
  } else if (process.env.STORAGE_BACKEND === "minio") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _adapter = require("./minio").minioAdapter;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _adapter = require("./vercel").vercelAdapter;
  }
  return _adapter!;
}

export type { StorageAdapter, PutResult, GetResult } from "./types";
