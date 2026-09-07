// Utilidades de imagen que corren EN EL NAVEGADOR: comprimir la foto del
// comprobante antes de subirla (los celulares producen fotos de 3–8 MB; a
// 1600px JPEG quedan en ~200–400 KB, más que suficiente para leerlas).

export interface ImagenLista {
  name: string;
  mime: string;
  /** contenido en base64 (sin prefijo data:) */
  data: string;
}

const MAX_LADO = 1600;
const CALIDAD = 0.82;

export async function comprimirImagen(file: File): Promise<ImagenLista> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null; // formato que el navegador no decodifica (ej. HEIC en Chrome) → se sube tal cual
  }
  if (!bitmap) {
    return { name: file.name, mime: file.type || "image/jpeg", data: aBase64(await file.arrayBuffer()) };
  }
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { name: file.name, mime: file.type || "image/jpeg", data: aBase64(await file.arrayBuffer()) };
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo comprimir la imagen"))), "image/jpeg", CALIDAD),
  );
  return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", data: aBase64(await blob.arrayBuffer()) };
}

function aBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sube una imagen a una nota ya creada. Devuelve el error (texto) o null. */
export async function subirAdjunto(noteId: number, file: File): Promise<string | null> {
  try {
    const img = await comprimirImagen(file);
    const res = await fetch("/api/notas/adjunto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, ...img }),
    });
    if (res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return j.error ?? `Error ${res.status} al subir ${file.name}`;
  } catch (e) {
    return e instanceof Error ? e.message : `No se pudo subir ${file.name}`;
  }
}
