export const CONFIG = {
  WALLET_ADDRESS: '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C' as const,
  WALLET_SUBORG_ID: '514bb660-86a5-47e8-9f35-52d632c12803' as const,
  BORROWER_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const,

  HF: {
    HEALTHY: 1.10,
    WATCH: 1.05,
    TRIGGER: 1.05,
    TARGET: 1.10,
  },

  CHAIN_ID: 8453,
  CHAIN_ID_SEPOLIA: 84532,
  FORK_PORT: 18545,
  FORK_RPC_URL: `http://127.0.0.1:18545` as const,

  WORKFLOW_ID: '7gdt0ty7zk1orq1j4wc74' as const,

  AAVE_POOL: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as const,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
  WETH: '0x4200000000000000000000000000000000000006' as const,
  USDC_USD_AGGREGATOR: '0xf52D010c7d4ecBfda92c2509900593CE34535D86' as const,
  WETH_USD_AGGREGATOR: '0x9dA00D23465282005DB222a441a663eE7B9dfCc8' as const,

  REPAY_MODE: 2,

  // Gas sponsorship tag for the current hackathon: KeeperHub — The Agent Economy
  // (DoraHacks, build phase Sep 6–18, 2026). The event's sponsorship tag has not been
  // published yet — confirm it in the KeeperHub Discord / office hours before relying
  // on sponsored gas. The wallet-pays-gas fallback (ADR-006) covers the demo either way.
  SPONSORSHIP_TAG: 'TBD_AGENT_ECONOMY_2026',

  SAFETY: {
    // ASSUMPTION: value in wei is treated as USD at 1:1 rate (no price oracle in safety plugin)
    BLOCK_THRESHOLD_USD: 10.00,
    DAILY_LIMIT_USD: 5.00,
    DENIED_SELECTORS: ['0x23b872dd', '0x42842e0e'],
    ALLOWLIST_SELECTOR: '0x095ea7b3',
  },

  FORK_BLOCK: 48236883,

  LISTENER_POLL_MS: 2000,
  DASHBOARD_URL: `http://127.0.0.1:5173` as const,
} as const

export function validateConfig(): string[] {
  const errors: string[] = []

  if (!/^0x[a-fA-F0-9]{40}$/.test(CONFIG.WALLET_ADDRESS)) {
    errors.push(`Invalid WALLET_ADDRESS: ${CONFIG.WALLET_ADDRESS}`)
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(CONFIG.BORROWER_ADDRESS)) {
    errors.push(`Invalid BORROWER_ADDRESS: ${CONFIG.BORROWER_ADDRESS}`)
  }

  if (CONFIG.HF.HEALTHY <= CONFIG.HF.TRIGGER) {
    errors.push(`HF HEALTHY (${CONFIG.HF.HEALTHY}) must be > TRIGGER (${CONFIG.HF.TRIGGER})`)
  }
  if (CONFIG.HF.TRIGGER <= 1.0) {
    errors.push(`HF TRIGGER (${CONFIG.HF.TRIGGER}) must be > 1.0 (liquidation threshold)`)
  }
  if (CONFIG.HF.TARGET < CONFIG.HF.HEALTHY) {
    errors.push(`HF TARGET (${CONFIG.HF.TARGET}) must be >= HEALTHY (${CONFIG.HF.HEALTHY})`)
  }

  for (const [name, addr] of Object.entries({
    AAVE_POOL: CONFIG.AAVE_POOL,
    USDC: CONFIG.USDC,
    WETH: CONFIG.WETH,
    USDC_USD_AGGREGATOR: CONFIG.USDC_USD_AGGREGATOR,
    WETH_USD_AGGREGATOR: CONFIG.WETH_USD_AGGREGATOR,
  })) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      errors.push(`Invalid ${name}: ${addr}`)
    }
  }

  if (CONFIG.CHAIN_ID !== 8453 && CONFIG.CHAIN_ID !== 84532) {
    errors.push(`Unknown CHAIN_ID: ${CONFIG.CHAIN_ID}`)
  }

  if (CONFIG.FORK_PORT < 1024 || CONFIG.FORK_PORT > 65535) {
    errors.push(`Invalid FORK_PORT: ${CONFIG.FORK_PORT}`)
  }

  if (CONFIG.SAFETY.DAILY_LIMIT_USD <= 0) {
    errors.push(`DAILY_LIMIT_USD must be > 0`)
  }
  if (CONFIG.SAFETY.BLOCK_THRESHOLD_USD <= 0) {
    errors.push(`BLOCK_THRESHOLD_USD must be > 0`)
  }

  return errors
}