export const IMAGE_LIMITS = { count: 4, bytes: 8 * 1024 * 1024, edge: 2560, target: 1.5 * 1024 * 1024, minEdge: 640 };
const SENT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const PHOTO = ["image/jpeg", "image/heic", "image/heif", "image/avif"];
const LINES = { image_type: "This image can't be sent", image_too_large: "The image is too large" };
const refuse = (code) => Object.assign(new Error(code), { code, line: LINES[code] });
export function sniff(bytes) {
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && bytes[0] === 137 && ascii(1, 8) === "PNG\r\n\n") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
export function base64(bytes) {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return btoa(binary);
}
export const fit = (width, height, edge) => {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};
export async function prepareImage(file, codec = browserCodec(), limits = IMAGE_LIMITS) {
  const bytes = new Uint8Array(await file.arrayBuffer()), type = sniff(bytes);
  let bitmap;
  try {
    bitmap = await codec.decode(file);
  } catch {
    throw refuse("image_type");
  }
  try {
    const { width, height } = bitmap;
    if (!(width > 0 && height > 0)) throw refuse("image_type");
    if (SENT.includes(type) && bytes.length <= limits.target && Math.max(width, height) <= limits.edge) return { data: base64(bytes), mimeType: type, width, height, bytes: bytes.length };
    let size = fit(width, height, limits.edge), types = PHOTO.includes(type ?? file.type) ? ["image/jpeg"] : ["image/png", "image/webp", "image/jpeg"];
    for (; ; ) {
      let best = null;
      for (const wanted of types) {
        const blob = await codec.encode(bitmap, { ...size, type: wanted, quality: 0.9 });
        const out = blob && new Uint8Array(await blob.arrayBuffer()), got = out && sniff(out);
        if (got !== wanted) continue;
        if (out.length <= limits.target) return { data: base64(out), mimeType: got, ...size, bytes: out.length };
        if (!best || out.length < best.out.length) best = { out, got };
      }
      const edge = Math.max(size.width, size.height);
      if (edge <= limits.minEdge) {
        if (best && best.out.length <= limits.bytes) return { data: base64(best.out), mimeType: best.got, ...size, bytes: best.out.length };
        throw refuse("image_too_large");
      }
      size = fit(size.width, size.height, Math.max(limits.minEdge, Math.floor(edge * 3 / 4)));
      types = types.filter((wanted) => wanted !== "image/png");
    }
  } finally {
    bitmap.close?.();
  }
}
export function transferImages(transfer) {
  const files = transfer?.items ? Array.from(transfer.items).filter((item) => item.kind === "file").map((item) => item.getAsFile()) : Array.from(transfer?.files ?? []);
  return files.filter((file) => file && /^image\//.test(file.type));
}
export function browserCodec() {
  return { decode: (blob) => createImageBitmap(blob, { imageOrientation: "from-image" }), async encode(bitmap, { width, height, type, quality }) {
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    if (type === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob ? canvas.convertToBlob({ type, quality }) : new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  } };
}
