import fs from "fs";
import path from "path";
import type { StorageAdapter, PutResult, GetResult } from "./types";

function storagePath(): string {
  return process.env.STORAGE_PATH ?? path.join(process.cwd(), "data", "storage");
}

function keyToPath(key: string): string {
  // Strip leading /api/files/ prefix if a stored URL is passed as the key
  const normalized = key.replace(/^\/api\/files\//, "");
  return path.join(storagePath(), normalized);
}

function keyToUrl(key: string): string {
  const normalized = key.replace(/^\/api\/files\//, "");
  return `/api/files/${normalized}`;
}

export const localAdapter: StorageAdapter = {
  async put(key, body, _contentType): Promise<PutResult> {
    const filePath = keyToPath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
    return { url: keyToUrl(key), key };
  },

  async get(key): Promise<GetResult> {
    const filePath = keyToPath(key);
    const body = fs.readFileSync(filePath);
    // Derive content type from extension; callers that need accuracy should store it separately
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    return { body, contentType: contentTypeMap[ext] ?? "application/octet-stream" };
  },

  async del(key): Promise<void> {
    const filePath = keyToPath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  },

  async copy(sourceKey, destKey): Promise<PutResult> {
    const src = keyToPath(sourceKey);
    const dest = keyToPath(destKey);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return { url: keyToUrl(destKey), key: destKey };
  },
};
