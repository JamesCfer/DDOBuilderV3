// File > Save, Ctrl+S and the account page share one save: while signed in
// it writes the account copy too, and later saves update that same copy
// instead of piling up duplicates in "My builds".

import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveBuild = vi.fn()
vi.mock('../lib/community/api', () => ({ communityApi: { saveBuild: (...a: unknown[]) => saveBuild(...a) } }))

import { saveDocToAccount } from '../hooks/useSave'
import { emptyDocument } from '../lib/multiLife'

beforeEach(() => saveBuild.mockReset())

describe('saveDocToAccount', () => {
  it('creates the account copy the first time', async () => {
    saveBuild.mockResolvedValue({ id: 'abc' })
    const id = await saveDocToAccount(emptyDocument(), 'Tank')
    expect(id).toBe('abc')
    expect(saveBuild).toHaveBeenCalledWith(expect.not.objectContaining({ id: expect.anything() }))
  })

  it('updates the existing copy on later saves', async () => {
    saveBuild.mockResolvedValue({ id: 'abc' })
    await saveDocToAccount({ ...emptyDocument(), accountBuildId: 'abc' }, 'Tank')
    expect(saveBuild).toHaveBeenCalledTimes(1)
    expect(saveBuild.mock.calls[0][0]).toMatchObject({ id: 'abc', name: 'Tank' })
  })

  it('makes a new copy when the old one was deleted from the account', async () => {
    saveBuild.mockRejectedValueOnce(new Error('Build not found')).mockResolvedValueOnce({ id: 'new' })
    const id = await saveDocToAccount({ ...emptyDocument(), accountBuildId: 'gone' }, 'Tank')
    expect(id).toBe('new')
    expect(saveBuild.mock.calls[1][0].id).toBeUndefined()
  })
})
