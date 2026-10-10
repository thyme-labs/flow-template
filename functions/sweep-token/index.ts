import { defineTask, z } from '@thyme-labs/sdk'
import { encodeFunctionData, erc20Abi } from 'viem'

// Sends every token above `keep` from the execution account to a treasury.
// In the cloud the account is your Safe; locally it is SIMULATE_ACCOUNT.
export default defineTask({
	schema: z.object({
		token: z.address(),
		treasury: z.address(),
		// Smallest token units as a decimal string, because JSON has no bigint.
		keep: z.string().regex(/^[0-9]+$/),
	}),

	async run(ctx) {
		const { token, treasury } = ctx.args
		const keep = BigInt(ctx.args.keep)
		const balance = await ctx.client.readContract({
			address: token,
			abi: erc20Abi,
			functionName: 'balanceOf',
			args: [ctx.account],
		})

		// Skipping is the normal outcome: no transaction, no gas.
		if (balance <= keep) {
			return { canExec: false, message: `Balance ${balance} is at most ${keep}` }
		}

		const amount = balance - keep
		ctx.logger.info(`Sweeping ${amount} to ${treasury}`)

		return {
			canExec: true,
			calls: [
				{
					to: token,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: 'transfer',
						args: [treasury, amount],
					}),
				},
			],
		}
	},

	// Runs once the transaction is confirmed on-chain.
	onSuccess(ctx, tx) {
		ctx.storage.lastSweepTx = tx.txHash
	},
})
