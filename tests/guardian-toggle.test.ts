import { describe, it, expect, vi } from 'vitest'
import { findCommand } from '../src/cli/registry.js'
import { execute, setCommandContext } from '../src/cli/executor.js'
import type { CommandContext } from '../src/cli/types.js'

// The dashboard's Arm/Disarm Autopilot buttons reuse `lax guardian on|off`
// through the CLI executor. Disarm was the only guardian command gated behind
// --confirm, which made the Disarm button silently fail (arm/disarm — the
// actual arm and disarm commands — are both ungated). Disabling protection
// must be instant and never leave the user stuck in PROTECTING.

function makeCtx() {
  const state = { enabled: false, blocked: false, threshold: 1.05, target: 1.1 }
  const ctx = {
    getGuardianState: () => ({ ...state }),
    setGuardianState: (s: Partial<typeof state>) => Object.assign(state, s),
    emit: vi.fn(),
    appendLog: vi.fn(),
  } as unknown as CommandContext
  return { ctx, state }
}

describe('guardian toggle parity', () => {
  it('guardian-off is not confirmation-gated (Disarm button parity with guardian-on)', () => {
    expect(findCommand('guardian-off')?.confirmRequired).toBeFalsy()
    expect(findCommand('guardian-on')?.confirmRequired).toBeFalsy()
  })

  it('lax guardian off executes immediately and disarms', async () => {
    const { ctx, state } = makeCtx()
    setCommandContext(ctx)
    state.enabled = true
    const res = await execute('lax guardian off')
    expect(res.error).toBeUndefined()
    expect(state.enabled).toBe(false)
  })

  it('lax guardian on arms and off disarms symmetrically', async () => {
    const { ctx, state } = makeCtx()
    setCommandContext(ctx)
    await execute('lax guardian on')
    expect(state.enabled).toBe(true)
    await execute('lax guardian off')
    expect(state.enabled).toBe(false)
  })

  it('high-stakes commands keep their confirmation gate', () => {
    expect(findCommand('engage')?.confirmRequired).toBe(true)
    expect(findCommand('flash-crash')?.confirmRequired).toBe(true)
  })
})
