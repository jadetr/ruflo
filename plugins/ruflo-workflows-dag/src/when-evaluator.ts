import type { ExecutionContext, NodeOutput } from './types.js';

export class WhenEvaluationError extends Error {
  constructor(message: string, public readonly expression: string) {
    super(message);
    this.name = 'WhenEvaluationError';
  }
}

/**
 * Evaluate a `when:` expression against an execution context.
 *
 * Supported syntax (intentionally minimal — no arbitrary code execution):
 *
 *   $node.output.field == 'value'
 *   $node.output.field != 'value'
 *   $node.output == 42
 *   $node.exit_code == 0
 *   $node.success
 *   !$node.success
 *   $a.output && $b.output
 *   $a.output || $b.output
 *
 * Returns true if the expression resolves truthy. An undefined or empty
 * expression evaluates to true (no condition).
 */
export function evaluateWhen(
  expression: string | undefined,
  ctx: ExecutionContext
): boolean {
  if (!expression || expression.trim().length === 0) return true;

  const tokens = tokenize(expression);
  const result = parseOr(tokens, ctx);
  if (tokens.length > 0) {
    throw new WhenEvaluationError(
      `Unexpected trailing tokens: ${tokens.join(' ')}`,
      expression
    );
  }
  return Boolean(result);
}

type Token = string;

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = expr.indexOf(ch, i + 1);
      if (end === -1) throw new WhenEvaluationError('Unterminated string', expr);
      tokens.push(expr.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (expr.startsWith('==', i) || expr.startsWith('!=', i) ||
        expr.startsWith('&&', i) || expr.startsWith('||', i)) {
      tokens.push(expr.slice(i, i + 2));
      i += 2;
      continue;
    }
    if (ch === '!' || ch === '<' || ch === '>') {
      tokens.push(ch);
      i++;
      continue;
    }
    let j = i;
    while (j < expr.length && !/[\s()!=<>&|]/.test(expr[j])) j++;
    if (j === i) {
      throw new WhenEvaluationError(`Unexpected character: ${ch}`, expr);
    }
    tokens.push(expr.slice(i, j));
    i = j;
  }
  return tokens;
}

function parseOr(tokens: Token[], ctx: ExecutionContext): unknown {
  let left = parseAnd(tokens, ctx);
  while (tokens[0] === '||') {
    tokens.shift();
    const right = parseAnd(tokens, ctx);
    left = Boolean(left) || Boolean(right);
  }
  return left;
}

function parseAnd(tokens: Token[], ctx: ExecutionContext): unknown {
  let left = parseEquality(tokens, ctx);
  while (tokens[0] === '&&') {
    tokens.shift();
    const right = parseEquality(tokens, ctx);
    left = Boolean(left) && Boolean(right);
  }
  return left;
}

function parseEquality(tokens: Token[], ctx: ExecutionContext): unknown {
  const left = parseUnary(tokens, ctx);
  if (tokens[0] === '==' || tokens[0] === '!=') {
    const op = tokens.shift();
    const right = parseUnary(tokens, ctx);
    if (op === '==') return left === right;
    return left !== right;
  }
  return left;
}

function parseUnary(tokens: Token[], ctx: ExecutionContext): unknown {
  if (tokens[0] === '!') {
    tokens.shift();
    return !parseUnary(tokens, ctx);
  }
  return parsePrimary(tokens, ctx);
}

function parsePrimary(tokens: Token[], ctx: ExecutionContext): unknown {
  const tok = tokens.shift();
  if (tok === undefined) {
    throw new WhenEvaluationError('Unexpected end of expression', '');
  }
  if (tok === '(') {
    const value = parseOr(tokens, ctx);
    if (tokens.shift() !== ')') {
      throw new WhenEvaluationError('Missing closing parenthesis', tok);
    }
    return value;
  }
  if ((tok.startsWith('"') && tok.endsWith('"')) ||
      (tok.startsWith("'") && tok.endsWith("'"))) {
    return tok.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(tok)) {
    return Number(tok);
  }
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (tok === 'null') return null;
  if (tok.startsWith('$')) {
    return resolveReference(tok, ctx);
  }
  throw new WhenEvaluationError(`Unrecognized token: ${tok}`, tok);
}

function resolveReference(ref: string, ctx: ExecutionContext): unknown {
  const path = ref.slice(1).split('.');
  const [nodeId, ...rest] = path;
  const output: NodeOutput | undefined = ctx.outputs[nodeId];
  if (!output) return undefined;
  let value: unknown = output;
  for (const part of rest) {
    if (value == null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
