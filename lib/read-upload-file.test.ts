import { describe, it, expect, vi } from 'vitest'

// vitest.config.ts runs the 'node' environment (no jsdom) — the image branch
// (downscaleImage, Image/canvas) is exercised in a real browser only; this
// covers the PDF branch (FileReader-based, easily mockable) and the
// unsupported-type rejection, which is where item #2's "5mb" cap lives.

vi.mock('@/lib/downscale-image', () => ({ downscaleImage: vi.fn() }))

const { readUploadFile, UploadFileError, MAX_PDF_BYTES } = await import('@/lib/read-upload-file')

function fakeFile(type: string, size: number): File {
  return { type, size, name: 'test-file' } as unknown as File
}

describe('readUploadFile', () => {
  it('rejects a PDF over 5MB without attempting to read it', async () => {
    const file = fakeFile('application/pdf', MAX_PDF_BYTES + 1)
    await expect(readUploadFile(file)).rejects.toThrow(UploadFileError)
    await expect(readUploadFile(file)).rejects.toThrow(/under 5mb/i)
  })

  it('reads a PDF at or under 5MB as a data URL', async () => {
    const originalFileReader = globalThis.FileReader
    class FakeFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        this.result = 'data:application/pdf;base64,AAAA'
        this.onload?.()
      }
    }
    // @ts-expect-error — minimal test double, only readAsDataURL/onload/result are used
    globalThis.FileReader = FakeFileReader

    const file = fakeFile('application/pdf', MAX_PDF_BYTES)
    await expect(readUploadFile(file)).resolves.toBe('data:application/pdf;base64,AAAA')

    globalThis.FileReader = originalFileReader
  })

  it('rejects unsupported file types', async () => {
    const file = fakeFile('text/plain', 100)
    await expect(readUploadFile(file)).rejects.toThrow(/only images and pdfs/i)
  })
})
