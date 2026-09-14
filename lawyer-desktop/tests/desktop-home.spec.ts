import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveLawyerDesktopHome } from '../src/desktop-home.ts'

describe('LawyerDesk managed desktop home', () => {
  it('uses the LawyerDesk name for a fresh install', () => {
    const home = mkdtempSync(join(tmpdir(), 'lawyer-home-'))
    try {
      expect(resolveLawyerDesktopHome(home)).toBe(join(home, '.lawyerdesk-managed-desktop'))
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  it('keeps using an existing legacy home instead of abandoning its profile', () => {
    const home = mkdtempSync(join(tmpdir(), 'lawyer-home-'))
    try {
      mkdirSync(join(home, '.lawyercopilot-managed-desktop', 'profiles'), { recursive: true })
      expect(resolveLawyerDesktopHome(home)).toBe(join(home, '.lawyercopilot-managed-desktop'))
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  it('prefers a current home when both homes contain managed state', () => {
    const home = mkdtempSync(join(tmpdir(), 'lawyer-home-'))
    try {
      mkdirSync(join(home, '.lawyerdesk-managed-desktop'), { recursive: true })
      writeFileSync(join(home, '.lawyerdesk-managed-desktop', 'product.json'), '{}')
      mkdirSync(join(home, '.lawyercopilot-managed-desktop', 'profiles'), { recursive: true })
      expect(resolveLawyerDesktopHome(home)).toBe(join(home, '.lawyerdesk-managed-desktop'))
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  it('honors an explicit test or operator home', () => {
    expect(resolveLawyerDesktopHome('/unused', '/explicit/home')).toBe('/explicit/home')
  })
})
