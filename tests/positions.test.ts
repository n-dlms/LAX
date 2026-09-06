import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadPositions } from '../src/autopilot/positions.js'

const MAIN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TREASURY = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lax-positions-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeConfig(content: string): string {
  const path = join(dir, 'lax.config.json')
  writeFileSync(path, content)
  return path
}

describe('loadPositions', () => {
  it('returns the default single position when no config file exists', () => {
    const { positions, errors } = loadPositions('/nonexistent/lax.config.json')
    expect(errors).toEqual([])
    expect(positions).toHaveLength(1)
    expect(positions[0]!.name).toBe('default')
    expect(positions[0]!.threshold).toBe(1.05)
    expect(positions[0]!.target).toBe(1.10)
  })

  it('parses multiple positions with per-position thresholds', () => {
    const path = writeConfig(JSON.stringify({
      positions: [
        { name: 'main', borrower: MAIN, threshold: 1.05, target: 1.1 },
        { name: 'treasury', borrower: TREASURY, threshold: 1.15, target: 1.25 },
      ],
    }))
    const { positions, errors } = loadPositions(path)
    expect(errors).toEqual([])
    expect(positions).toHaveLength(2)
    expect(positions[0]!.name).toBe('main')
    expect(positions[1]!.name).toBe('treasury')
    expect(positions[1]!.threshold).toBe(1.15)
    expect(positions[1]!.target).toBe(1.25)
  })

  it('defaults name and thresholds when omitted', () => {
    const path = writeConfig(JSON.stringify({ positions: [{ borrower: MAIN }] }))
    const { positions, errors } = loadPositions(path)
    expect(errors).toEqual([])
    expect(positions[0]!.name).toBe('position-1')
    expect(positions[0]!.threshold).toBe(1.05)
    expect(positions[0]!.target).toBe(1.10)
  })

  it('rejects invalid borrower addresses and keeps the valid ones', () => {
    const path = writeConfig(JSON.stringify({
      positions: [
        { name: 'bad', borrower: '0x123' },
        { name: 'good', borrower: TREASURY },
      ],
    }))
    const { positions, errors } = loadPositions(path)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.name).toBe('good')
    expect(errors[0]).toContain('invalid borrower')
  })

  it('rejects threshold >= target', () => {
    const path = writeConfig(JSON.stringify({
      positions: [{ name: 'bad', borrower: MAIN, threshold: 1.2, target: 1.1 }],
    }))
    const { positions, errors } = loadPositions(path)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.name).toBe('default')
    expect(errors[0]).toContain('threshold < target')
  })

  it('rejects thresholds at or below the liquidation threshold', () => {
    const path = writeConfig(JSON.stringify({
      positions: [{ name: 'bad', borrower: MAIN, threshold: 1.0, target: 1.1 }],
    }))
    const { positions, errors } = loadPositions(path)
    expect(positions).toHaveLength(1)
    expect(errors[0]).toContain('threshold < target')
  })

  it('rejects duplicate borrowers', () => {
    const path = writeConfig(JSON.stringify({
      positions: [
        { name: 'a', borrower: MAIN },
        { name: 'b', borrower: MAIN },
      ],
    }))
    const { positions, errors } = loadPositions(path)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.name).toBe('a')
    expect(errors[0]).toContain('duplicate borrower')
  })

  it('falls back to the default position on malformed JSON', () => {
    const path = writeConfig('not json {')
    const { positions, errors } = loadPositions(path)
    expect(positions[0]!.name).toBe('default')
    expect(errors[0]).toContain('failed to parse')
  })

  it('falls back to default when positions is empty', () => {
    const path = writeConfig(JSON.stringify({ positions: [] }))
    const { positions, errors } = loadPositions(path)
    expect(positions[0]!.name).toBe('default')
    expect(errors[0]).toContain('positions array empty')
  })
})

describe('multi-network positions', () => {
  it('resolves per-network rpc/pool/usdc/workflow', () => {
    const path = writeConfig(JSON.stringify({
      networks: {
        fork: { rpc: 'http://127.0.0.1:18545', aavePool: MAIN, usdc: TREASURY },
        sepolia: { rpc: 'https://sepolia.base.org', aavePool: TREASURY, usdc: MAIN, workflowId: 'wf-sepolia' },
      },
      positions: [
        { name: 'fork-pos', borrower: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', network: 'fork' },
        { name: 'sep-pos', borrower: '0x26833b05be49036d4de306b1f4fba7713cc84de5', network: 'sepolia' },
      ],
    }))
    const { positions, errors } = loadPositions(path)
    expect(errors).toEqual([])
    expect(positions).toHaveLength(2)
    expect(positions[0]!.network).toBe('fork')
    expect(positions[0]!.rpc).toBe('http://127.0.0.1:18545')
    expect(positions[0]!.aavePool).toBe(MAIN)
    expect(positions[1]!.network).toBe('sepolia')
    expect(positions[1]!.rpc).toBe('https://sepolia.base.org')
    expect(positions[1]!.workflowId).toBe('wf-sepolia')
  })

  it('positions on the default network need no networks block', () => {
    const path = writeConfig(JSON.stringify({
      positions: [{ name: 'solo', borrower: MAIN }],
    }))
    const { positions, errors } = loadPositions(path)
    expect(errors).toEqual([])
    expect(positions[0]!.network).toBe('default')
    expect(positions[0]!.rpc.length).toBeGreaterThan(0)
  })

  it('rejects unknown networks and malformed network configs', () => {
    const path = writeConfig(JSON.stringify({
      networks: { bad: { rpc: 'nope' } },
      positions: [{ borrower: MAIN, network: 'ghost' }],
    }))
    const { positions, errors } = loadPositions(path)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.name).toBe('default')
    expect(errors.some((e) => e.includes('unknown network'))).toBe(true)
    expect(errors.some((e) => e.includes('network "bad"'))).toBe(true)
  })
})
