import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interpolate } from '../src/interpolate.js';
import type { ExecutionContext } from '../src/types.js';

function ctx(outputs: Record<string, unknown>, env: Record<string, string> = {}): ExecutionContext {
  return {
    workflowName: 'test',
    artifactsDir: '/tmp',
    outputs: outputs as ExecutionContext['outputs'],
    env,
  };
}

describe('interpolate', () => {
  it('resolves a top-level node output', () => {
    const c = ctx({
      a: { nodeId: 'a', success: true, output: 'hello world' },
    });
    assert.equal(interpolate('value: $a.output', c), 'value: hello world');
  });

  it('resolves nested fields', () => {
    const c = ctx({
      a: { nodeId: 'a', success: true, output: { kind: 'bug', priority: 'high' } },
    });
    assert.equal(
      interpolate('kind=$a.output.kind priority=$a.output.priority', c),
      'kind=bug priority=high'
    );
  });

  it('resolves environment variables for bare references', () => {
    const c = ctx({}, { USER_MESSAGE: 'fix the bug', ARTIFACTS_DIR: '/tmp/run-1' });
    assert.equal(
      interpolate('user said: $USER_MESSAGE in $ARTIFACTS_DIR', c),
      'user said: fix the bug in /tmp/run-1'
    );
  });

  it('leaves unknown references as literal text', () => {
    const c = ctx({});
    assert.equal(interpolate('hello $ghost.output world', c), 'hello $ghost.output world');
  });

  it('stringifies non-string outputs', () => {
    const c = ctx({
      n: { nodeId: 'n', success: true, output: 42 },
      o: { nodeId: 'o', success: true, output: { a: 1 } },
    });
    assert.equal(interpolate('n=$n.output o=$o.output', c), 'n=42 o={"a":1}');
  });

  it('emits empty string for null or undefined values', () => {
    const c = ctx({
      a: { nodeId: 'a', success: true, output: null },
    });
    assert.equal(interpolate('value:[$a.output]', c), 'value:[]');
  });

  it('does not crash on traversing into a non-object', () => {
    const c = ctx({
      a: { nodeId: 'a', success: true, output: 'flat' },
    });
    // .deeper does not exist on a string output — leave the reference literal
    assert.equal(interpolate('$a.output.deeper', c), '$a.output.deeper');
  });
});
