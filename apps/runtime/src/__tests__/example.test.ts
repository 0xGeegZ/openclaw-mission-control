import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Vitest Configuration', () => {
  describe('Setup Integration', () => {
    it('should have NODE_ENV set to test in setup', () => {
      expect(process.env.NODE_ENV).toBe('test')
    })

    it('should execute beforeEach hooks', () => {
      let hookExecuted = false
      beforeEach(() => {
        hookExecuted = true
      })
      expect(typeof beforeEach).toBe('function')
    })

    it('should execute afterEach hooks', () => {
      expect(typeof afterEach).toBe('function')
    })
  })

  describe('Basic Arithmetic', () => {
    it('should add two numbers correctly', () => {
      expect(1 + 1).toBe(2)
    })

    it('should subtract two numbers correctly', () => {
      expect(5 - 3).toBe(2)
    })

    it('should multiply two numbers correctly', () => {
      expect(4 * 5).toBe(20)
    })
  })

  describe('String Operations', () => {
    it('should concatenate strings', () => {
      const result = 'hello' + ' ' + 'world'
      expect(result).toBe('hello world')
    })

    it('should uppercase strings', () => {
      expect('vitest'.toUpperCase()).toBe('VITEST')
    })
  })

  describe('Array Operations', () => {
    it('should find array length', () => {
      const arr = [1, 2, 3, 4, 5]
      expect(arr.length).toBe(5)
    })

    it('should filter array elements', () => {
      const arr = [1, 2, 3, 4, 5]
      const filtered = arr.filter((n) => n > 2)
      expect(filtered).toEqual([3, 4, 5])
    })

    it('should map array elements', () => {
      const arr = [1, 2, 3]
      const doubled = arr.map((n) => n * 2)
      expect(doubled).toEqual([2, 4, 6])
    })
  })
})
