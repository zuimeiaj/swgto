import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { ParsedOperation } from '../types.js';
import { ensureDir } from './fs.js';

export interface SnapshotEntry {
  /** Unique key: docUrl | method | path */
  key: string;
  method: string;
  path: string;
  functionName: string;
  summary?: string;
  moduleName: string;
}

interface Snapshot {
  version: 1;
  operations: SnapshotEntry[];
}

function buildKey(op: ParsedOperation): string {
  return `${op.docUrl}|${op.method}|${op.path}`;
}

function toEntry(op: ParsedOperation): SnapshotEntry {
  return {
    key: buildKey(op),
    method: op.method,
    path: op.path,
    functionName: op.functionName,
    summary: op.summary,
    moduleName: op.moduleName,
  };
}

export async function loadSnapshot(snapshotPath: string): Promise<Map<string, SnapshotEntry>> {
  const map = new Map<string, SnapshotEntry>();
  try {
    const raw = await readFile(snapshotPath, 'utf8');
    const data: Snapshot = JSON.parse(raw);
    if (data.version === 1) {
      for (const entry of data.operations) {
        map.set(entry.key, entry);
      }
    }
  } catch {
    // no previous snapshot — all APIs are new
  }
  return map;
}

export async function saveSnapshot(snapshotPath: string, operations: ParsedOperation[]): Promise<void> {
  const snapshot: Snapshot = {
    version: 1,
    operations: operations.map(toEntry),
  };
  await ensureDir(path.dirname(snapshotPath));
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
}

export interface CompareResult {
  newOperations: SnapshotEntry[];
  removedOperations: SnapshotEntry[];
}

export function compareSnapshot(previous: Map<string, SnapshotEntry>, current: ParsedOperation[]): CompareResult {
  const currentKeys = new Set<string>();
  const newOperations: SnapshotEntry[] = [];

  for (const op of current) {
    const key = buildKey(op);
    currentKeys.add(key);
    if (!previous.has(key)) {
      newOperations.push(toEntry(op));
    }
  }

  const removedOperations: SnapshotEntry[] = [];
  for (const [key, entry] of previous) {
    if (!currentKeys.has(key)) {
      removedOperations.push(entry);
    }
  }

  return { newOperations, removedOperations };
}

export const SNAPSHOT_FILE = '.swaggerts.cache.json';
