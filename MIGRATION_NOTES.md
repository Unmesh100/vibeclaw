# almostnode_manager migration workspace

This folder was created as a **safe extraction workspace** for the new add-on work.

## Included work

- `src/agent-container-manager.ts` (new add-on manager)
- `tests/agent-container-manager.test.ts`
- `examples/agent-manager-demo.html`
- Demo card wired in `index.html`
- Exports wired in `src/index.ts`
- Sandbox routing hardening (`src/sandbox-runtime.ts`, `src/sandbox-helpers.ts`)
- README updates for AgentContainerManager

## Source repo state

The original `almostnode` repo was restored to baseline (no tracked changes), except pre-existing untracked `bun.lock`.

## Next cleanup suggestions

1. Decide if this workspace becomes a standalone package or remains a fork.
2. If standalone package, replace `name` in `package.json`, trim unrelated source/docs/tests.
3. Keep only `AgentContainerManager` + minimal demo and add `almostnode` as a dependency.
