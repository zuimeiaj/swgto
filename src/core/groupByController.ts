import type { ParsedOperation } from '../types.js';

export interface GroupedControllers {
  [controllerName: string]: ParsedOperation[];
}

function isPathParam(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

function resultName(segments: string[], childIndex: number): string {
  if (childIndex >= 2) {
    return segments[childIndex - 1] + '_' + segments[childIndex];
  }
  return segments[childIndex];
}

function getPathMethods(operations: ParsedOperation[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const op of operations) {
    if (!map.has(op.path)) map.set(op.path, new Set());
    map.get(op.path)!.add(op.method);
  }
  return map;
}

/**
 * Derive a controller name from a path by finding the most appropriate
 * "resource" segment. Uses HTTP method count to distinguish RESTful
 * resource endpoints from action-style endpoints.
 */
function deriveControllerName(
  path: string,
  allPaths: Set<string>,
  pathMethods: Map<string, Set<string>>,
): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'index';
  if (segments.length === 1) return segments[0];

  // Strip trailing path parameters: /a/b/{id} → /a/b
  let effectiveLen = segments.length;
  while (effectiveLen > 1 && isPathParam(segments[effectiveLen - 1])) {
    effectiveLen--;
  }
  if (effectiveLen === 1) return segments[0];

  // Walk up from deepest level to find the best controller
  for (let depth = effectiveLen - 1; depth >= 0; depth--) {
    const ancestorPath = '/' + segments.slice(0, depth).join('/');

    // Check if this ancestor is a RESTful resource (multiple HTTP methods)
    const ancestorMethods = pathMethods.get(ancestorPath);
    if (ancestorMethods && ancestorMethods.size > 1 && depth >= 1) {
      return segments[depth - 1];
    }

    if (depth >= 1) {
      // If the ancestor is itself an endpoint, check if it would be
      // grouped under something else (e.g. /system/dept/list → dept)
      if (allPaths.has(ancestorPath)) {
        const ancestorController = deriveControllerName(ancestorPath, allPaths, pathMethods);
        if (ancestorController !== segments[depth - 1]) {
          return ancestorController;
        }
        return segments[depth - 1];
      }

      // Check for direct sibling paths under this ancestor
      const hasDirectSibling = [...allPaths].some((p) => {
        if (p === path) return false;
        if (!p.startsWith(ancestorPath + '/')) return false;
        const remaining = p.slice(ancestorPath.length + 1);
        return !remaining.includes('/');
      });

      if (hasDirectSibling) {
        // Check if siblings include RESTful resources
        const siblingIsRest = [...allPaths].some((p) => {
          if (p === path) return false;
          if (!p.startsWith(ancestorPath + '/')) return false;
          const remaining = p.slice(ancestorPath.length + 1);
          if (remaining.includes('/')) return false;
          const methods = pathMethods.get(p);
          return methods != null && methods.size > 1;
        });

        if (siblingIsRest) {
          return resultName(segments, depth);
        }

        // Siblings are action-style → group under the ancestor
        return segments[depth - 1];
      }
    }

    // Check if this depth's path has children
    const currentPath = '/' + segments.slice(0, depth + 1).join('/');
    const hasChildren = [...allPaths].some(
      (p) => p !== path && p.startsWith(currentPath + '/'),
    );
    if (hasChildren) {
      return resultName(segments, depth);
    }
  }

  // Ultimate fallback: use the first non-param segment
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!isPathParam(segments[i])) return resultName(segments, i);
  }

  return segments[segments.length - 1];
}

export function groupByController(operations: ParsedOperation[]): GroupedControllers {
  const allPaths = new Set(operations.map((op) => op.path));
  const pathMethods = getPathMethods(operations);

  return operations.reduce<GroupedControllers>((acc, operation) => {
    const controllerName = deriveControllerName(operation.path, allPaths, pathMethods);
    acc[controllerName] ??= [];
    acc[controllerName].push(operation);
    return acc;
  }, {} as GroupedControllers);
}
