import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getWalletAddress, getBorrowerAddress, readWalletFileAddress } from '../src/wallet.js'

const WALLET = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'
const OTHER = '0x26833b05Be49036D4dE306B1F4fBa7713CC84DE5'
const BORROWER_DEMO = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

let dir: string
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lax-wallet-'))
  for (const k of ['KEEPERHUB_WALLET_PATH', 'LAX_WALLET_ADDRESS', 'LAX_BORROWER_ADDRESS', 'LAX_SELF_DEFENSE']) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env.KEEPERHUB_WALLET_PATH = join(dir, 'wallet.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

function writeWallet(address: string): void {
  writeFileSync(join(dir, 'wallet.json'), JSON.stringify({ walletAddress: address }))
}

describe('wallet resolution (any Turnkey wallet)', () => {
  it('falls back to CONFIG when no wallet.json exists', () => {
    const w = getWalletAddress()
    expect(w.source).toBe('config')
    expect(w.walletAddress.toLowerCase()).toBe(WALLET.toLowerCase())
    expect(readWalletFileAddress()).toBeNull()
  })

  it('reads the active wallet from wallet.json', () => {
    writeWallet(OTHER)
    const w = getWalletAddress()
    expect(w.source).toBe('wallet-file')
    expect(w.walletAddress).toBe(OTHER)
  })

  it('prefers env LAX_WALLET_ADDRESS over wallet.json', () => {
    writeWallet(OTHER)
    process.env.LAX_WALLET_ADDRESS = WALLET
    const w = getWalletAddress()
    expect(w.source).toBe('env')
    expect(w.walletAddress).toBe(WALLET)
  })

  it('ignores malformed wallet.json addresses', () => {
    writeWallet('not-an-address')
    expect(readWalletFileAddress()).toBeNull()
    expect(getWalletAddress().source).toBe('config')
  })

  it('handles malformed JSON gracefully', () => {
    writeFileSync(join(dir, 'wallet.json'), '{broken')
    expect(readWalletFileAddress()).toBeNull()
    expect(getWalletAddress().source).toBe('config')
  })
})

describe('borrower resolution', () => {
  it('defaults to the configured demo borrower (fork position)', () => {
    expect(getBorrowerAddress().toLowerCase()).toBe(BORROWER_DEMO.toLowerCase())
  })

  it('LAX_BORROWER_ADDRESS overrides', () => {
    process.env.LAX_BORROWER_ADDRESS = OTHER
    expect(getBorrowerAddress()).toBe(OTHER)
  })

  it('LAX_SELF_DEFENSE=true targets the agentic wallet itself', () => {
    writeWallet(OTHER)
    process.env.LAX_SELF_DEFENSE = 'true'
    expect(getBorrowerAddress()).toBe(OTHER)
  })

  it('self-defense respects env wallet override too', () => {
    writeWallet(OTHER)
    process.env.LAX_SELF_DEFENSE = 'true'
    process.env.LAX_WALLET_ADDRESS = WALLET
    expect(getBorrowerAddress()).toBe(WALLET)
  })

  it('explicit CLI arg wins over everything', () => {
    writeWallet(OTHER)
    process.env.LAX_SELF_DEFENSE = 'true'
    expect(getBorrowerAddress('0x' + 'a'.repeat(40))).toBe('0x' + 'a'.repeat(40))
  })
})
