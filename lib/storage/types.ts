export interface PutResult {
  url: string;
  key: string;
}

export interface GetResult {
  body: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<PutResult>;
  get(key: string): Promise<GetResult>;
  del(key: string): Promise<void>;
  copy(sourceKey: string, destKey: string): Promise<PutResult>;
}
