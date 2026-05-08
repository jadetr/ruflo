# ruflo-workflows-dag

Declarative DAG workflow engine for Ruflo. Describe deterministic and AI-driven steps in a single YAML file, validate them, and run them with topological scheduling, conditional gates, and AI loops.

## Inspiration

This plugin was inspired by [Archon](https://github.com/coleam00/archon), an open-source workflow engine for AI coding agents. Archon's insight — that AI-assisted development becomes deterministic and repeatable when the structure of the work is owned by a YAML file rather than improvised at runtime — shaped the design of this plugin. The DAG layout, promise-signal loop convention, and `$node.output` reference syntax are all expressions of that idea, adapted to fit Ruflo's existing agent, hook, and memory primitives.

## Install

```
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-workflows-dag@ruflo
```

Requires `ruflo-core` to be installed first.

## What it adds to Ruflo

| Capability | Where it lives |
|---|---|
| Single-file YAML workflows | `.ruflo/workflows/<name>.yaml` |
| Topological execution with parallel layers | `src/parser.ts` |
| `when:` conditional node execution | `src/when-evaluator.ts` |
| AI loop nodes with promise-signal completion | `src/loop-executor.ts` |
| `$node.output` reference resolution | `src/interpolate.ts` |
| `/workflow run|validate|list|inspect` slash command | `commands/workflow.md` |

## Workflow file shape

```yaml
name: build-feature
description: Plan, implement, test, review, and open a PR

nodes:
  - id: plan
    agent: researcher
    prompt: |
      Explore the codebase and produce an implementation plan.
      Write it to $ARTIFACTS_DIR/plan.md.

  - id: implement
    depends_on: [plan]
    agent: coder
    loop:
      prompt: |
        Read $ARTIFACTS_DIR/plan.md. Implement the next pending task.
        When every task is done, emit <promise>ALL_TASKS_COMPLETE</promise>.
      until: ALL_TASKS_COMPLETE
      max_iterations: 20
      fresh_context: true

  - id: run-tests
    depends_on: [implement]
    bash: npm test

  - id: review
    depends_on: [run-tests]
    when: $run-tests.exit_code == 0
    agent: reviewer
    prompt: Review the diff against $ARTIFACTS_DIR/plan.md.

  - id: open-pr
    depends_on: [review]
    bash: |
      git push -u origin HEAD
      gh pr create --fill
```

## Node kinds

| Kind | Purpose |
|------|---------|
| `prompt` | Spawn a Task agent with the given prompt. Optional `agent`, `model`, `context: fresh`. |
| `bash` | Run a deterministic shell command. Captures stdout, stderr, exit_code. |
| `loop` | Repeat an AI step until `<promise>SIGNAL</promise>` matches `until:` or `max_iterations` is reached. Supports `interactive: true` for human-in-the-loop gating. |
| `command` | Reference a reusable prompt template at `.ruflo/commands/<name>.md`. |

## Promise signals

Loop nodes terminate when the agent emits `<promise>SIGNAL_NAME</promise>` anywhere in its response. The `until:` field names the signal to watch for. Signals are case-insensitive on input but normalized to uppercase internally.

## `when:` expressions

A safe, non-Turing-complete expression language with these primitives:

- references: `$node.output`, `$node.output.field`, `$node.success`, `$node.exitCode`
- equality: `==`, `!=`
- logical: `&&`, `||`, `!`, parentheses
- literals: `'string'`, `"string"`, numbers, `true`, `false`, `null`

```yaml
when: "$classify.output.kind == 'bug' && $tests.exitCode == 0"
```

Unknown references resolve to `undefined`. Empty or missing `when:` is treated as `true`.

## Output references

Inside any prompt or bash command, reference a previous node's output as `$nodeId.output` or `$nodeId.output.path.to.field`. Environment variables (`$USER_MESSAGE`, `$ARTIFACTS_DIR`, `$BASE_BRANCH`, `$LOOP_USER_INPUT`) resolve as bare identifiers.

## Slash command

```
/workflow run     <path>     Execute a workflow
/workflow validate <path>    Parse and report errors without running
/workflow list               List discovered .ruflo/workflows/*.yaml
/workflow inspect <path>     Print the parsed layer plan
```

## Layout

```
plugins/ruflo-workflows-dag/
├── .claude-plugin/plugin.json
├── agents/workflow-orchestrator.md
├── commands/workflow.md
├── skills/
│   ├── workflow-run/SKILL.md
│   └── workflow-validate/SKILL.md
├── src/
│   ├── parser.ts          # YAML → ParsedWorkflow with topological layers
│   ├── when-evaluator.ts  # Safe expression evaluator
│   ├── loop-executor.ts   # Promise-signal loop driver
│   ├── interpolate.ts     # $node.output reference resolution
│   ├── types.ts
│   └── index.ts
├── schemas/workflow.schema.json
├── examples/
│   ├── build-feature.yaml
│   ├── bug-fix.yaml
│   └── pr-review.yaml
└── tests/                  # node:test runner, no external deps
    ├── parser.test.ts
    ├── when-evaluator.test.ts
    ├── loop-executor.test.ts
    └── interpolate.test.ts
```

## Tests

```
npm install
npm test
```

42 unit tests covering parsing (DAG validation, cycle detection, layer construction, error paths), when-evaluator (operators, references, error modes), loop executor (signal extraction, max_iterations, interactive gating), and reference interpolation.

## How this fits into Ruflo

The plugin is an **integration layer** — the parsing, evaluation, and loop logic are pure functions that produce well-typed values. They don't execute anything by themselves. Wiring into Ruflo is intentionally narrow:

| Touch point | Direction |
|---|---|
| `parseWorkflow()` | Called by the `/workflow run` skill before any node runs |
| `evaluateWhen()` | Called by the workflow runner before each node |
| `executeLoop()` | Called by the workflow runner for `loop:` nodes; the `LoopRunner` interface is implemented by spawning a Task agent |
| `interpolate()` | Called to resolve `$node.output` references inside prompts and bash commands |

Existing Ruflo facilities used as-is:

- **Agents** — `prompt` nodes spawn named Task agents; `agent:` and `model:` map directly to Task params
- **Hooks** — `pre-task` / `post-task` fire at workflow start/end and per node
- **Memory** — outputs land in the `workflow-runs` namespace; events in `workflow-events` for audit trails
- **Worktree isolation** — provided by `ruflo-swarm` if installed; one worktree per run

## Status

`v0.1.0` — parser, evaluator, loop executor, interpolation, tests, schema, examples, command, skill, and agent definitions. The actual workflow runner that wires these into the Task tool and `Bash` is the next milestone (the parser produces the execution plan; the runner consumes it).

## License

MIT
