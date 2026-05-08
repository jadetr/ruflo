import type {
  NodeId,
  ParsedWorkflow,
  WorkflowDefinition,
  WorkflowNode,
} from './types.js';

export class WorkflowParseError extends Error {
  constructor(message: string, public readonly nodeId?: NodeId) {
    super(message);
    this.name = 'WorkflowParseError';
  }
}

/**
 * Parse a workflow definition object (already loaded from YAML/JSON) into
 * a validated, topologically-ordered execution plan.
 *
 * Validation:
 *   - unique node ids
 *   - exactly one execution kind per node (prompt | bash | loop | command)
 *   - all depends_on references resolve to known nodes
 *   - no cycles
 */
export function parseWorkflow(input: unknown): ParsedWorkflow {
  const definition = validateShape(input);
  const nodeMap = buildNodeMap(definition.nodes);
  validateDependencies(definition.nodes, nodeMap);
  const executionOrder = topologicalLayers(definition.nodes, nodeMap);
  return { definition, executionOrder, nodeMap };
}

function validateShape(input: unknown): WorkflowDefinition {
  if (!input || typeof input !== 'object') {
    throw new WorkflowParseError('Workflow root must be an object');
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    throw new WorkflowParseError('Workflow must have a non-empty `name`');
  }
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) {
    throw new WorkflowParseError('Workflow must have a non-empty `nodes` array');
  }

  const nodes: WorkflowNode[] = obj.nodes.map((raw, index) =>
    validateNode(raw, index)
  );

  return {
    name: obj.name,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    provider: obj.provider as WorkflowDefinition['provider'],
    model: typeof obj.model === 'string' ? obj.model : undefined,
    interactive: typeof obj.interactive === 'boolean' ? obj.interactive : undefined,
    nodes,
  };
}

function validateNode(raw: unknown, index: number): WorkflowNode {
  if (!raw || typeof raw !== 'object') {
    throw new WorkflowParseError(`Node at index ${index} must be an object`);
  }
  const node = raw as Record<string, unknown>;
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new WorkflowParseError(`Node at index ${index} must have a string id`);
  }

  const kinds = ['prompt', 'bash', 'loop', 'command'].filter(
    (k) => node[k] !== undefined && node[k] !== null
  );
  if (kinds.length === 0) {
    throw new WorkflowParseError(
      `Node "${node.id}" must define one of: prompt, bash, loop, command`,
      node.id as string
    );
  }
  if (kinds.length > 1) {
    throw new WorkflowParseError(
      `Node "${node.id}" defines multiple kinds (${kinds.join(', ')}); pick one`,
      node.id as string
    );
  }

  if (node.depends_on !== undefined && !Array.isArray(node.depends_on)) {
    throw new WorkflowParseError(
      `Node "${node.id}" depends_on must be an array of node ids`,
      node.id as string
    );
  }

  if (node.loop !== undefined) {
    const loop = node.loop as Record<string, unknown>;
    if (typeof loop.prompt !== 'string' || loop.prompt.length === 0) {
      throw new WorkflowParseError(
        `Node "${node.id}" loop.prompt is required`,
        node.id as string
      );
    }
    if (typeof loop.until !== 'string' || loop.until.length === 0) {
      throw new WorkflowParseError(
        `Node "${node.id}" loop.until is required (the promise signal name)`,
        node.id as string
      );
    }
  }

  return node as unknown as WorkflowNode;
}

function buildNodeMap(nodes: WorkflowNode[]): Map<NodeId, WorkflowNode> {
  const map = new Map<NodeId, WorkflowNode>();
  for (const node of nodes) {
    if (map.has(node.id)) {
      throw new WorkflowParseError(`Duplicate node id "${node.id}"`, node.id);
    }
    map.set(node.id, node);
  }
  return map;
}

function validateDependencies(
  nodes: WorkflowNode[],
  nodeMap: Map<NodeId, WorkflowNode>
): void {
  for (const node of nodes) {
    for (const dep of node.depends_on ?? []) {
      if (!nodeMap.has(dep)) {
        throw new WorkflowParseError(
          `Node "${node.id}" depends on unknown node "${dep}"`,
          node.id
        );
      }
      if (dep === node.id) {
        throw new WorkflowParseError(
          `Node "${node.id}" cannot depend on itself`,
          node.id
        );
      }
    }
  }
}

/**
 * Group nodes into execution layers. Each layer contains nodes whose
 * dependencies are all satisfied by previous layers, enabling parallel
 * execution within a layer. Detects cycles via Kahn's algorithm.
 */
function topologicalLayers(
  nodes: WorkflowNode[],
  nodeMap: Map<NodeId, WorkflowNode>
): NodeId[][] {
  const remainingDeps = new Map<NodeId, Set<NodeId>>();
  for (const node of nodes) {
    remainingDeps.set(node.id, new Set(node.depends_on ?? []));
  }

  const layers: NodeId[][] = [];
  let resolved = 0;

  while (resolved < nodes.length) {
    const layer: NodeId[] = [];
    for (const [id, deps] of remainingDeps) {
      if (deps.size === 0) layer.push(id);
    }
    if (layer.length === 0) {
      const stuck = Array.from(remainingDeps.keys());
      throw new WorkflowParseError(
        `Cycle detected in workflow; unresolvable nodes: ${stuck.join(', ')}`
      );
    }
    layers.push(layer);
    for (const id of layer) {
      remainingDeps.delete(id);
      resolved++;
    }
    for (const deps of remainingDeps.values()) {
      for (const id of layer) deps.delete(id);
    }
  }

  return layers;
}
