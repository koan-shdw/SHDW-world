// S2 (SHOW.md §5): a dropped work goes up to the store as it is dropped. The image is resized here, in the browser, to
// 2048 px on the long side (JPEG 88; PNG kept when it has alpha), with a 240 px thumb. A GLB goes up as it is.
export interface Prepped { blob: Blob; type: string; thumb: Blob | null }

const dataToBlob = async (data: string): Promise<Blob> => (await fetch(data)).blob()
const draw = (bmp: ImageBitmap, max: number): HTMLCanvasElement => {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); return c
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('could not encode the image'))), type, q))
const hasAlpha = (c: HTMLCanvasElement): boolean => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false }

export async function prepPainting(data: string): Promise<Prepped> {
  const src = await dataToBlob(data)
  const bmp = await createImageBitmap(src)
  try {
    const big = draw(bmp, 2048)
    const png = src.type === 'image/png' && hasAlpha(draw(bmp, 64))
    const blob = png ? await toBlob(big, 'image/png') : await toBlob(big, 'image/jpeg', 0.88)
    const thumb = await toBlob(draw(bmp, 240), 'image/jpeg', 0.85)
    return { blob, type: png ? 'image/png' : 'image/jpeg', thumb }
  } finally { bmp.close() }
}

export async function prepModel(data: string): Promise<Prepped> {
  const blob = await dataToBlob(data)
  return { blob: new Blob([blob], { type: 'model/gltf-binary' }), type: 'model/gltf-binary', thumb: null }
}
