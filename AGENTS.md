# AGENTS.md

This repository is a [Thyme Flow](https://flow.thymelabs.io) project. Each folder in `functions/` is one task: TypeScript that reads the chain and returns the contract calls Flow should send from the user's Safe.

## Read the skill first

`.agents/skills/thyme-flow/SKILL.md` is the full guide to the `thyme` CLI and the task model. Read it before writing, running, uploading or managing anything. This file only adds what is specific to this repo.

## This repo

- The project is already initialized. Skip `thyme init`.
- Use the pinned local CLI: `npx thyme <command>` (or `bunx thyme`). Run every command from the repo root.
- Deployment: the CLI's built-in default is Thyme's production deployment. If `npx thyme api-url` reports source `default`, use it without asking. Ask only if the user mentions another deployment or `THYME_API_URL` is set to something unexpected.
- `functions/hello-chain` (read-only) and `functions/sweep-token` (sends calls) are reference examples. Follow their style: tabs, single quotes, no semicolons, viem for ABIs and encoding.

## Writing a task

1. `npx thyme new <name>`. Names use lowercase letters, digits and hyphens.
2. Write `functions/<name>/index.ts`:
   - Validate inputs with the `schema`. Use `z.address()` for addresses and decimal strings for big integers.
   - Skip with `{ canExec: false, message }` whenever there is nothing to do.
   - A call is only `{ to, data }`. There is no value field. Encode `data` with viem.
   - Keep each run bounded. Cloud runs time out after about 30 seconds.
   - Keep storage plain JSON: no bigint, `undefined` or `NaN`.
3. Write `functions/<name>/permissions.json` listing every target and function signature the task can return. Use `{ "calls": [] }` for a read-only task.
4. Put sample inputs in `args.json`. Put local secrets in `functions/<name>/.env`, never in source or args.

## Before you call a task done

- `npx thyme run <name>` succeeds, and reports a skip when there is nothing to do.
- `npx thyme run <name> --simulate` reports that every returned call is declared and would succeed, for a task that returns calls.
- `npm run typecheck` passes.

## Rules

- Never print, log or commit credentials, `.env` files or `~/.thyme/config.json`.
- Sign-in needs the user. Run `npx thyme login --browserless`, show them the URL and code, and wait.
- The user signs with their wallet in the Console to create a Safe profile or allow new calls. Tell them exactly which target address and function to allow.
- Ask before anything that sends transactions, spends gas or is hard to undo: `executables run`, `resume`, any `delete`, `storage-set`, rotating webhooks. Prefer `executables simulate` first.
- Every upload needs a new, immutable `--tag`, such as `v1` or `v2`.
