import { put, del, copy, head } from "@vercel/blob";
import type { StorageAdapter, PutResult, GetResult } from "./types";

const token = () => process.env.BLOB_READ_WRITE_TOKEN ?? "";

export const vercelAdapter: StorageAdapter = {
  async put(key, body, contentType): Promise<PutResult> {
    const blob = await put(key, body, { access: "private", contentType, token: token() });
    return { url: blob.url, key };
  },

  async get(key): Promise<GetResult> {
    // key may be a full Vercel Blob URL or a pathname
    const url = key.startsWith("http") ? key : (await head(key, { token: token() })).url;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    return { body, contentType };
  },

  async del(key): Promise<void> {
    await del(key, { token: token() });
  },

  async copy(sourceKey, destKey): Promise<PutResult> {
    const blob = await copy(sourceKey, destKey, { access: "private", token: token() });
    return { url: blob.url, key: destKey };
  },
};
