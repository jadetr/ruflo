import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflow, WorkflowParseError } from '../src/parser.js';

describe('parseWorkflow', () => {
  it('parses a minimal valid workflow', () => {
    const result = parseWorkflow({
      name: 'minimal',
      nodes: [{ id: 'a', prompt: 'hello' }],
    });
    assert.equal(result.definition.name, 'minimal');
    assert.deepEqual(result.executionOrder, [['a']]);
    assert.equal(result.nodeMap.size, 1);
  });

  it('produces topological layers for a linear DAG', () => {
    const result = parseWorkflow({
      name: 'linear',
      nodes: [
        { id: 'a', prompt: 'first' },
        { id: 'b', depends_on: ['a'], bash: 'echo b' },
        { id: 'c', depends_on: ['b'], prompt: 'last' },
      ],
    });
    assert.deepEqual(result.executionOrder, [['a'], ['b'], ['c']]);
  });

  it('groups independent nodes into the same layer for fan-out', () => {
    const result = parseWorkflow({
      name: 'fanout',
      nodes: [
        { id: 'root', prompt: 'r' },
        { id: 'a', depends_on: ['root'], prompt: 'a' },
        { id: 'b', depends_on: ['root'], prompt: 'b' },
        { id: 'c', depends_on: ['root'], prompt: 'c' },
        { id: 'join', depends_on: ['a', 'b', 'c'], prompt: 'j' },
      ],
    });
    assert.equal(result.executionOrder.length, 3);
    assert.deepEqual(result.executionOrder[0], ['root']);
    assert.deepEqual([...result.executionOrder[1]].sort(), ['a', 'b', 'c']);
    assert.deepEqual(result.executionOrder[2], ['join']);
  });

  it('rejects a cycle', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'cycle',
          nodes: [
            { id: 'a', depends_on: ['b'], prompt: 'a' },
            { id: 'b', depends_on: ['a'], prompt: 'b' },
          ],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /Cycle detected/.test(err.message)
    );
  });

  it('rejects a self-dependency', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'self',
          nodes: [{ id: 'a', depends_on: ['a'], prompt: 'a' }],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /cannot depend on itself/.test(err.message)
    );
  });

  it('rejects unknown depends_on references', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'unknown',
          nodes: [{ id: 'a', depends_on: ['ghost'], prompt: 'a' }],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /unknown node "ghost"/.test(err.message)
    );
  });

  it('rejects duplicate node ids', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'dup',
          nodes: [
            { id: 'a', prompt: 'first' },
            { id: 'a', prompt: 'second' },
          ],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /Duplicate node id/.test(err.message)
    );
  });

  it('rejects nodes with no execution kind', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'empty',
          nodes: [{ id: 'a' }],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError &&
        /must define one of: prompt, bash, loop, command/.test(err.message)
    );
  });

  it('rejects nodes with multiple execution kinds', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'mixed',
          nodes: [{ id: 'a', prompt: 'p', bash: 'b' }],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /defines multiple kinds/.test(err.message)
    );
  });

  it('rejects loop nodes missing prompt or until', () => {
    assert.throws(
      () =>
        parseWorkflow({
          name: 'badloop',
          nodes: [{ id: 'a', loop: { prompt: 'p' } as never }],
        }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /loop\.until is required/.test(err.message)
    );
  });

  it('rejects a workflow with no nodes', () => {
    assert.throws(
      () => parseWorkflow({ name: 'empty', nodes: [] }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /non-empty `nodes` array/.test(err.message)
    );
  });

  it('rejects a workflow with no name', () => {
    assert.throws(
      () => parseWorkflow({ nodes: [{ id: 'a', prompt: 'p' }] }),
      (err: unknown) =>
        err instanceof WorkflowParseError && /non-empty `name`/.test(err.message)
    );
  });
});
