/**
 * Type definitions for declarative DAG workflows.
 *
 * A workflow is a directed acyclic graph of nodes. Each node is one of:
 *   - prompt node (AI step)
 *   - bash node (deterministic shell step)
 *   - loop node (AI step that repeats until a promise signal is emitted)
 *   - command node (reference to a reusable command file)
 */

export type NodeId = string;

export interface LoopConfig {
  prompt: string;
  until: string;
  max_iterations?: number;
  fresh_context?: boolean;
  interactive?: boolean;
  gate_message?: string;
}

export interface WorkflowNode {
  id: NodeId;
  description?: string;
  depends_on?: NodeId[];
  when?: string;
  agent?: string;
  model?: string;
  prompt?: string;
  bash?: string;
  command?: string;
  loop?: LoopConfig;
  context?: 'fresh' | 'inherit';
  output_format?: Record<string, unknown>;
  trigger_rule?: 'all_success' | 'one_success';
  allowed_tools?: string[];
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  provider?: 'claude' | 'codex';
  model?: string;
  interactive?: boolean;
  nodes: WorkflowNode[];
}

export interface ParsedWorkflow {
  definition: WorkflowDefinition;
  executionOrder: NodeId[][];
  nodeMap: Map<NodeId, WorkflowNode>;
}

export interface NodeOutput {
  nodeId: NodeId;
  success: boolean;
  output?: unknown;
  error?: string;
  exitCode?: number;
  iterations?: number;
  durationMs?: number;
}

export interface ExecutionContext {
  workflowName: string;
  artifactsDir: string;
  outputs: Record<NodeId, NodeOutput>;
  env: Record<string, string>;
}
