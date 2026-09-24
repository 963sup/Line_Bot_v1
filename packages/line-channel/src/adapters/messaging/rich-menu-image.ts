/** Inspect the actual image being uploaded, not a separate design source. */
export function richMenuImage(bytes: Uint8Array) {
  if (bytes.length > 1_000_000) throw new Error("Rich menu image must be under 1 MB");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png =
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    view.getUint32(12) === 0x49484452;
  if (png) return checkedSize(view.getUint32(16), view.getUint32(20), "image/png");
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("Rich menu image must be JPEG or PNG");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) break;
      const height = view.getUint16(offset + 3),
        width = view.getUint16(offset + 5);
      return checkedSize(width, height, "image/jpeg");
    }
    offset += length;
  }
  throw new Error("Invalid or unsupported rich menu image");
}

function checkedSize(width: number, height: number, mimeType: "image/jpeg" | "image/png") {
  if (width < 800 || width > 2500 || height < 250 || width / height < 1.45)
    throw new Error("Rich menu dimensions are invalid");
  return { width, height, mimeType };
}
