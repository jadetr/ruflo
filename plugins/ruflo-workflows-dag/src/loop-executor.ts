import type { LoopConfig, NodeId, NodeOutput } from './types.js';

export interface LoopIteration {
  iteration: number;
  output: string;
  signal?: string;
}

export interface LoopRunner {
  run(prompt: string, freshContext: boolean): Promise<string>;
}

export interface InteractiveGate {
  prompt(message: string): Promise<string>;
}

const PROMISE_PATTERN = /<promise>([A-Z0-9_]+)<\/promise>/i;

/**
 * Extract a promise signal from an AI response. Returns the signal name
 * (uppercased) or undefined if no signal is present.
 *
 * Convention: agents emit completion signals as `<promise>SIGNAL_NAME</promise>`
 * anywhere in their output. The first match wins.
 */
export function extractPromiseSignal(output: string): string | undefined {
  const match = output.match(PROMISE_PATTERN);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Execute a loop node. Drives a runner repeatedly until the configured
 * promise signal is emitted or max_iterations is reached.
 *
 * In interactive mode, the gate is invoked between iterations with the
 * configured gate_message. Its response is passed to the next iteration
 * via $LOOP_USER_INPUT substitution in the prompt.
 */
export async function executeLoop(
  nodeId: NodeId,
  config: LoopConfig,
  runner: LoopRunner,
  gate?: InteractiveGate
): Promise<NodeOutput> {
  const maxIterations = config.max_iterations ?? 15;
  const target = config.until.toUpperCase();
  const start = Date.now();

  let userInput = '';
  let lastOutput = '';

  for (let i = 1; i <= maxIterations; i++) {
    const prompt = config.prompt.replace(/\$LOOP_USER_INPUT/g, userInput);
    lastOutput = await runner.run(prompt, config.fresh_context ?? false);
    const signal = extractPromiseSignal(lastOutput);

    if (signal === target) {
      return {
        nodeId,
        success: true,
        output: lastOutput,
        iterations: i,
        durationMs: Date.now() - start,
      };
    }

    if (config.interactive && gate) {
      userInput = await gate.prompt(
        config.gate_message ?? 'Continue, modify, or stop?'
      );
      if (userInput.trim().toLowerCase() === 'stop') {
        return {
          nodeId,
          success: false,
          output: lastOutput,
          error: 'stopped by user',
          iterations: i,
          durationMs: Date.now() - start,
        };
      }
    }
  }

  return {
    nodeId,
    success: false,
    output: lastOutput,
    error: `loop reached max_iterations (${maxIterations}) without signal "${target}"`,
    iterations: maxIterations,
    durationMs: Date.now() - start,
  };
}
