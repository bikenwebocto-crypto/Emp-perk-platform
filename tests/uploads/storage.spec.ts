import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()
const removeMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
        remove: removeMock,
      }),
    },
  }),
}))

import { uploadImage, deleteImage, OFFER_IMAGE_OPTIONS } from '@/lib/upload/image'

function fakeFile(name: string, type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

describe('uploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadMock.mockResolvedValue({ error: null })
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.test/offer-images/1-abc.png' } })
  })

  it('uploads into <folder>/<timestamp>-<random>.<ext> and returns the public URL', async () => {
    const url = await uploadImage(fakeFile('photo.png'), OFFER_IMAGE_OPTIONS)

    expect(url).toBe('https://cdn.test/offer-images/1-abc.png')
    const [path, , opts] = uploadMock.mock.calls[0]
    expect(path).toMatch(new RegExp(`^${OFFER_IMAGE_OPTIONS.folder ?? OFFER_IMAGE_OPTIONS.bucket}/\\d+-[a-z0-9]+\\.png$`))
    expect(opts.upsert).toBe(false)
  })

  it('falls back to the file’s real extension when none is configured', async () => {
    await uploadImage(fakeFile('photo.jpeg'), OFFER_IMAGE_OPTIONS)

    const [path] = uploadMock.mock.calls[0]
    expect(path.endsWith('.jpeg')).toBe(true)
  })

  it('throws a descriptive error when Supabase Storage rejects the upload', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'bucket not found', name: 'StorageError' } })

    await expect(uploadImage(fakeFile('photo.png'), OFFER_IMAGE_OPTIONS)).rejects.toThrow(/bucket not found/)
  })

  it('never collides two uploads of the same filename (random suffix)', async () => {
    await uploadImage(fakeFile('same.png'), OFFER_IMAGE_OPTIONS)
    await uploadImage(fakeFile('same.png'), OFFER_IMAGE_OPTIONS)

    const [pathA] = uploadMock.mock.calls[0]
    const [pathB] = uploadMock.mock.calls[1]
    expect(pathA).not.toBe(pathB)
  })
})

describe('deleteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts the storage path from a public URL and removes it from the configured bucket', async () => {
    removeMock.mockResolvedValue({ error: null })

    await deleteImage('https://cdn.test/storage/v1/object/public/offer-images/123-abc.png', {
      bucket: 'offer-images',
    })

    expect(removeMock).toHaveBeenCalledWith(['offer-images/123-abc.png'])
  })

  it('silently no-ops when the URL does not contain the configured bucket', async () => {
    await deleteImage('https://cdn.test/storage/v1/object/public/other-bucket/123-abc.png', {
      bucket: 'offer-images',
    })

    expect(removeMock).not.toHaveBeenCalled()
  })

  it('silently swallows a malformed URL instead of throwing', async () => {
    await expect(deleteImage('not-a-url', { bucket: 'offer-images' })).resolves.toBeUndefined()
  })
})
