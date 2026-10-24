import { newId, nowIso, type AuditEntry } from "./types.js";

export class AuditLog {
  private entries: AuditEntry[] = [];

  constructor(private max = 500) {}

  push(
    partial: Omit<AuditEntry, "id" | "at"> & { at?: string },
  ): AuditEntry {
    const entry: AuditEntry = {
      id: newId("aud"),
      at: partial.at ?? nowIso(),
      keyLabel: partial.keyLabel,
      serverId: partial.serverId,
      method: partial.method,
      toolName: partial.toolName,
      status: partial.status,
      durationMs: partial.durationMs,
      error: partial.error,
      clientIp: partial.clientIp,
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.max) {
      this.entries.length = this.max;
    }
    return entry;
  }

  list(limit = 50): AuditEntry[] {
    return this.entries.slice(0, limit);
  }

  stats() {
    const byMethod: Record<string, number> = {};
    const byServer: Record<string, number> = {};
    let errors = 0;
    for (const e of this.entries) {
      byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
      byServer[e.serverId] = (byServer[e.serverId] ?? 0) + 1;
      if (e.status >= 400 || e.error) errors += 1;
    }
    return {
      total: this.entries.length,
      errors,
      byMethod,
      byServer,
    };
  }

  clear() {
    this.entries = [];
  }
}
