import type { ParsedOperation } from '../types.js';

export interface GroupedOperations {
  [moduleName: string]: ParsedOperation[];
}

export function groupByPrefix(operations: ParsedOperation[]): GroupedOperations {
  return operations.reduce<GroupedOperations>((acc, operation) => {
    acc[operation.moduleName] ??= [];
    acc[operation.moduleName].push(operation);
    return acc;
  }, {} as GroupedOperations);
}
