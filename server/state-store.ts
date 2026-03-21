import fs from "node:fs";
import path from "node:path";

export interface StateStore<T> {
  load(): T | null;
  save(payload: T): void;
}

class MemoryStateStore<T> implements StateStore<T> {
  private snapshot: T | null = null;

  load() {
    return this.snapshot;
  }

  save(payload: T) {
    this.snapshot = payload;
  }
}

class FileStateStore<T> implements StateStore<T> {
  private readonly filePath: string;

  constructor(filename: string) {
    const dir = process.env.STATE_STORE_DIR || path.join(process.cwd(), ".tmp", "state");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, `${filename}.json`);
  }

  load(): T | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }
    try {
      const contents = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(contents) as T;
    } catch (error) {
      console.warn("[state-store] Failed to read persisted state:", error);
      return null;
    }
  }

  save(payload: T): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf-8");
    } catch (error) {
      console.warn("[state-store] Failed to persist state:", error);
    }
  }
}

export function createStateStore<T>(name: string): StateStore<T> {
  const provider = (process.env.STATE_STORE_PROVIDER || "memory").toLowerCase();
  if (provider === "file") {
    return new FileStateStore<T>(name);
  }
  return new MemoryStateStore<T>();
}

