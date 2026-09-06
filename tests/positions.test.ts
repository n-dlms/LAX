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
