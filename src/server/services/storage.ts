import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Storage abstraction for private file objects (student documents Phase 9,
 * exam paper documents Phase 16).
 *
 * File bytes must never be exposed through a public URL — every read goes
 * through an authenticated route handler that checks role + permission first.
 * This provider interface is the single seam where real object storage (S3,
 * Azure Blob, GCS) would be wired in.
 *
 * The default provider persists to a local directory (`UPLOAD_DIR`, default
 * `<project>/.uploads`), keeping the workflow fully functional in development
 * and compatible with a mounted volume in production. Swap the provider for an
 * object store when a managed backend is desired.
 */

export type StoredObject = {
  key: string;
  sizeBytes: number;
  mimeType: string;
};

export type StorageProvider = {
  /**
   * Persist `data` and return the opaque storage key, or null when no real
   * provider is available. Rejects when the provider errors.
   */
  put(input: {
    data: Uint8Array;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ key: string } | null>;

  /**
   * Read a previously persisted object by its opaque key as raw bytes.
   * Returns null when the key is unknown or no real provider is available.
   */
  get(key: string): Promise<Uint8Array | null>;

  /** Permanently remove an object by its opaque key. No-op when unknown. */
  remove(key: string): Promise<void>;

  /** Whether the provider can actually persist new objects. */
  readonly available: boolean;
};

/** No-op provider: never persists anything (fallback when no backend is set). */
export const noopProvider: StorageProvider = {
  available: false,
  async put() {
    return null;
  },
  async get() {
    return null;
  },
  async remove() {
    // nothing persisted — nothing to remove
  },
};

function baseDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), ".uploads");
}

/**
 * Resolve `key` inside the storage root, rejecting keys that would escape it
 * (path traversal). Keys are provider-generated opaque values; this is defense
 * in depth so a corrupt DB row can never read/write arbitrary files.
 */
function resolveInside(key: string): string {
  const root = resolve(/* turbopackIgnore: true */ baseDir());
  const target = resolve(root, key);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Storage key escapes the storage root");
  }
  return target;
}

/** Local-disk provider: write-through persistence under `UPLOAD_DIR`. */
export const localDiskProvider: StorageProvider = {
  available: true,

  async put({ data }) {
    const key = `object/${randomUUID()}`;
    const target = resolveInside(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return { key };
  },

  async get(key) {
    const target = resolveInside(key);
    try {
      const buf = await readFile(/* turbopackIgnore: true */ target);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  },

  async remove(key) {
    const target = resolveInside(key);
    try {
      await unlink(target);
    } catch {
      // missing file is already removed
    }
  },
};

export const storage: StorageProvider = localDiskProvider;