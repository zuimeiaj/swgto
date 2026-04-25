import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
}

export async function removeDir(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    // Windows may hold file locks briefly; retry once
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rm(dirPath, { recursive: true, force: true });
  }
}
