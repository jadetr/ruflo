---
name: workflow-run
description: Parse and execute a declarative DAG workflow YAML file with topological ordering, when-conditional gating, and AI loop nodes
argument-hint: "<path-to-workflow.yaml>"
allowed-tools: Read Bash Task TodoWrite mcp__claude-flow__memory_store mcp__claude-flow__memory_retrieve mcp__claude-flow__hooks_pre-task mcp__claude-flow__hooks_post-task
---

# Workflow Run

Run a declarative DAG workflow defined in a YAML file. Each node is one of: `prompt` (AI step), `bash` (deterministic shell step), `loop` (AI step that repeats until a promise signal), or `command` (reference to a reusable command file).

## When to use

When the user has a workflow file under `.ruflo/workflows/` (or wants to run one of the bundled examples) and asks to execute it. The workflow file owns the structure of the work; you fill in the AI intelligence at each prompt or loop node.

## Steps

1. **Read the workflow file** with `Read`. Reject non-YAML/JSON inputs.

2. **Parse and validate** by invoking the parser (`parseWorkflow`). On any error, surface the message verbatim — never paper over a parse failure by guessing intent.

3. **Create the artifacts directory** at `.ruflo/runs/<workflow-name>/<ISO-timestamp>/`. Export `ARTIFACTS_DIR=<path>` so bash nodes can reach it.

4. **Run pre-task hook** with the workflow name and artifacts dir for trajectory recording.

5. **Build a TodoWrite list** with one entry per node so the user can track progress.

6. **Execute layer by layer**:
   - For each node in the layer, evaluate `when:` against the current outputs. Skip and record `{ status: 'skipped' }` if false.
   - For remaining nodes, run them in parallel:
     - `prompt`: interpolate `$node.output` references and spawn a Task agent with the configured `agent` and `model`. If `context: fresh`, spawn without inherited state.
     - `bash`: run via `Bash` tool, capturing stdout, stderr, and exit_code. Store as `outputs[id] = { output, stderr, exit_code }`.
     - `loop`: invoke the loop executor with the configured `until` signal. Detect `<promise>SIGNAL</promise>` in each iteration's response. Stop on match or `max_iterations`.
     - `command`: load `.ruflo/commands/<command>.md` and treat as a prompt node.
   - After the layer completes, mark each todo as completed.

7. **Apply trigger rules** when a node has multiple dependencies:
   - `all_success` (default): skip if any dependency failed
   - `one_success`: run if at least one dependency succeeded

8. **Persist outputs** by writing `outputs.json` and `events.log` to the artifacts directory.

9. **Run post-task hook** with success state.

10. **Display summary** — a table with: node id, kind, status, iterations, duration. Include the path to the artifacts directory for follow-up.

## Failure handling

- Parse errors: abort, do not run any node
- Cycle detected: abort with the involved node ids
- Node failure: stop the dependent subtree but continue independent branches
- Loop hit max_iterations: record as failed, surface the last iteration's output

## Output

```
# Workflow: build-feature

| Node        | Kind   | Status   | Duration | Notes                  |
|-------------|--------|----------|----------|------------------------|
| plan        | prompt | success  | 4.2s     | wrote plan.md          |
| implement   | loop   | success  | 38.1s    | 3 iterations           |
| run-tests   | bash   | success  | 12.4s    | 184 tests passed       |
| review      | prompt | success  | 6.7s     | 2 minor suggestions    |
| approve     | loop   | success  | 22.0s    | interactive, approved  |
| open-pr     | bash   | success  | 1.8s     | PR #1234 created       |

Artifacts: .ruflo/runs/build-feature/2026-05-08T14-21-09/
```
