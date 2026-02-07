import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { backoffMs, DEFAULT_BACKOFF_BASE_MS, DEFAULT_BACKOFF_MAX_MS } from '../backoff'

describe('backoffMs - Exponential Backoff with Jitter', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Exponential Backoff Calculation', () => {
    it('should return base delay for attempt 0', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(0)
      expect(result).toBe(DEFAULT_BACKOFF_BASE_MS)
    })

    it('should return base delay for negative attempts', () => {
      vi.mocked(Math.random).mockReturnValue(0.5)
      const result = backoffMs(-1)
      expect(result).toBe(DEFAULT_BACKOFF_BASE_MS)
    })

    it('should double the base delay for attempt 1 with full jitter', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(1, 5000, 300000)
      // base * 2^1 = 5000 * 2 = 10000, * 1 + 1 = 10001
      expect(result).toBe(10001)
    })

    it('should quadruple the base delay for attempt 2 with full jitter', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(2, 5000, 300000)
      // base * 2^2 = 5000 * 4 = 20000, * 1 + 1 = 20001
      expect(result).toBe(20001)
    })

    it('should apply exponential growth for attempt 3', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(3, 5000, 300000)
      // base * 2^3 = 5000 * 8 = 40000, * 1 + 1 = 40001
      expect(result).toBe(40001)
    })

    it('should apply exponential growth for attempt 5', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(5, 5000, 300000)
      // base * 2^5 = 5000 * 32 = 160000, * 1 + 1 = 160001
      expect(result).toBe(160001)
    })
  })

  describe('Max Cap Applied Correctly', () => {
    it('should cap delay at max when exponential exceeds max', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(10, 5000, 300000)
      // base * 2^10 = 5000 * 1024 = 5120000, but capped at 300000
      // 300000 * 1 + 1 = 300001
      expect(result).toBe(300001)
    })

    it('should respect custom max cap', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(5, 1000, 50000)
      // base * 2^5 = 1000 * 32 = 32000, under 50000, so 32001
      expect(result).toBe(32001)
    })

    it('should cap at custom max when exponential exceeds it', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(6, 1000, 50000)
      // base * 2^6 = 1000 * 64 = 64000, capped at 50000
      // 50000 * 1 + 1 = 50001
      expect(result).toBe(50001)
    })
  })

  describe('Full Jitter Implementation', () => {
    it('should apply jitter with random 0', () => {
      vi.mocked(Math.random).mockReturnValue(0)
      const result = backoffMs(1, 5000, 300000)
      // base * 2^1 = 10000, * 0 + 1 = 1
      expect(result).toBe(1)
    })

    it('should apply jitter with random 0.5', () => {
      vi.mocked(Math.random).mockReturnValue(0.5)
      const result = backoffMs(1, 5000, 300000)
      // base * 2^1 = 10000, * 0.5 + 1 = 5001
      expect(result).toBe(5001)
    })

    it('should apply jitter with random 1', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(1, 5000, 300000)
      // base * 2^1 = 10000, * 1 + 1 = 10001
      expect(result).toBe(10001)
    })

    it('should produce different values with different random inputs', () => {
      const results = []
      for (let i = 0; i <= 1; i += 0.25) {
        vi.mocked(Math.random).mockReturnValue(i)
        results.push(backoffMs(2, 5000, 300000))
      }
      // All should be different due to jitter
      const unique = new Set(results)
      expect(unique.size).toBeGreaterThan(1)
    })
  })

  describe('Edge Cases', () => {
    it('should always return value >= 1 (minimum with jitter)', () => {
      vi.mocked(Math.random).mockReturnValue(0)
      const result = backoffMs(10, 5000, 300000)
      // Even with random 0, we add +1
      expect(result).toBe(1)
    })

    it('should handle large attempt numbers without overflow', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(100, 5000, 300000)
      // Should be capped at maxMs
      expect(result).toBeLessThanOrEqual(300001)
      expect(result).toBeGreaterThan(0)
    })

    it('should handle custom baseMs parameter', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(1, 1000, 100000)
      // base * 2^1 = 1000 * 2 = 2000, * 1 + 1 = 2001
      expect(result).toBe(2001)
    })

    it('should handle custom maxMs parameter', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(3, 1000, 5000)
      // base * 2^3 = 1000 * 8 = 8000, capped at 5000
      // 5000 * 1 + 1 = 5001
      expect(result).toBe(5001)
    })

    it('should handle both custom baseMs and maxMs', () => {
      vi.mocked(Math.random).mockReturnValue(0.5)
      const result = backoffMs(2, 2000, 10000)
      // base * 2^2 = 2000 * 4 = 8000, under 10000
      // 8000 * 0.5 + 1 = 4001
      expect(result).toBe(4001)
    })

    it('should use default constants when not provided', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const result = backoffMs(1)
      expect(result).toBe(DEFAULT_BACKOFF_BASE_MS * 2 + 1)
    })
  })

  describe('Jitter Bounds', () => {
    it('should always return a value between 1 and (exp + 1)', () => {
      const attempt = 3
      const baseMs = 5000
      const maxMs = 300000
      const randomValues = [0, 0.25, 0.5, 0.75, 1]

      randomValues.forEach((randomValue) => {
        vi.mocked(Math.random).mockReturnValue(randomValue)
        const result = backoffMs(attempt, baseMs, maxMs)
        const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt))
        const expected = Math.floor(exp * randomValue) + 1

        expect(result).toBe(expected)
        expect(result).toBeGreaterThanOrEqual(1)
        expect(result).toBeLessThanOrEqual(exp + 1)
      })
    })
  })

  describe('Default Constants Exported', () => {
    it('should export DEFAULT_BACKOFF_BASE_MS', () => {
      expect(DEFAULT_BACKOFF_BASE_MS).toBe(5000)
    })

    it('should export DEFAULT_BACKOFF_MAX_MS', () => {
      expect(DEFAULT_BACKOFF_MAX_MS).toBe(300000)
    })
  })

  describe('Integration Tests', () => {
    it('should produce realistic backoff sequence', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const attempt0 = backoffMs(0)
      const attempt1 = backoffMs(1)
      const attempt2 = backoffMs(2)
      const attempt3 = backoffMs(3)

      // Each should roughly double (with jitter), but always increase
      expect(attempt1).toBeGreaterThanOrEqual(attempt0)
      expect(attempt2).toBeGreaterThanOrEqual(attempt1)
      expect(attempt3).toBeGreaterThanOrEqual(attempt2)
    })

    it('should stabilize at max delay', () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const attempt20 = backoffMs(20, 5000, 300000)
      const attempt25 = backoffMs(25, 5000, 300000)

      // Both should be capped at max
      expect(attempt20).toBeLessThanOrEqual(DEFAULT_BACKOFF_MAX_MS + 1)
      expect(attempt25).toBeLessThanOrEqual(DEFAULT_BACKOFF_MAX_MS + 1)
    })
  })
})
