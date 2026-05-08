---
name: workflow
description: Run, validate, list, and inspect declarative DAG workflows defined in .ruflo/workflows/*.yaml
---
$ARGUMENTS

Handle declarative workflow commands based on the subcommand:

## Subcommands

### `workflow run <path>`
Execute a workflow from a YAML or JSON file. Steps:
1. Read the workflow file at the given path
2. Call the parser (`parseWorkflow`) to build the execution plan; abort on parse errors
3. Create an execution context with `$ARTIFACTS_DIR` set to a fresh per-run directory under `.ruflo/runs/<workflow-name>/<timestamp>/`
4. For each layer in the topological order:
   - In parallel, evaluate each node's `when:` condition against the current context
   - Skip nodes whose `when:` resolves to false (record skip in outputs)
   - For remaining nodes:
     - `prompt`: spawn a Task agent (`agent`/`model` overrides apply) with the interpolated prompt; capture stdout as the node output
     - `bash`: run the shell command; capture stdout, stderr, and exit_code
     - `loop`: invoke the loop executor with the configured promise signal and max_iterations
     - `command`: load the named command from `.ruflo/commands/<name>.md` and run it as a prompt node
   - Apply `trigger_rule`: `all_success` (default) requires every dependency to have succeeded; `one_success` requires at least one
5. After the run, write `outputs.json` and `events.log` into the artifacts directory
6. Display a summary table of node id / status / duration / iterations

### `workflow validate <path>`
Parse and validate a workflow file without executing it. Reports:
- Syntax / shape errors
- Unknown `depends_on` references
- Cycles (with the involved node ids)
- Layer plan (which nodes run in parallel)

### `workflow list`
List workflows discovered in `.ruflo/workflows/*.yaml` and `.ruflo/workflows/*.yml`. Show name, description, node count, and provider for each.

### `workflow inspect <path>`
Print the parsed structure of a workflow: layer-by-layer node ids, per-node kind (prompt/bash/loop/command), and resolved dependencies. Useful for debugging before a real run.

## File layout convention

```
<repo>/
├── .ruflo/
│   ├── workflows/        # workflow YAML files (override defaults)
│   ├── commands/         # reusable command prompt templates (.md)
│   └── runs/             # per-run artifact directories
└── plugins/ruflo-workflows-dag/
    └── examples/         # bundled example workflows
```

A workflow file in `.ruflo/workflows/<name>.yaml` overrides any bundled example with the same name.

## Environment variables exposed to nodes

| Variable | Meaning |
|----------|---------|
| `$USER_MESSAGE` | The free-form user input that triggered the run |
| `$ARTIFACTS_DIR` | Per-run directory for files shared between nodes |
| `$BASE_BRANCH` | Git branch the run was started from |
| `$LOOP_USER_INPUT` | Inside an interactive loop, the most recent gate response |

## Output references

Inside any prompt or bash command, reference the output of a previous node as `$nodeId.output` or `$nodeId.output.field` for structured outputs.
