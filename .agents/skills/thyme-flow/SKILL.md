---
name: thyme-flow
description: Build and operate Thyme Flow on-chain automation with the `thyme` CLI and `@thyme-labs/sdk`. Use when the user mentions Thyme, Thyme Flow, the `thyme` command, `defineTask`, or wants contract calls sent on a cron, interval or webhook from a Safe. Covers authentication, writing and running tasks locally, uploading function releases, and managing executables, profiles, secrets, storage, webhooks and execution logs.
---

# Thyme Flow

Thyme Flow runs TypeScript tasks on a schedule or webhook. A task reads chain or
off-chain data and **returns** the contract calls to send. Flow submits them
through an account the customer owns. Task code never holds a signing key.

You drive everything through the `thyme` CLI (`@thyme-labs/cli`). It is built
for non-interactive use: every prompt has a flag, and management commands print
JSON.

## The model

| Term | Meaning |
|---|---|
| **Task** | A local TypeScript module, `functions/<name>/index.ts`, default-exporting `defineTask({ schema, run })`. |
| **Function** (release) | An immutable uploaded bundle of a task, identified by a function ID and a version tag. |
| **Executable** | A function bound to args, a profile, a trigger, secrets and gas settings. This is the thing that runs. |
| **Execution** | One run of an executable, with a status, logs and transaction hashes. |
| **Profile** | The execution account on one chain, and the rules for what it may call. |
| **Project** / **Workspace** | A project holds functions, executables, profiles and secrets. A workspace holds projects and billing. |

```text
task source -> thyme run (local) -> thyme upload (function) -> executable -> executions
                                                                  |
                                              profile + args + trigger + secrets + storage
```

Uploading never changes what is already running. An executable pins one
function ID until you switch it.

## Rules for agents

1. **Check the CLI before trusting this file.** Run `thyme --version` and
   `thyme <command> --help`. The installed CLI is the source of truth for flags.
2. **Never print, log, commit or echo credentials.** Do not `cat`
   `~/.thyme/config.json` (it holds tokens). Do not put secret values in args,
   source, storage or logs.
3. **A person must approve logins.** You cannot complete a browser approval
   yourself. Start the flow, show the user the URL and code, then wait.
4. **A person must sign with their wallet** to create a Safe or Roles profile
   or to widen its scope. That happens in the Console, never through the CLI or
   an API key. Tell the user when this is the blocker.
5. **Ask before anything that spends money or is hard to undo:**
   `thyme executables run` (can send real transactions and spend gas),
   `resume`, `delete`, `functions delete`, `secrets delete`, `webhooks rotate`
   or `revoke`, `storage-set`, and `profiles archive`. Prefer
   `thyme executables simulate` first.
6. **Never guess the deployment.** Confirm the API URL (see below) before
   logging in or uploading.
7. Webhook URLs and newly created keys are shown once and are credentials.
   Hand them to the user; do not write them into files you commit.

## Setup

```bash
npm install -g @thyme-labs/cli@latest   # or: npx @thyme-labs/cli@latest <command>
thyme --version
deno --version                          # only needed for `thyme run`
```

`thyme run` executes tasks in a Deno subprocess. If Deno is missing, ask the
user to install it from https://deno.com. Uploading and management commands do
not need Deno.

### Choose the deployment

```bash
thyme api-url          # prints the resolved API URL and its source: env, config or default
```

Resolution order: `THYME_API_URL` env, then `apiUrl` in `~/.thyme/config.json`,
then the built-in default. The API base is **not** the Console URL. If the
source is `default` and the user has not confirmed which deployment to use, ask
them for their HTTP API base URL, then:

```bash
export THYME_API_URL='https://YOUR_FLOW_API_HOST/http'
```

Management commands and `thyme api` do not load a project `.env`; export
`THYME_API_URL` in the shell that runs them.

## Authentication

There are two credentials. They are stored separately.

| Need | Command | Notes |
|---|---|---|
| Upload functions, basic reads | `thyme login --browserless` | Personal credential. |
| Manage projects, executables, profiles, secrets, logs | `thyme login --management --browserless` | Bound to one workspace. An owner or admin approves the scopes. |
| An existing API key | `printf '%s\n' "$THYME_API_KEY" \| thyme login --token` | Key from Console -> API Keys. Cannot be combined with `--management`. |
| No stored login (CI, clean machine) | `export THYME_AUTH_TOKEN=...` | Used only when no saved credential takes precedence. |

As an agent you have no terminal, so plain `thyme login` exits immediately with
code 2. Use `--browserless`:

1. Run `thyme login --browserless` (add `--management` for management access).
   Run it in the background or with a timeout of at least five minutes.
2. It prints `Go to: <url>` and `Enter code: <code>`. Show both to the user and
   ask them to approve in their browser.
3. The command polls every two seconds for up to five minutes, then saves the
   credential to `~/.thyme/config.json`. If it times out, start again.

If the user would rather not approve from this machine, ask them to create a
key in **Console -> API Keys** and export it as `THYME_AUTH_TOKEN` themselves.

`thyme logout` (or `thyme logout --management --workspace <id>`) only removes
the local copy. Revoking a key happens in the Console.

## Write a task

```bash
thyme init my-flow-project      # name must match ^[a-z0-9-]+$
cd my-flow-project
npm install
thyme new update-value          # lowercase letters, digits, hyphens; max 64 chars
cp .env.example .env
thyme list
```

`new`, `list`, `run` and `upload` must run from the project root: a directory
with `functions/` and `@thyme-labs/sdk` or `@thyme-labs/cli` in `package.json`.

Files in `functions/<task>/`:

| File | Purpose |
|---|---|
| `index.ts` | The task. Default export of `defineTask`. |
| `args.json` | Local args. Not uploaded as executable configuration. |
| `storage.json` | Local storage seed. Written back only with `--persist`. |
| `.env` | Local secrets for this task. Never uploaded. |
| `permissions.json` | Optional. Declares the calls this release may make. Uploaded with the code. |

```ts
import { defineTask, z } from '@thyme-labs/sdk'
import { encodeFunctionData, parseAbi } from 'viem'

const abi = parseAbi([
  'function value() view returns (uint256)',
  'function setValue(uint256 nextValue)',
])

export default defineTask({
  schema: z.object({
    targetAddress: z.address(),
    nextValue: z.string().regex(/^[0-9]+$/),
  }),
  async run(ctx) {
    const nextValue = BigInt(ctx.args.nextValue)
    const current = await ctx.client.readContract({
      address: ctx.args.targetAddress,
      abi,
      functionName: 'value',
    })
    if (current === nextValue) {
      return { canExec: false, message: 'Value already matches' }
    }
    return {
      canExec: true,
      calls: [{
        to: ctx.args.targetAddress,
        data: encodeFunctionData({ abi, functionName: 'setValue', args: [nextValue] }),
      }],
    }
  },
  onSuccess(ctx, tx) {
    ctx.storage.lastConfirmedTransaction = tx.txHash
  },
})
```

The contract of a task:

- `ctx.args` is the parsed schema output. `ctx.account` is the execution
  address. `ctx.client` is a read-only viem `PublicClient` with no wallet.
  `ctx.secrets` is a string map. `ctx.logger` has `info`, `warn`, `error`.
  `ctx.storage` is a JSON object persisted per executable; mutate it in place.
- Return `{ canExec: false, message }` to skip. Skipping is normal and sends
  nothing. Return `{ canExec: true, calls: [{ to, data }] }` to act.
- A call is only `{ to, data }`. There is no `value`, gas or sender field.
  Encode `data` with viem. Empty calldata (`'0x'`) is not a safe no-op.
- Optional callbacks: `onSuccess(ctx, tx)`, `onFail(ctx, info)`,
  `onSkip(ctx, info)`, `onError(ctx, info)`. Returning calls from `run` is a
  request, not a receipt; use `onSuccess` for "confirmed on-chain" checkpoints.
- Storage must be plain JSON. No BigInt, `undefined`, `NaN` or `Infinity`.
  Store large integers as decimal strings.
- Keep work bounded. A cloud run has about 30 seconds per invocation.
- There is no on-chain event trigger. Poll from the task and keep a cursor in
  `ctx.storage`.
- A run can return up to 32 calls. A Roles profile sends them as **one
  atomic batch**: if any call reverts, none of them apply. Every call must be
  on the profile's allowlist, and the batch must stay under about 36 KiB of
  calldata. Split larger work across runs.

## Run locally

Set `SIMULATE_ACCOUNT` (a valid address, used as `ctx.account`) in `.env`, and
`RPC_URL` if the task reads the chain. Neither grants signing authority.

```bash
thyme run update-value                       # evaluate, print logs, result and storage
thyme run update-value --simulate            # also ask the RPC to simulate returned calls
thyme run update-value --persist             # write produced storage to storage.json
thyme run update-value --callback onSuccess  # or onFail:reverted, onFail:submit, onFail:timeout
```

Always pass the task name; without a terminal a missing name is an error.
`thyme run` never signs or broadcasts. A clean local run does not prove the
cloud run will pass profile permissions or gas checks, and simulation warnings
do not always change the exit code, so read the output.

## Declare permissions

`functions/<task>/permissions.json` lists every target and function the release
may call. It is checked on upload and enforced in the cloud.

```json
{
  "calls": [
    { "target": { "arg": "targetAddress" }, "function": "setValue(uint256)" }
  ]
}
```

- `target` is either `{ "arg": "<top-level arg name>" }` or a map of decimal
  chain ID to address, for example `{ "11155111": "0x..." }`.
- `function` is a Solidity signature or a four-byte selector.
- The only top-level key is `calls`. `{ "calls": [] }` means "this release
  sends nothing". Omitting the file means "undeclared", which is different.
- A manifest describes what the code needs. It **grants nothing**. The profile
  owner must separately allow the same target and selector on-chain.

## Upload a function

```bash
thyme upload update-value --workspace WORKSPACE_ID --project PROJECT_ID --tag v1
```

Pass all three flags. If you do not know the IDs, run the command without them:
it exits with code 2 and lists the available workspace or project IDs. With
management access, `thyme projects list` also returns project IDs.

- Tags are immutable: 1-32 lowercase letters, digits, `.`, `_` or `-`. `latest`
  is reserved. Changed code or a changed manifest needs a new tag.
- Re-uploading identical content under the same tag returns the existing
  function. The same tag with different content is a conflict.
- The output's `Task ID` is the function ID. `thyme functions list --project
  PROJECT_ID --name update-value` finds it later.

Upload creates code only. Nothing runs until an executable uses it.

## Manage cloud resources

These commands need management access, print JSON on stdout, and write errors
to stderr with exit code 1. Add `--workspace <id>` when more than one workspace
credential is stored. Every mutation accepts `--idempotency-key <key>`; include
the target ID in the key when you retry.

```bash
thyme projects list
thyme chains list
thyme functions list --project PROJECT_ID
thyme profiles list --project PROJECT_ID
thyme executables list --project PROJECT_ID
thyme executions list --project PROJECT_ID --status failed --limit 20
thyme executions logs EXECUTION_ID
thyme usage current
```

Lists are paginated. Pass the returned cursor back with `--cursor` until
`isDone` is true.

### Create an executable

You need a function ID, and an **active** profile ID in the same project.

```bash
cat > executable.json <<'JSON'
{
  "projectId": "PROJECT_ID",
  "functionId": "FUNCTION_ID",
  "profileId": "PROFILE_ID",
  "name": "update-value",
  "trigger": { "type": "interval", "intervalMs": 60000 },
  "args": "{\"targetAddress\":\"0x...\",\"nextValue\":\"42\"}",
  "gasMode": "sponsored",
  "sandboxRuntime": "daytona"
}
JSON
thyme api POST /api/v1/executables --data-file executable.json \
  --idempotency-key create-update-value-v1
```

- `args` is a **JSON-encoded string**, not an object.
- Triggers: `{ "type": "interval", "intervalMs": 60000 }` or
  `{ "type": "cron", "cronspec": "0 * * * *" }`.
- Creation returns before provisioning finishes. Poll
  `thyme executables get EXECUTABLE_ID` until it is `active`. It stays `paused`
  if the profile does not cover the function's permissions.

### Operate an executable

```bash
thyme executables get EXECUTABLE_ID
thyme executables simulate EXECUTABLE_ID      # dry run: no transaction, no storage commit
thyme executables run EXECUTABLE_ID           # real run: may send transactions. Ask first.
thyme executables pause EXECUTABLE_ID
thyme executables resume EXECUTABLE_ID
```

Change one facet at a time with
`thyme executables update EXECUTABLE_ID <field> --data '<json>'`:

| Field | Body |
|---|---|
| `args` | `{"args":"{\"nextValue\":\"43\"}"}` |
| `trigger` | `{"trigger":{"type":"cron","cronspec":"0 * * * *"}}` |
| `secrets` | `{"secretBindings":[{"secretId":"SECRET_ID","envKey":"PRICE_API_KEY"}]}` (replaces all bindings) |
| `gas-mode` | `{"gasMode":"sponsored","gasFallback":false}` |
| `profile` | `{"profileId":"PROFILE_ID"}` (same chain and project only) |
| `pinned` | `{"pinned":true}` |

A `run` or `simulate` request is queued, not finished. Read the execution and
its logs to learn the outcome. Statuses include `pending`, `running`,
`submitted`, `confirmed`, `failed` and `skipped`. `submitted_unknown` means a
transaction may still land: check its hash before retrying.

### Ship a new version

```bash
thyme upload update-value -w WORKSPACE_ID -p PROJECT_ID --tag v2
thyme executables pause EXECUTABLE_ID
thyme executables set-function EXECUTABLE_ID --function FUNCTION_V2_ID \
  --args '{"targetAddress":"0x...","nextValue":"42"}'
thyme executables get EXECUTABLE_ID      # repeat until pendingFunctionSwitch is gone
thyme executables resume EXECUTABLE_ID
```

The switch rebuilds asynchronously. The old version stays in place if the build
fails (`lastFunctionSwitchError`). The executable remains paused after a
successful switch until you resume it. To roll back, switch to the older
function ID the same way. Storage is not rolled back with the code.

### Secrets

```bash
thyme secrets list --project PROJECT_ID
thyme secrets create --project PROJECT_ID --key PRICE_API_KEY --value "$PRICE_API_KEY"
thyme secrets rotate SECRET_ID --value "$PRICE_API_KEY"
```

Secrets are write-only: values are never returned. Creating a secret does not
expose it to any task. Bind it with `thyme executables update EXECUTABLE_ID
secrets`. Pass values from an environment variable the user set, so the value
never appears in your transcript. Keys match `^[A-Za-z_][A-Za-z0-9_]*$`;
`RPC_URL`, `TASK_ARGS` and `THYME_SECRETS_JSON` are reserved.

### Storage

```bash
thyme executables storage-get EXECUTABLE_ID
thyme executables storage-set EXECUTABLE_ID --expected-version 4 --value '{"cursor":"1200"}'
```

`storage-set` replaces the whole object and needs the version from the read
before it. A stale version returns a conflict; re-read and try again.

### Webhooks

```bash
thyme executables webhook-create EXECUTABLE_ID --name "Deploy hook"
thyme executables webhooks EXECUTABLE_ID
```

The response contains the URL once. It is a run-only credential: an empty
`POST` runs with the executable's saved args, and a non-empty JSON object
replaces them entirely. Send an `Idempotency-Key` header when retrying.

### Profiles

| Kind | Who holds authority | Gas |
|---|---|---|
| Roles (`safe_roles`) | Customer-owned Safe with an on-chain allowlist of targets and selectors. | Sponsored. |
| Legacy (`legacy`) | An account whose key Thyme's signer holds. | Sponsored or paid by the profile wallet. |

```bash
thyme profiles list --project PROJECT_ID
thyme profiles get PROFILE_ID
thyme profiles rename PROFILE_ID --name "Treasury"
```

- Creating a Safe or Roles profile, and extending its allowlist, needs the
  owner's wallet in **Console -> Profiles**. Send the user there, tell them
  exactly which target address and function selector to allow, and continue
  once the profile is `active`.
- `thyme profiles create --project --alias --chain` only creates legacy
  profiles, and only where the deployment allows it.
- An allowlist limits target and selector, not arguments. Allowing `transfer`
  or `approve` lets the task choose the recipient and amount. Say so when you
  recommend a scope.
- A profile belongs to one chain. Use `thyme chains list` to see enabled chains.
- `thyme verify roles-profile --profile ID --owner ADDRESS --rpc-url URL`
  independently checks a Roles profile on-chain. It needs no login.

## Reading failures

- Exit code **2**: a required value was missing. The message names the flag and
  lists valid values. Add the flag and retry.
- Exit code **1**: a real failure (auth, network, task error, rejected request).
- Management errors are JSON: `{ "error", "code", "requestId" }`. Quote the
  `requestId` when reporting a problem.
- `permissions_not_covered` (409): the profile does not allow a call the
  function declares. Fix the manifest and upload a new tag, or ask the owner to
  extend the profile scope in the Console. An API key cannot grant it.
- `executable_must_be_paused`: pause before `set-function`.
- `version_tag_conflict`: pick a new tag; the response suggests one.
- `No API credential found`: run the management login above.
- Requests reaching the wrong environment: check `thyme api-url`.

## More detail

Full documentation is served under `/docs` on the same host as the user's Flow
Console (for example `https://flow.thymelabs.io/docs`). `llms.txt` at that path
lists every page, and `llms-full.txt` contains them all. The OpenAPI document
for the management API is at `/docs/openapi.yaml`.
