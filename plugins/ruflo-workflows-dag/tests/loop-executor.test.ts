import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeLoop,
  extractPromiseSignal,
  type LoopRunner,
  type InteractiveGate,
} from '../src/loop-executor.js';

class ScriptedRunner implements LoopRunner {
  public calls: { prompt: string; freshContext: boolean }[] = [];
  constructor(private readonly responses: string[]) {}
  async run(prompt: string, freshContext: boolean): Promise<string> {
    this.calls.push({ prompt, freshContext });
    if (this.responses.length === 0) {
      throw new Error('runner exhausted');
    }
    return this.responses.shift()!;
  }
}

class ScriptedGate implements InteractiveGate {
  public messages: string[] = [];
  constructor(private readonly responses: string[]) {}
  async prompt(message: string): Promise<string> {
    this.messages.push(message);
    return this.responses.shift() ?? '';
  }
}

describe('extractPromiseSignal', () => {
  it('extracts a signal from anywhere in the response', () => {
    assert.equal(extractPromiseSignal('done <promise>COMPLETE</promise>'), 'COMPLETE');
    assert.equal(
      extractPromiseSignal('blah\n<promise>ALL_TASKS_COMPLETE</promise>\nmore'),
      'ALL_TASKS_COMPLETE'
    );
  });

  it('returns undefined when no signal is present', () => {
    assert.equal(extractPromiseSignal('just text'), undefined);
    assert.equal(extractPromiseSignal(''), undefined);
  });

  it('uppercases lowercase signals', () => {
    assert.equal(extractPromiseSignal('<promise>complete</promise>'), 'COMPLETE');
  });

  it('matches the first signal when multiple are present', () => {
    assert.equal(
      extractPromiseSignal('<promise>FIRST</promise> then <promise>SECOND</promise>'),
      'FIRST'
    );
  });
});

describe('executeLoop', () => {
  it('completes when the configured signal is emitted', async () => {
    const runner = new ScriptedRunner([
      'working...',
      'still working...',
      'all done <promise>COMPLETE</promise>',
    ]);
    const result = await executeLoop(
      'impl',
      { prompt: 'do work', until: 'COMPLETE', max_iterations: 5 },
      runner
    );
    assert.equal(result.success, true);
    assert.equal(result.iterations, 3);
    assert.equal(runner.calls.length, 3);
  });

  it('fails when max_iterations is reached without a signal', async () => {
    const runner = new ScriptedRunner(['no signal', 'still no signal', 'nope']);
    const result = await executeLoop(
      'impl',
      { prompt: 'do work', until: 'COMPLETE', max_iterations: 3 },
      runner
    );
    assert.equal(result.success, false);
    assert.equal(result.iterations, 3);
    assert.match(result.error ?? '', /max_iterations \(3\)/);
  });

  it('uses the default max_iterations of 15 when unspecified', async () => {
    const runner = new ScriptedRunner(Array(15).fill('still going'));
    const result = await executeLoop(
      'impl',
      { prompt: 'do work', until: 'COMPLETE' },
      runner
    );
    assert.equal(result.iterations, 15);
    assert.equal(result.success, false);
  });

  it('passes fresh_context flag through to the runner', async () => {
    const runner = new ScriptedRunner(['<promise>DONE</promise>']);
    await executeLoop(
      'impl',
      { prompt: 'do work', until: 'DONE', fresh_context: true },
      runner
    );
    assert.equal(runner.calls[0].freshContext, true);
  });

  it('substitutes $LOOP_USER_INPUT in the prompt during interactive loops', async () => {
    const runner = new ScriptedRunner([
      'iteration 1',
      'iteration 2 done <promise>APPROVED</promise>',
    ]);
    const gate = new ScriptedGate(['tweak naming']);
    const result = await executeLoop(
      'approve',
      {
        prompt: 'present changes; feedback: $LOOP_USER_INPUT',
        until: 'APPROVED',
        interactive: true,
        gate_message: 'Continue?',
        max_iterations: 5,
      },
      runner,
      gate
    );
    assert.equal(result.success, true);
    assert.equal(runner.calls[0].prompt, 'present changes; feedback: ');
    assert.equal(runner.calls[1].prompt, 'present changes; feedback: tweak naming');
    assert.deepEqual(gate.messages, ['Continue?']);
  });

  it('stops when the user types "stop" in an interactive loop', async () => {
    const runner = new ScriptedRunner(['turn 1', 'turn 2']);
    const gate = new ScriptedGate(['stop']);
    const result = await executeLoop(
      'approve',
      {
        prompt: 'present changes',
        until: 'APPROVED',
        interactive: true,
        max_iterations: 10,
      },
      runner,
      gate
    );
    assert.equal(result.success, false);
    assert.equal(result.error, 'stopped by user');
    assert.equal(runner.calls.length, 1);
  });
});
