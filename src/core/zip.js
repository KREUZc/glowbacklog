const encoder = new TextEncoder();
let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[i] = value >>> 0;
  }
  return crcTable;
}

export function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.max(1980, safeDate.getFullYear());
  const dosTime = (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | Math.floor(safeDate.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate();
  return { dosDate, dosTime };
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

async function partToBytes(part) {
  if (part instanceof Uint8Array) return part;
  if (part instanceof ArrayBuffer) return new Uint8Array(part);
  if (typeof Blob !== "undefined" && part instanceof Blob) return new Uint8Array(await part.arrayBuffer());
  if (typeof part === "string") return encoder.encode(part);
  return encoder.encode(String(part ?? ""));
}

async function fileToBytes(file) {
  if (file?.arrayBuffer) return new Uint8Array(await file.arrayBuffer());
  if (Array.isArray(file?.parts)) {
    return concatBytes(await Promise.all(file.parts.map(partToBytes)));
  }
  return new Uint8Array();
}

export function normalizeZipPath(path = "file") {
  return String(path)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\.\.+/g, ".")
    .replace(/\/+/g, "/") || "file";
}

export async function buildZipBlob(files = [], { folder = "", onProgress } = {}) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  const zipFolder = folder ? `${normalizeZipPath(folder).replace(/\/$/, "")}/` : "";

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const name = `${zipFolder}${normalizeZipPath(file.name || `file_${index + 1}`)}`;
    const nameBytes = encoder.encode(name);
    const data = await fileToBytes(file);
    const checksum = crc32(data);
    const { dosDate, dosTime } = dosDateTime(file.lastModified ? new Date(file.lastModified) : new Date());
    const utf8Flag = 0x0800;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, utf8Flag);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, dosTime);
    writeU16(localView, 12, dosDate);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, data.length);
    writeU32(localView, 22, data.length);
    writeU16(localView, 26, nameBytes.length);
    writeU16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, utf8Flag);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, dosTime);
    writeU16(centralView, 14, dosDate);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, data.length);
    writeU32(centralView, 24, data.length);
    writeU16(centralView, 28, nameBytes.length);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, data);
    centralChunks.push(centralHeader);
    offset += localHeader.length + data.length;
    onProgress?.(Math.round(((index + 1) / Math.max(files.length, 1)) * 100));
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 4, 0);
  writeU16(endView, 6, 0);
  writeU16(endView, 8, files.length);
  writeU16(endView, 10, files.length);
  writeU32(endView, 12, centralSize);
  writeU32(endView, 16, offset);
  writeU16(endView, 20, 0);

  return new Blob([...localChunks, ...centralChunks, end], { type: "application/zip" });
}
