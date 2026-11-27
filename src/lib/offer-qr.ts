import { getAppUrl } from '@/lib/app-url'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { uploadImage, QR_OPTIONS } from '@/lib/upload/image'

const QR_CODE_SIZE = 512

export interface OfferQRData {
  qrUrl: string
  qrToken: string
}

function logStart(offerId: string) {
  console.log('=================================')
  console.log('QR GENERATION START')
  console.log('=================================')
  console.log('Offer ID:', offerId)
}

function logEnd(qrUrl: string, qrToken: string) {
  console.log('---------------------------------')
  console.log('QR Generation Completed')
  console.log('qrCodeUrl:', qrUrl)
  console.log('qrToken:', qrToken)
  console.log('=================================')
}

function logFailure(offerId: string, step: string, error: unknown) {
  console.error('=================================')
  console.error('QR GENERATION FAILED')
  console.error('=================================')
  console.error('Offer ID:', offerId)
  console.error('Step Failed:', step)
  console.error('Error Message:', error instanceof Error ? error.message : String(error))
  if (error instanceof Error && error.stack) {
    console.error('Stack Trace:', error.stack)
  }
  console.error('=================================')
}

export async function ensureOfferQRCode(
  offerId: string,
): Promise<OfferQRData | null> {
  logStart(offerId)

  try {
    const offer = await prisma.merchantOffer.findFirst({
      where: { id: offerId, deletedAt: null },
      include: {
        merchant: { select: { id: true, businessName: true } },
        redemption: { select: { id: true, redemptionType: true, configuration: true } },
      },
    })

    if (!offer) {
      console.log('Offer not found for id:', offerId)
      logFailure(offerId, 'FETCH_OFFER', new Error(`Offer not found: ${offerId}`))
      return null
    }

    const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}

    console.log('---------------------------------')
    console.log('Offer ID:', offer.id)
    console.log('Merchant:', offer.merchant.businessName)
    console.log('Status:', offer.status)
    console.log('Redemption Type:', offer.redemption?.redemptionType)
    console.log('Existing QR:', (redemptionConfig.qrCodeUrl as string) ?? '(none)')
    console.log('---------------------------------')

    if (offer.redemption?.redemptionType !== 'IN_STORE_QR') {
      console.log('Skipping — redemptionType is not IN_STORE_QR:', offer.redemption?.redemptionType)
      return null
    }

    if (redemptionConfig.qrCodeUrl) {
      console.log('Skipping — QR already exists, returning existing:', redemptionConfig.qrCodeUrl)
      return { qrUrl: redemptionConfig.qrCodeUrl as string, qrToken: (redemptionConfig.qrToken as string) ?? '' }
    }

    console.log('Generating Token...')
    const qrToken = uuidv4()
    console.log('Token:', qrToken)
    console.log('---------------------------------')

    const baseUrl = getAppUrl()
    const qrPayload = `${baseUrl}/api/mobile/offers/${offer.id}/scan?token=${qrToken}`

    console.log('Generating PNG...')
    console.log('QR Payload URL:', qrPayload)

    const buffer = await QRCode.toBuffer(qrPayload, {
      type: 'png',
      width: QR_CODE_SIZE,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })

    console.log('PNG Size:', buffer.byteLength, 'bytes')
    console.log('---------------------------------')

    console.log('Uploading to Storage via shared utility...')
    const file = new File([new Uint8Array(buffer)], 'qr.png', { type: 'image/png' })
    const qrUrl = await uploadImage(file, QR_OPTIONS)
    console.log('Saving Database...')
    console.log('qrCodeUrl:', qrUrl)

    const updatedConfig = { ...redemptionConfig, qrCodeUrl: qrUrl, qrToken }

    try {
      await prisma.offerRedemption.update({
        where: { offerId: offer.id },
        data: { configuration: updatedConfig },
      })
    } catch (dbError) {
      // Rollback: delete the uploaded QR image since DB update failed
    try {
      const { deleteImage } = await import('@/lib/upload/image')
      await deleteImage(qrUrl, { bucket: 'offer-images' })
    } catch { /* non-blocking cleanup */ }
      throw dbError
    }

    console.log('OfferRedemption Updated: true')
    console.log('---------------------------------')

    logEnd(qrUrl, qrToken)
    return { qrUrl, qrToken }
  } catch (error) {
    logFailure(offerId, 'UNEXPECTED_ERROR', error)
    return null
  }
}
