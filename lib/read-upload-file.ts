// Client-only: read a File into a data URL, branching by type. Images go
// through downscaleImage (resize+compress, existing behavior unchanged).
// PDFs are read as-is (can't be recompressed/redrawn to a canvas the way an
// image can) but are capped at MAX_PDF_BYTES so we never store an oversized
// document as a data URL.
import { downscaleImage } from '@/lib/downscale-image'

export const MAX_PDF_BYTES = 5 * 1024 * 1024 // 5MB, per item #2 ("upload pdf for customer care >=5mb")

export class UploadFileError extends Error {}

export async function readUploadFile(file: File, imageMax = 1280, imageQuality = 0.8): Promise<string> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new UploadFileError('PDF must be under 5MB.')
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new UploadFileError('Could not read that PDF.'))
      reader.readAsDataURL(file)
    })
  }
  if (file.type.startsWith('image/')) {
    return downscaleImage(file, imageMax, imageQuality)
  }
  throw new UploadFileError('Only images and PDFs are supported.')
}
