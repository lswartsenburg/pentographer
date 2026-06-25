import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import type { StorageAdapter, PutResult, GetResult } from "./types";

function client() {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
    region: process.env.MINIO_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    },
    forcePathStyle: true, // required for MinIO
  });
}

function bucket() {
  return process.env.MINIO_BUCKET ?? "pentographer";
}

// Normalize key: strip leading /api/files/ if a stored proxy URL is passed
function normalizeKey(key: string): string {
  return key.replace(/^\/api\/files\//, "");
}

// Files are served through the Next.js proxy so auth is enforced
function keyToUrl(key: string): string {
  return `/api/files/${normalizeKey(key)}`;
}

let bucketEnsured = false;

async function ensureBucket(s3: S3Client): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket() }));
  }
  bucketEnsured = true;
}

export const minioAdapter: StorageAdapter = {
  async put(key, body, contentType): Promise<PutResult> {
    const s3 = client();
    const k = normalizeKey(key);
    await ensureBucket(s3);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: k,
        Body: body,
        ContentType: contentType,
      })
    );
    return { url: keyToUrl(k), key: k };
  },

  async get(key): Promise<GetResult> {
    const s3 = client();
    const k = normalizeKey(key);
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: k }));
    const body = Buffer.from(await res.Body!.transformToByteArray());
    const contentType = res.ContentType ?? "application/octet-stream";
    return { body, contentType };
  },

  async del(key): Promise<void> {
    const s3 = client();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: normalizeKey(key) }));
  },

  async copy(sourceKey, destKey): Promise<PutResult> {
    const s3 = client();
    const src = normalizeKey(sourceKey);
    const dest = normalizeKey(destKey);
    await ensureBucket(s3);
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket(),
        CopySource: `${bucket()}/${src}`,
        Key: dest,
      })
    );
    return { url: keyToUrl(dest), key: dest };
  },
};
