import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWhen, WhenEvaluationError } from '../src/when-evaluator.js';
import type { ExecutionContext } from '../src/types.js';

function ctx(outputs: Record<string, unknown> = {}, env: Record<string, string> = {}): ExecutionContext {
  return {
    workflowName: 'test',
    artifactsDir: '/tmp',
    outputs: outputs as ExecutionContext['outputs'],
    env,
  };
}

describe('evaluateWhen', () => {
  it('returns true for empty or undefined expressions', () => {
    assert.equal(evaluateWhen(undefined, ctx()), true);
    assert.equal(evaluateWhen('', ctx()), true);
    assert.equal(evaluateWhen('   ', ctx()), true);
  });

  it('evaluates equality on string outputs', () => {
    const c = ctx({ classify: { nodeId: 'classify', success: true, output: { kind: 'bug' } } });
    assert.equal(evaluateWhen("$classify.output.kind == 'bug'", c), true);
    assert.equal(evaluateWhen("$classify.output.kind == 'feature'", c), false);
  });

  it('evaluates inequality', () => {
    const c = ctx({ classify: { nodeId: 'classify', success: true, output: { kind: 'bug' } } });
    assert.equal(evaluateWhen("$classify.output.kind != 'feature'", c), true);
    assert.equal(evaluateWhen("$classify.output.kind != 'bug'", c), false);
  });

  it('evaluates equality on numeric outputs', () => {
    const c = ctx({ tests: { nodeId: 'tests', success: true, exitCode: 0 } });
    assert.equal(evaluateWhen('$tests.exitCode == 0', c), true);
    assert.equal(evaluateWhen('$tests.exitCode == 1', c), false);
  });

  it('evaluates a bare reference for truthiness', () => {
    const c = ctx({ a: { nodeId: 'a', success: true } });
    assert.equal(evaluateWhen('$a.success', c), true);
    const c2 = ctx({ a: { nodeId: 'a', success: false } });
    assert.equal(evaluateWhen('$a.success', c2), false);
  });

  it('supports negation', () => {
    const c = ctx({ a: { nodeId: 'a', success: false } });
    assert.equal(evaluateWhen('!$a.success', c), true);
  });

  it('supports && and ||', () => {
    const c = ctx({
      a: { nodeId: 'a', success: true },
      b: { nodeId: 'b', success: false },
    });
    assert.equal(evaluateWhen('$a.success && $b.success', c), false);
    assert.equal(evaluateWhen('$a.success || $b.success', c), true);
    assert.equal(evaluateWhen('$a.success && !$b.success', c), true);
  });

  it('supports parentheses for grouping', () => {
    const c = ctx({
      a: { nodeId: 'a', success: true },
      b: { nodeId: 'b', success: false },
      cc: { nodeId: 'cc', success: false },
    });
    assert.equal(evaluateWhen('$a.success && ($b.success || $cc.success)', c), false);
    assert.equal(evaluateWhen('($a.success && $b.success) || !$cc.success', c), true);
  });

  it('treats unknown references as undefined', () => {
    const c = ctx();
    assert.equal(evaluateWhen('$ghost.output == 1', c), false);
    assert.equal(evaluateWhen("$ghost.output == 'x'", c), false);
  });

  it('treats string literals correctly', () => {
    assert.equal(evaluateWhen("'a' == 'a'", ctx()), true);
    assert.equal(evaluateWhen('"a" != "b"', ctx()), true);
  });

  it('throws on unrecognized tokens', () => {
    assert.throws(
      () => evaluateWhen('foo bar', ctx()),
      (err: unknown) => err instanceof WhenEvaluationError
    );
  });

  it('throws on unterminated strings', () => {
    assert.throws(
      () => evaluateWhen("'unterminated", ctx()),
      (err: unknown) => err instanceof WhenEvaluationError && /Unterminated string/.test(err.message)
    );
  });

  it('throws on missing closing paren', () => {
    assert.throws(
      () => evaluateWhen('($a.success', ctx({ a: { nodeId: 'a', success: true } })),
      (err: unknown) => err instanceof WhenEvaluationError
    );
  });
});
