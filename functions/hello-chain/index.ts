import { defineTask, z } from '@thyme-labs/sdk'
import { formatEther } from 'viem'

// A read-only first task. It reads the chain and always skips, so it is safe
// to run, upload and schedule while you learn the workflow.
export default defineTask({
	schema: z.object({
		address: z.address(),
	}),

	async run(ctx) {
		const { address } = ctx.args
		const [blockNumber, balance] = await Promise.all([
			ctx.client.getBlockNumber(),
			ctx.client.getBalance({ address }),
		])

		ctx.logger.info(
			`Block ${blockNumber}: ${address} holds ${formatEther(balance)} native`,
		)

		// Storage persists between cloud runs. Store bigints as strings.
		ctx.storage.lastCheckedBlock = blockNumber.toString()

		return { canExec: false, message: `Checked at block ${blockNumber}` }
	},
})
