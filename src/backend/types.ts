/** Shared shapes for backend adapters. */

export interface StorageFileApi {
  upload(
    path: string,
    file: File | Blob | ArrayBuffer | FormData,
    options?: { upsert?: boolean; contentType?: string; cacheControl?: string },
  ): Promise<{ data: { path: string } | null; error: Error | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: Error | null }>;
  list(
    prefix?: string,
    options?: Record<string, unknown>,
  ): Promise<{ data: { name: string }[] | null; error: Error | null }>;
  download(path: string): Promise<{ data: Blob | null; error: Error | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: Error | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

export interface StorageApi {
  from(bucket: string): StorageFileApi;
}

export interface RealtimeChannelLike {
  on(...args: unknown[]): RealtimeChannelLike;
  subscribe(callback?: (status: string) => void): RealtimeChannelLike;
  unsubscribe(): Promise<string>;
  send(payload: unknown): Promise<string>;
  track(payload: unknown): Promise<string>;
  untrack(): Promise<string>;
  presenceState(): Record<string, unknown>;
  topic: string;
}
