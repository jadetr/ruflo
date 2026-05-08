import type { ExecutionContext } from './types.js';

const REFERENCE_PATTERN = /\$([a-zA-Z_][\w-]*)(\.[\w.]+)?/g;

/**
 * Resolve $node.output.path references inside a string template using the
 * given execution context. Unknown references are left as the literal
 * `$node.path` so authors notice them in logs rather than silently getting
 * `undefined`.
 *
 * Recognized environment variables ($USER_MESSAGE, $ARTIFACTS_DIR, etc.) are
 * resolved from ctx.env when no matching node output exists.
 */
export function interpolate(template: string, ctx: ExecutionContext): string {
  return template.replace(REFERENCE_PATTERN, (full, head: string, tail: string | undefined) => {
    const nodeOutput = ctx.outputs[head];
    if (nodeOutput) {
      const path = (tail ?? '').split('.').filter(Boolean);
      let value: unknown = nodeOutput;
      for (const part of path) {
        if (value == null || typeof value !== 'object') return full;
        value = (value as Record<string, unknown>)[part];
      }
      return stringify(value);
    }
    if (ctx.env[head] !== undefined && !tail) {
      return ctx.env[head];
    }
    return full;
  });
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
