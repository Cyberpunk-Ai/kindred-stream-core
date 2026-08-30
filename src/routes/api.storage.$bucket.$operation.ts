import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createFileRoute } from "@tanstack/react-router";
import { getBucketConfig, isGameflexBucket } from "@/storage/buckets.ts";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required R2 environment variable: ${name}`);
  return value;
}

function client(): S3Client {
  return new S3Client({
    region: process.env.R2_REGION?.trim() || "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function objectKey(value: string): string {
  const key = value.trim().split("/").filter(Boolean).join("/");
  if (!key || key.includes("..") || key.includes("\\")) throw new Error("Invalid object key");
  return key;
}

function bucket(value: string): string {
  if (!isGameflexBucket(value)) throw new Error(`Unsupported GameFlex bucket: ${value}`);
  return value;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function bodyBytes(body: unknown): Promise<Uint8Array> {
  if (!body || typeof body !== "object" || !("transformToByteArray" in body)) {
    throw new Error("R2 response did not contain an object body");
  }
  return (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
}

export const Route = createFileRoute("/api/storage/$bucket/$operation")({
  server: {
    handlers: {
      async GET({ request, params }) {
        try {
          const bucketName = bucket(params.bucket);
          const key = request.url.includes("path=")
            ? objectKey(new URL(request.url).searchParams.get("path") ?? "")
            : undefined;
          const r2 = client();

          if (params.operation === "object" && key) {
            const result = await r2.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
            const bytes = await bodyBytes(result.Body);
            return new Response(bytes as BodyInit, {
              headers: {
                "content-type": result.ContentType ?? "application/octet-stream",
                ...(result.ContentLength ? { "content-length": String(result.ContentLength) } : {}),
                "cache-control": result.CacheControl ?? "public, max-age=31536000, immutable",
              },
            });
          }

          if (params.operation === "list") {
            const prefix = new URL(request.url).searchParams.get("prefix") ?? "";
            const result = await r2.send(
              new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, MaxKeys: 1000 }),
            );
            return json({ objects: (result.Contents ?? []).map((item) => ({ name: item.Key })) });
          }

          if (params.operation === "metadata" && key) {
            const result = await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
            return json({
              bucket: bucketName,
              objectKey: key,
              mimeType: result.ContentType ?? "application/octet-stream",
              sizeBytes: result.ContentLength ?? 0,
              metadata: result.Metadata ?? {},
            });
          }

          return json({ error: "Unsupported storage operation" }, 404);
        } catch (error) {
          console.error("R2 storage GET failed", error);
          return json({ error: "Storage request failed" }, 500);
        }
      },
      async POST({ request, params }) {
        try {
          const bucketName = bucket(params.bucket);
          const r2 = client();

          if (params.operation === "upload") {
            const form = await request.formData();
            const key = objectKey(String(form.get("path") ?? ""));
            const file = form.get("file");
            if (!(file instanceof Blob)) return json({ error: "File is required" }, 400);
            const config = getBucketConfig(bucketName);
            if (file.size > config.maxBytes) return json({ error: "File is too large" }, 413);
            await r2.send(
              new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: new Uint8Array(await file.arrayBuffer()),
                ContentType: file.type || "application/octet-stream",
                CacheControl: String(form.get("cacheControl") ?? "") || undefined,
              }),
            );
            return json({ path: key, url: `/api/storage/${bucketName}/object?path=${encodeURIComponent(key)}` });
          }

          if (params.operation === "remove") {
            const payload = (await request.json()) as { paths?: string[] };
            for (const path of payload.paths ?? []) {
              await r2.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey(path) }));
            }
            return json({ ok: true });
          }

          if (params.operation === "sign") {
            const payload = (await request.json()) as { path?: string; expiresIn?: number };
            const key = objectKey(payload.path ?? "");
            const expiresIn = Math.min(Math.max(Number(payload.expiresIn) || 3600, 1), 86400);
            const url = await getSignedUrl(
              r2,
              new GetObjectCommand({ Bucket: bucketName, Key: key }),
              { expiresIn },
            );
            return json({ url });
          }

          return json({ error: "Unsupported storage operation" }, 404);
        } catch (error) {
          console.error("R2 storage POST failed", error);

          const message = error instanceof Error ? error.message : String(error);

          return json(
            {
              error: "Storage request failed",
              details: message,
            },
            500,
          );
        }
      },
    },
  },
});
