interface UserPosition {
  walletAddress: string
  totalCollateralBase: bigint
  totalDebtBase: bigint
  healthFactor: bigint
  lastReadAt: number
}

interface MitigationEvent {
  executionId: string
  triggeredAt: number
  hfAtTrigger: number
  exactRepayAmount: bigint
  approveTxHash: string | null
  repayTxHash: string | null
  finalHF: number | null
  status: 'pending' | 'approving' | 'repaying' | 'resolved' | 'failed'
  failureReason: string | null
}

interface WorkflowExecution {
  executionId: string
  workflowId: string
  status: 'success' | 'failed' | 'running'
  trigger: {
    type: 'webhook' | 'manual' | 'schedule'
    timestamp: string
    payload: Record<string, unknown>
  }
  steps: Array<{
    stepId: string
    nodeType: 'web3' | 'wallet' | 'logic'
    status: 'success' | 'failed' | 'running' | 'pending'
    input: Record<string, unknown>
    output: {
      txHash?: string
      gasUsed?: string
      gasPriceGwei?: string
      blockNumber?: number
    } | null
    error: string | null
    retries: number
    retryHistory: Array<{ attempt: number; timestamp: string; error: string }>
    timestamp: string
  }>
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

function isValidHf(hf: number): boolean {
  return hf >= 0 && hf <= 2.0
}

function isValidTimestamp(ts: number): boolean {
  return ts > 0 && ts <= Date.now() + 60_000
}

export function createUserPosition(partial: {
  walletAddress?: string
  totalCollateralBase?: bigint
  totalDebtBase?: bigint
  healthFactor?: bigint
  lastReadAt?: number
}): UserPosition {
  const walletAddress = partial.walletAddress ?? ''
  if (walletAddress !== '' && !isValidAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`)
  }

  const healthFactor = partial.healthFactor ?? 0n
  if (healthFactor > 2n * 10n ** 18n) {
    throw new Error(`Health factor out of range: ${healthFactor}`)
  }

  return {
    walletAddress,
    totalCollateralBase: partial.totalCollateralBase ?? 0n,
    totalDebtBase: partial.totalDebtBase ?? 0n,
    healthFactor,
    lastReadAt: partial.lastReadAt ?? 0,
  }
}

export function createMitigationEvent(partial: {
  executionId?: string
  triggeredAt?: number
  hfAtTrigger?: number
  exactRepayAmount?: bigint
  approveTxHash?: string | null
  repayTxHash?: string | null
  finalHF?: number | null
  status?: 'pending' | 'approving' | 'repaying' | 'resolved' | 'failed'
  failureReason?: string | null
}): MitigationEvent {
  const executionId = partial.executionId ?? ''
  if (partial.triggeredAt && !isValidTimestamp(partial.triggeredAt)) {
    throw new Error(`Invalid triggeredAt: ${partial.triggeredAt}`)
  }
  if (partial.hfAtTrigger !== undefined && !isValidHf(partial.hfAtTrigger)) {
    throw new Error(`Invalid hfAtTrigger: ${partial.hfAtTrigger}`)
  }

  return {
    executionId,
    triggeredAt: partial.triggeredAt ?? Date.now(),
    hfAtTrigger: partial.hfAtTrigger ?? 0,
    exactRepayAmount: partial.exactRepayAmount ?? 0n,
    approveTxHash: partial.approveTxHash ?? null,
    repayTxHash: partial.repayTxHash ?? null,
    finalHF: partial.finalHF ?? null,
    status: partial.status ?? 'pending',
    failureReason: partial.failureReason ?? null,
  }
}

export function createWorkflowExecution(partial: {
  executionId?: string
  workflowId?: string
  status?: 'success' | 'failed' | 'running'
  trigger?: WorkflowExecution['trigger']
  steps?: WorkflowExecution['steps']
}): WorkflowExecution {
  return {
    executionId: partial.executionId ?? '',
    workflowId: partial.workflowId ?? '',
    status: partial.status ?? 'running',
    trigger: partial.trigger ?? { type: 'webhook', timestamp: '', payload: {} },
    steps: partial.steps ?? [],
  }
}

export function transitionEventStatus(
  event: MitigationEvent,
  newStatus: MitigationEvent['status'],
  payload?: { approveTxHash?: string; repayTxHash?: string; finalHF?: number; failureReason?: string },
): MitigationEvent {
  const validTransitions: Record<MitigationEvent['status'], MitigationEvent['status'][]> = {
    pending: ['approving'],
    approving: ['repaying', 'failed'],
    repaying: ['resolved', 'failed'],
    resolved: [],
    failed: ['pending'],
  }

  if (!validTransitions[event.status].includes(newStatus)) {
    throw new Error(`Invalid status transition: ${event.status} → ${newStatus}`)
  }

  return createMitigationEvent({
    ...event,
    status: newStatus,
    ...(payload ?? {}),
  })
}

export type { UserPosition, MitigationEvent, WorkflowExecution }