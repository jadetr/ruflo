---
name: workflow-validate
description: Parse a workflow YAML file and report syntax errors, dependency issues, cycles, and the resolved layer plan without executing it
argument-hint: "<path-to-workflow.yaml>"
allowed-tools: Read
---

# Workflow Validate

Statically verify a declarative DAG workflow file. Useful in CI or before a real run.

## When to use

Before executing a workflow that hasn't been run yet, or as a CI step on every change to `.ruflo/workflows/`.

## Steps

1. **Read the file** at the given path.
2. **Invoke the parser** (`parseWorkflow`) and capture either the parsed plan or the first parse error.
3. **Report errors** verbatim including the offending node id when available.
4. **On success, print the layer plan** so the user can see which nodes will run in parallel:

```
Workflow "build-feature" — valid

Execution layers:
  Layer 1: plan
  Layer 2: implement
  Layer 3: run-tests
  Layer 4: review
  Layer 5: approve
  Layer 6: open-pr
```

5. **Surface unused outputs** (warnings only): nodes whose output is never referenced in a downstream prompt or `when:` clause.

## Failure modes

| Error | Cause | Fix |
|-------|-------|-----|
| Workflow root must be an object | Empty or invalid YAML | Check the file is valid YAML |
| Node "X" must define one of: prompt, bash, loop, command | Missing kind | Add a kind field |
| Node "X" defines multiple kinds | More than one of prompt/bash/loop/command | Pick one per node |
| Node "X" depends on unknown node "Y" | Typo or removed node | Fix the reference |
| Cycle detected; unresolvable nodes: ... | Two nodes depend on each other | Break the cycle |
