# Thyme Flow template

Starter project for [Thyme Flow](https://flow.thymelabs.io). Flow runs TypeScript tasks on a cron, an interval or a webhook, and sends the calls they return from a Safe you own.

Fork or clone it, sign in, then write functions yourself or let a coding agent do it. The agent setup is already included.

## Requirements

- Node.js 20 or later
- [Deno](https://deno.com), for running tasks locally (`thyme run`)
- A Thyme account: [flow.thymelabs.io](https://flow.thymelabs.io)

## Quick start

```bash
git clone https://github.com/thyme-labs/flow-template my-flow
cd my-flow
npm install            # or: bun install / pnpm install
cp .env.example .env

npx thyme run hello-chain                # run a read-only task locally
npx thyme run sweep-token --simulate     # run a task and simulate its calls
```

The `thyme` CLI is installed locally from `package.json`, so `npx thyme` (or `bunx thyme`) always uses the pinned version.

## Write functions with a coding agent

Open the project in Claude Code, Codex, Cursor, OpenCode or any other agent and describe what you want:

> Write a Flow task that harvests rewards from vault 0x… when more than 100 tokens are pending. Run it locally, then upload it as v1.

The agent picks up everything it needs from the repo:

| File | Read by |
| --- | --- |
| `AGENTS.md` | Codex, Cursor, OpenCode and most other agents |
| `CLAUDE.md` | Claude Code (imports `AGENTS.md`) |
| `.agents/skills/thyme-flow/SKILL.md` | Agents that support skills, and anything that reads `AGENTS.md` |
| `.claude/skills/thyme-flow/SKILL.md` | Claude Code skills |

The skill teaches the agent the whole `thyme` CLI: signing in, writing and testing tasks, uploading, and managing executables, secrets and logs. It always leaves two things to you:

- **Approving sign-in:** it shows you a URL and a code to approve in your browser.
- **Signing with your wallet:** creating a Safe profile or widening what it may call happens in the Console.

It also asks before anything that sends transactions or spends gas.

To pull the latest version of the skill from the Flow docs, run `npm run skill:update`.

## Write functions by hand

### 1. Create a task

```bash
npx thyme new my-task
```

This creates `functions/my-task/`:

| File | Purpose |
| --- | --- |
| `index.ts` | The task: `export default defineTask({ schema, run })` |
| `args.json` | Arguments for local runs |
| `storage.json` | Starting storage for local runs |
| `.env.example` | Template for `.env`, the task's local secrets (git-ignored, never uploaded) |

Add a `permissions.json` that lists the contract calls the task may make. Use `{ "calls": [] }` for a read-only task.

A task reads the chain and either skips or returns calls:

```ts
import { defineTask, z } from '@thyme-labs/sdk'

export default defineTask({
	schema: z.object({ vault: z.address() }),
	async run(ctx) {
		// ctx.args, ctx.client (viem), ctx.account, ctx.secrets, ctx.storage, ctx.logger
		return { canExec: false, message: 'Nothing to do' }
		// or: return { canExec: true, calls: [{ to, data }] }
	},
})
```

See [`functions/sweep-token`](functions/sweep-token/index.ts) for a complete example with calls, `permissions.json` and an `onSuccess` callback.

### 2. Run it locally

```bash
npx thyme run my-task               # run the task, print logs, result and storage
npx thyme run my-task --simulate    # also simulate the returned calls against RPC_URL
npx thyme run my-task --persist     # write the produced storage back to storage.json
npm run typecheck
```

Local runs never sign or send anything. `SIMULATE_ACCOUNT` in `.env` stands in for your Safe.

### 3. Sign in

```bash
npx thyme login                        # opens your browser
npx thyme login --browserless          # prints a URL and code to approve on any device
npx thyme login --management           # adds access to executables, secrets and logs
```

The CLI uses Thyme's production deployment by default. Run `npx thyme api-url` to check which deployment it uses.

### 4. Upload it

```bash
npx thyme upload my-task --tag v1
```

The CLI asks for the workspace and project. You can also pass them with `--workspace` and `--project`. Each tag is an immutable version, so changed code needs a new tag.

### 5. Schedule it

In the [Console](https://flow.thymelabs.io/dashboard):

1. **Create a profile:** connect the Safe the task runs from, and allow the contracts and functions in its `permissions.json`. You sign this with your wallet.
2. **Create an executable:** pick the function, the profile, its arguments and secrets, and a cron, interval or webhook trigger.
3. **Simulate it,** then turn it on and watch runs in the execution logs.

## Examples

| Task | What it shows |
| --- | --- |
| [`hello-chain`](functions/hello-chain/index.ts) | Read-only: reads the block number and a balance, saves storage, always skips |
| [`sweep-token`](functions/sweep-token/index.ts) | Sends calls: moves ERC-20 tokens above a threshold to a treasury, with `permissions.json` and `onSuccess` |

`sweep-token/args.json` uses a placeholder treasury address. Use your own address when you create an executable.

## Upload from GitHub Actions

`.github/workflows/upload.yml` uploads a task when you run it from the **Actions** tab. Before using it, set up:

- **Secret** `THYME_AUTH_TOKEN`: an API key from Console → API Keys
- **Variables** `THYME_WORKSPACE_ID` and `THYME_PROJECT_ID`

`.github/workflows/check.yml` typechecks every push and pull request.

## Safety notes

- Never commit `.env` files. They're git-ignored here.
- `permissions.json` declares the calls a task may make. Flow rejects any undeclared call before submitting it. The file doesn't grant anything: only the Safe owner can allow a call.
- Scopes limit which contract and function a task can call, not the arguments. If you allow `transfer` or `approve`, the task picks the recipient and amount. Keep only the funds the automation needs in the Safe.

## Links

- Docs: https://flow.thymelabs.io/docs
- Quickstart: https://flow.thymelabs.io/docs/getting-started/quickstart
- SDK and CLI: https://github.com/thyme-labs/sdk
- Support: support@thymelabs.io

## License

MIT
