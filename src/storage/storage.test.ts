import test from "node:test";
import assert from "node:assert/strict";

import { createStorageProvider, resolveStorageProviderName } from "./providers/factory.ts";
import { getBucketConfig, isGameflexBucket, GAMEFLEX_BUCKETS } from "./buckets.ts";
import {
  MAX_UPLOAD_BYTES,
  createStableObjectKey,
  sanitizeObjectKey,
  validateUploadLimits,
  validateMagicBytes,
} from "./validation.ts";

test("factory resolves the configured provider", () => {
  const previous = process.env.VITE_STORAGE_PROVIDER;
  const previousApi = process.env.STORAGE_API_URL;
  try {
    process.env.VITE_STORAGE_PROVIDER = "r2";
    process.env.VITE_STORAGE_API_URL = "https://storage.example.test";
    process.env.STORAGE_API_URL = "https://storage.example.test";
    assert.equal(resolveStorageProviderName(), "r2");
    assert.equal(createStorageProvider().kind, "r2");

    process.env.VITE_STORAGE_PROVIDER = "vps";
    assert.equal(resolveStorageProviderName(), "vps");
    assert.equal(createStorageProvider().kind, "vps");

    process.env.VITE_STORAGE_PROVIDER = "s3";
    assert.equal(resolveStorageProviderName(), "s3");
    assert.equal(createStorageProvider().kind, "s3");

    process.env.VITE_STORAGE_PROVIDER = "supabase";
    assert.equal(resolveStorageProviderName(), "supabase");
    assert.equal(createStorageProvider().kind, "supabase");

    delete process.env.VITE_STORAGE_PROVIDER;
    assert.equal(resolveStorageProviderName(), "r2");
  } finally {
    if (previous === undefined) delete process.env.VITE_STORAGE_PROVIDER;
    else process.env.VITE_STORAGE_PROVIDER = previous;
    delete process.env.VITE_STORAGE_API_URL;
    if (previousApi === undefined) delete process.env.STORAGE_API_URL;
    else process.env.STORAGE_API_URL = previousApi;
  }
});

test("bucket registry is the single source of truth", () => {
  for (const bucket of Object.values(GAMEFLEX_BUCKETS)) {
    assert.ok(isGameflexBucket(bucket));
    assert.ok(getBucketConfig(bucket));
  }

  assert.throws(() => getBucketConfig("bad-bucket"), /Unsupported GameFlex bucket/);
});

test("valid uploads pass the 10 MB limit and MIME rules", () => {
  const valid = new Blob([new Uint8Array(1024)], { type: "image/png" });
  assert.doesNotThrow(() => validateUploadLimits(valid, "image/png", "avatars"));
  assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);

  const max = new Blob([new Uint8Array(MAX_UPLOAD_BYTES)], { type: "image/jpeg" });
  assert.doesNotThrow(() => validateUploadLimits(max, "image/jpeg", "avatars"));

  const oversized = new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)], { type: "image/jpeg" });
  assert.throws(
    () => validateUploadLimits(oversized, "image/jpeg", "avatars"),
    /exceeds the 10 MB/,
  );

  assert.throws(
    () => validateUploadLimits(new Blob(["text"], { type: "text/plain" }), "text/plain", "avatars"),
    /not allowed/,
  );
});

test("object keys are sanitized and path traversal is rejected", () => {
  const key = createStableObjectKey("avatars", "user-123", "profile", "png");
  assert.match(key, /^avatars\/user-123\//);
  assert.equal(key.endsWith(".png"), true);

  assert.throws(() => sanitizeObjectKey("../secrets"), /Invalid object key/);
  assert.throws(() => sanitizeObjectKey("/absolute/path"), /Invalid object key/);
  assert.throws(() => sanitizeObjectKey(""), /Object key is required/);
});

test("magic-byte validation catches mismatched media signatures", async () => {
  const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
  await assert.doesNotReject(() => validateMagicBytes(jpeg, "avatars", "image/jpeg"));

  const badPng = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: "image/png" });
  await assert.rejects(
    () => validateMagicBytes(badPng, "avatars", "image/png"),
    /does not match PNG/,
  );
});
