import Dexie, { type EntityTable } from "dexie";
export type CachedQueue = { id: number; payload: string; cachedAt: string };
class PaceLocal extends Dexie {
  queue!: EntityTable<CachedQueue, "id">;
  constructor() {
    super("pace-officer");
    this.version(1).stores({ queue: "id,cachedAt" });
  }
}
export const localData = typeof window === "undefined" ? null : new PaceLocal();
