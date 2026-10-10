// Refreshes the bundled thyme-flow agent skill from the Flow docs.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_URL = 'https://flow.thymelabs.io/docs/skills/thyme-flow/SKILL.md'
const TARGETS = [
	'.agents/skills/thyme-flow/SKILL.md',
	'.claude/skills/thyme-flow/SKILL.md',
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const response = await fetch(SKILL_URL)
if (!response.ok) {
	throw new Error(`Fetching ${SKILL_URL} failed with ${response.status}`)
}
const skill = await response.text()

for (const target of TARGETS) {
	const path = join(root, target)
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, skill)
	console.log(`Updated ${target}`)
}
