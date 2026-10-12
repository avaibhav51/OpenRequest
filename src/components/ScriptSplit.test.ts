import { expect, it } from 'vitest'
import { scriptSplitRatio } from './ScriptSplit'

it('restores valid script split preferences and clamps or defaults unsafe values', () => {
  expect(scriptSplitRatio('65')).toBe(65)
  expect(scriptSplitRatio(0)).toBe(20)
  expect(scriptSplitRatio(100)).toBe(80)
  for (const value of [null, undefined, '', 'broken', Infinity, NaN]) expect(scriptSplitRatio(value)).toBe(50)
})
