/**
 * Windows Portable Executable (PE) Parser & Section / Overlay Injector
 * Handles 32-bit (PE32) and 64-bit (PE32+) executables.
 */

export interface PeSection {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  sizeOfRawData: number;
  pointerToRawData: number;
  characteristics: number;
}

export interface PeInfo {
  isPe: boolean;
  is64Bit: boolean;
  machine: number;
  machineName: string;
  numberOfSections: number;
  timeDateStamp: number;
  entryPointRva: number;
  imageBase: bigint | number;
  sectionAlignment: number;
  fileAlignment: number;
  sizeOfImage: number;
  sizeOfHeaders: number;
  subsystem: number;
  subsystemName: string;
  checksum: number;
  sections: PeSection[];
  totalRawSize: number;
  fileSize: number;
  hasOverlay: boolean;
  overlaySize: number;
  overlayOffset: number;
  peHeaderOffset: number;
}

export interface WinAssetDescriptor {
  magic: string; // 'IMGxWIN1' (8 bytes)
  assetId: number; // uint32
  width: number; // uint16
  height: number; // uint16
  formatCode: number; // uint8: 1=PNG, 2=JPEG, 3=BMP, 4=ICO, 5=WEBP, 6=RAW_RGBA
  payloadSize: number; // uint32
  checksum: number; // uint32
}

const MACHINE_NAMES: Record<number, string> = {
  0x014c: 'Intel 386 / x86',
  0x8664: 'AMD64 / x86-64',
  0x0200: 'Intel Itanium',
  0xaa64: 'ARM64',
  0x01c0: 'ARM little endian',
  0x01c4: 'ARM Thumb-2',
};

const SUBSYSTEM_NAMES: Record<number, string> = {
  1: 'Native',
  2: 'Windows GUI (WinMain)',
  3: 'Windows CUI (Console / main)',
  7: 'POSIX CUI',
  9: 'Windows CE GUI',
  10: 'EFI Application',
  11: 'EFI Boot Service Driver',
  12: 'EFI Runtime Driver',
  14: 'Xbox',
  16: 'Windows Boot Application',
};

export function parsePe(buffer: Uint8Array): PeInfo | null {
  if (buffer.length < 64) return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // DOS MZ signature: 0x5A4D ('MZ')
  const mz = view.getUint16(0, true);
  if (mz !== 0x5a4d) {
    return null;
  }

  // e_lfanew at offset 0x3C points to PE header
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset + 24 > buffer.length) {
    return null;
  }

  // PE Signature: 'PE\0\0' (0x00004550)
  const peSig = view.getUint32(peOffset, true);
  if (peSig !== 0x00004550) {
    return null;
  }

  // COFF File Header (20 bytes starting at peOffset + 4)
  const coffOffset = peOffset + 4;
  const machine = view.getUint16(coffOffset, true);
  const numberOfSections = view.getUint16(coffOffset + 2, true);
  const timeDateStamp = view.getUint32(coffOffset + 4, true);
  const sizeOfOptionalHeader = view.getUint16(coffOffset + 16, true);

  // Optional Header
  const optOffset = coffOffset + 20;
  if (optOffset + sizeOfOptionalHeader > buffer.length) {
    return null;
  }

  const optMagic = view.getUint16(optOffset, true);
  const is64Bit = optMagic === 0x020b; // PE32+ (64-bit)

  const entryPointRva = view.getUint32(optOffset + 16, true);

  let imageBase: bigint | number;
  let sectionAlignment: number;
  let fileAlignment: number;
  let sizeOfImage: number;
  let sizeOfHeaders: number;
  let checksum: number;
  let subsystem: number;

  if (is64Bit) {
    imageBase = view.getBigUint64(optOffset + 24, true);
    sectionAlignment = view.getUint32(optOffset + 32, true);
    fileAlignment = view.getUint32(optOffset + 36, true);
    sizeOfImage = view.getUint32(optOffset + 56, true);
    sizeOfHeaders = view.getUint32(optOffset + 60, true);
    checksum = view.getUint32(optOffset + 64, true);
    subsystem = view.getUint16(optOffset + 68, true);
  } else {
    imageBase = view.getUint32(optOffset + 28, true);
    sectionAlignment = view.getUint32(optOffset + 32, true);
    fileAlignment = view.getUint32(optOffset + 36, true);
    sizeOfImage = view.getUint32(optOffset + 56, true);
    sizeOfHeaders = view.getUint32(optOffset + 60, true);
    checksum = view.getUint32(optOffset + 64, true);
    subsystem = view.getUint16(optOffset + 68, true);
  }

  // Section Headers start right after Optional Header
  const sectionTableOffset = optOffset + sizeOfOptionalHeader;
  const sections: PeSection[] = [];
  let maxRawEnd = sizeOfHeaders;

  for (let i = 0; i < numberOfSections; i++) {
    const secOffset = sectionTableOffset + i * 40;
    if (secOffset + 40 > buffer.length) break;

    // Read 8-byte ASCII name
    let name = '';
    for (let c = 0; c < 8; c++) {
      const charCode = buffer[secOffset + c];
      if (charCode === 0) break;
      name += String.fromCharCode(charCode);
    }

    const virtualSize = view.getUint32(secOffset + 8, true);
    const virtualAddress = view.getUint32(secOffset + 12, true);
    const sizeOfRawData = view.getUint32(secOffset + 16, true);
    const pointerToRawData = view.getUint32(secOffset + 20, true);
    const characteristics = view.getUint32(secOffset + 36, true);

    sections.push({
      name,
      virtualSize,
      virtualAddress,
      sizeOfRawData,
      pointerToRawData,
      characteristics,
    });

    const rawEnd = pointerToRawData + sizeOfRawData;
    if (rawEnd > maxRawEnd) {
      maxRawEnd = rawEnd;
    }
  }

  const fileSize = buffer.length;
  const hasOverlay = fileSize > maxRawEnd;
  const overlaySize = hasOverlay ? fileSize - maxRawEnd : 0;
  const overlayOffset = maxRawEnd;

  return {
    isPe: true,
    is64Bit,
    machine,
    machineName: MACHINE_NAMES[machine] || `Unknown (0x${machine.toString(16)})`,
    numberOfSections,
    timeDateStamp,
    entryPointRva,
    imageBase,
    sectionAlignment,
    fileAlignment,
    sizeOfImage,
    sizeOfHeaders,
    subsystem,
    subsystemName: SUBSYSTEM_NAMES[subsystem] || `Subsystem ${subsystem}`,
    checksum,
    sections,
    totalRawSize: maxRawEnd,
    fileSize,
    hasOverlay,
    overlaySize,
    overlayOffset,
    peHeaderOffset: peOffset,
  };
}

/**
 * Calculates Microsoft PE partial checksum over Uint8Array buffer
 */
export function calculatePeChecksum(buffer: Uint8Array, peHeaderOffset: number, is64Bit: boolean): number {
  const checksumOffset = peHeaderOffset + 4 + 20 + 64;
  let checksum = 0;
  const len = buffer.length;
  const words = Math.floor(len / 2);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  for (let i = 0; i < words; i++) {
    const bytePos = i * 2;
    // Skip checksum field itself
    if (bytePos === checksumOffset || bytePos === checksumOffset + 2) {
      continue;
    }
    const word = view.getUint16(bytePos, true);
    checksum = (checksum + word) & 0xffffffff;
    if (checksum > 0xffff) {
      checksum = (checksum & 0xffff) + (checksum >>> 16);
    }
  }

  // Handle trailing odd byte if any
  if (len % 2 !== 0) {
    const lastByte = buffer[len - 1];
    checksum = (checksum + lastByte) & 0xffffffff;
    if (checksum > 0xffff) {
      checksum = (checksum & 0xffff) + (checksum >>> 16);
    }
  }

  checksum = (checksum & 0xffff) + (checksum >>> 16);
  checksum = checksum + len;
  return checksum >>> 0;
}

/**
 * Align value up to multiple of alignment
 */
function alignUp(value: number, alignment: number): number {
  if (alignment <= 0) return value;
  const remainder = value % alignment;
  if (remainder === 0) return value;
  return value + (alignment - remainder);
}

/**
 * Embeds image asset into PE via standard Overlay (appended payload with structured trailer).
 * Used extensively in native self-extractors, game stagers, and asset packs.
 */
export function embedAsOverlay(
  peBuffer: Uint8Array,
  imagePayload: Uint8Array,
  descriptor: {
    assetId: number;
    width: number;
    height: number;
    formatCode: number;
  }
): Uint8Array {
  const peInfo = parsePe(peBuffer);
  // Cut any prior overlay to cleanly replace or cleanly append
  const baseLen = peInfo && peInfo.hasOverlay ? peInfo.overlayOffset : peBuffer.length;

  const MAGIC = 'IMGxWIN1'; // 8 bytes
  const TRAILER_SIZE = 32; // Fixed 32-byte descriptor trailer
  const totalLength = baseLen + imagePayload.length + TRAILER_SIZE;

  const result = new Uint8Array(totalLength);
  result.set(peBuffer.subarray(0, baseLen), 0);
  result.set(imagePayload, baseLen);

  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  const trailerPos = baseLen + imagePayload.length;

  // Magic
  for (let i = 0; i < 8; i++) {
    result[trailerPos + i] = MAGIC.charCodeAt(i);
  }

  // Asset ID (uint32)
  view.setUint32(trailerPos + 8, descriptor.assetId, true);
  // Width (uint16)
  view.setUint16(trailerPos + 12, descriptor.width, true);
  // Height (uint16)
  view.setUint16(trailerPos + 14, descriptor.height, true);
  // Format Code (uint8)
  view.setUint8(trailerPos + 16, descriptor.formatCode);
  // Reserved (3 bytes)
  view.setUint8(trailerPos + 17, 0);
  view.setUint16(trailerPos + 18, 0, true);
  // Payload Size (uint32)
  view.setUint32(trailerPos + 20, imagePayload.length, true);

  // Simple CRC/sum of payload bytes for integrity check
  let sum = 0;
  for (let i = 0; i < imagePayload.length; i++) {
    sum = (sum + imagePayload[i]) & 0xffffffff;
  }
  view.setUint32(trailerPos + 24, sum, true);

  // Trailer size verification (uint32)
  view.setUint32(trailerPos + 28, TRAILER_SIZE, true);

  // Recalculate PE checksum if PE was valid
  if (peInfo) {
    const chk = calculatePeChecksum(result, peInfo.peHeaderOffset, peInfo.is64Bit);
    const checksumOffset = peInfo.peHeaderOffset + 4 + 20 + 64;
    view.setUint32(checksumOffset, chk, true);
  }

  return result;
}

/**
 * Injects a new PE Section (e.g. '.imgres' or '.rsrc') directly into PE Header and payload body.
 */
export function injectNewPeSection(
  peBuffer: Uint8Array,
  sectionName: string,
  imagePayload: Uint8Array
): { success: boolean; error?: string; buffer?: Uint8Array } {
  const peInfo = parsePe(peBuffer);
  if (!peInfo) {
    return { success: false, error: 'File is not a valid Windows PE binary (MZ/PE header missing).' };
  }

  const view = new DataView(peBuffer.buffer, peBuffer.byteOffset, peBuffer.byteLength);
  const peOffset = peInfo.peHeaderOffset;
  const coffOffset = peOffset + 4;
  const sizeOfOpt = view.getUint16(coffOffset + 16, true);
  const sectionTableOffset = coffOffset + 20 + sizeOfOpt;
  const currentSections = peInfo.numberOfSections;

  const newSectionOffset = sectionTableOffset + currentSections * 40;
  if (newSectionOffset + 40 > peInfo.sizeOfHeaders) {
    return {
      success: false,
      error: 'Not enough padding in PE header table to add a new section header without resizing headers.',
    };
  }

  // Calculate new VirtualAddress and PointerToRawData
  const lastSection = peInfo.sections[peInfo.sections.length - 1];
  let nextVa = peInfo.sectionAlignment;
  let nextRawPtr = peInfo.sizeOfHeaders;

  if (lastSection) {
    nextVa = alignUp(lastSection.virtualAddress + lastSection.virtualSize, peInfo.sectionAlignment);
    nextRawPtr = alignUp(lastSection.pointerToRawData + lastSection.sizeOfRawData, peInfo.fileAlignment);
  }

  const rawSizeAligned = alignUp(imagePayload.length, peInfo.fileAlignment);
  const virtSizeAligned = alignUp(imagePayload.length, peInfo.sectionAlignment);

  // Create new PE buffer with payload
  const newFileSize = nextRawPtr + rawSizeAligned;
  const newBuf = new Uint8Array(newFileSize);
  newBuf.set(peBuffer.subarray(0, nextRawPtr), 0);
  newBuf.set(imagePayload, nextRawPtr);

  const newView = new DataView(newBuf.buffer, newBuf.byteOffset, newBuf.byteLength);

  // Increment NumberOfSections
  newView.setUint16(coffOffset + 2, currentSections + 1, true);

  // Update SizeOfImage in Optional Header
  const optOffset = coffOffset + 20;
  const newSizeOfImage = nextVa + virtSizeAligned;
  newView.setUint32(optOffset + 56, newSizeOfImage, true);

  // Write new Section Header (40 bytes)
  // Name (8 bytes ASCII)
  const cleanName = sectionName.startsWith('.') ? sectionName : '.' + sectionName;
  for (let i = 0; i < 8; i++) {
    newBuf[newSectionOffset + i] = i < cleanName.length ? cleanName.charCodeAt(i) : 0;
  }
  // VirtualSize
  newView.setUint32(newSectionOffset + 8, imagePayload.length, true);
  // VirtualAddress
  newView.setUint32(newSectionOffset + 12, nextVa, true);
  // SizeOfRawData
  newView.setUint32(newSectionOffset + 16, rawSizeAligned, true);
  // PointerToRawData
  newView.setUint32(newSectionOffset + 20, nextRawPtr, true);
  // PointerToRelocations (0)
  newView.setUint32(newSectionOffset + 24, 0, true);
  // PointerToLinenumbers (0)
  newView.setUint32(newSectionOffset + 28, 0, true);
  // NumberOfRelocations & NumberOfLinenumbers (0)
  newView.setUint32(newSectionOffset + 32, 0, true);
  // Characteristics: IMAGE_SCN_MEM_READ (0x40000000) | IMAGE_SCN_CNT_INITIALIZED_DATA (0x00000040)
  newView.setUint32(newSectionOffset + 36, 0x40000040, true);

  // Recalculate checksum
  const chk = calculatePeChecksum(newBuf, peOffset, peInfo.is64Bit);
  const checksumOffset = optOffset + 64;
  newView.setUint32(checksumOffset, chk, true);

  return { success: true, buffer: newBuf };
}

/**
 * Creates a valid, standalone minimal 64-bit Windows GUI PE executable.
 * Contains standard DOS stub, valid PE32+ header, and a tiny .text section.
 * Can be run on Windows (displays or exits cleanly) and used to test embedding.
 */
export function createMinimalWindowsExecutable(): Uint8Array {
  // A clean 1024-byte valid 64-bit Windows GUI PE stub
  const fileAlignment = 0x200; // 512
  const sectionAlignment = 0x1000; // 4096
  const buffer = new Uint8Array(fileAlignment * 2); // 1024 bytes (Header + .text section)
  const view = new DataView(buffer.buffer);

  // 1. DOS Header
  buffer[0] = 0x4d; // 'M'
  buffer[1] = 0x5a; // 'Z'
  view.setUint16(0x02, 0x0090, true); // e_cblp
  view.setUint16(0x04, 0x0003, true); // e_cp
  view.setUint16(0x08, 0x0004, true); // e_cparhdr
  view.setUint16(0x0a, 0x0000, true); // e_minalloc
  view.setUint16(0x0c, 0xffff, true); // e_maxalloc
  view.setUint16(0x12, 0x0000, true); // e_csum
  view.setUint16(0x18, 0x0040, true); // e_lfarlc
  view.setUint32(0x3c, 0x0080, true); // e_lfanew = offset 128 (0x80)

  // DOS Stub ("This program cannot be run in DOS mode.$")
  const dosStub = [
    0x0e, 0x1f, 0xba, 0x0e, 0x00, 0xb4, 0x09, 0xcd, 0x21, 0xb8, 0x01, 0x4c, 0xcd, 0x21,
    0x54, 0x68, 0x69, 0x73, 0x20, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61, 0x6d, 0x20, 0x63,
    0x61, 0x6e, 0x6e, 0x6f, 0x74, 0x20, 0x62, 0x65, 0x20, 0x72, 0x75, 0x6e, 0x20, 0x69,
    0x6e, 0x20, 0x44, 0x4f, 0x53, 0x20, 0x6d, 0x6f, 0x64, 0x65, 0x2e, 0x0d, 0x0d, 0x0a, 0x24,
  ];
  buffer.set(dosStub, 0x40);

  // 2. PE Header at 0x80
  const peOffset = 0x80;
  // 'PE\0\0'
  view.setUint32(peOffset, 0x00004550, true);

  // COFF Header (20 bytes at peOffset + 4)
  const coff = peOffset + 4;
  view.setUint16(coff + 0, 0x8664, true); // Machine: AMD64 (x64)
  view.setUint16(coff + 2, 1, true); // NumberOfSections: 1 (.text)
  view.setUint32(coff + 4, 0x67b5f000, true); // TimeDateStamp
  view.setUint32(coff + 8, 0, true); // PointerToSymbolTable
  view.setUint32(coff + 12, 0, true); // NumberOfSymbols
  view.setUint16(coff + 16, 240, true); // SizeOfOptionalHeader (PE32+)
  view.setUint16(coff + 18, 0x0022, true); // Characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  // Optional Header (PE32+ 240 bytes at coff + 20)
  const opt = coff + 20;
  view.setUint16(opt + 0, 0x020b, true); // Magic: PE32+ (64-bit)
  buffer[opt + 2] = 14; // MajorLinkerVersion
  buffer[opt + 3] = 0; // MinorLinkerVersion
  view.setUint32(opt + 4, fileAlignment, true); // SizeOfCode
  view.setUint32(opt + 8, 0, true); // SizeOfInitializedData
  view.setUint32(opt + 12, 0, true); // SizeOfUninitializedData
  view.setUint32(opt + 16, sectionAlignment, true); // AddressOfEntryPoint (RVA 0x1000)
  view.setUint32(opt + 20, sectionAlignment, true); // BaseOfCode (RVA 0x1000)

  // ImageBase (64-bit: 0x0000000140000000)
  view.setBigUint64(opt + 24, 0x140000000n, true);
  view.setUint32(opt + 32, sectionAlignment, true); // SectionAlignment (0x1000)
  view.setUint32(opt + 36, fileAlignment, true); // FileAlignment (0x200)
  view.setUint16(opt + 40, 6, true); // MajorOperatingSystemVersion
  view.setUint16(opt + 42, 0, true); // MinorOperatingSystemVersion
  view.setUint16(opt + 44, 0, true); // MajorImageVersion
  view.setUint16(opt + 46, 0, true); // MinorImageVersion
  view.setUint16(opt + 48, 6, true); // MajorSubsystemVersion
  view.setUint16(opt + 50, 0, true); // MinorSubsystemVersion
  view.setUint32(opt + 52, 0, true); // Win32VersionValue
  view.setUint32(opt + 56, sectionAlignment * 2, true); // SizeOfImage (0x2000)
  view.setUint32(opt + 60, fileAlignment, true); // SizeOfHeaders (0x200)
  view.setUint32(opt + 64, 0, true); // CheckSum
  view.setUint16(opt + 68, 2, true); // Subsystem: Windows GUI
  view.setUint16(opt + 70, 0x8160, true); // DllCharacteristics: DYNAMIC_BASE | NX_COMPAT | TERMINAL_SERVER_AWARE
  view.setBigUint64(opt + 72, 0x100000n, true); // SizeOfStackReserve
  view.setBigUint64(opt + 80, 0x1000n, true); // SizeOfStackCommit
  view.setBigUint64(opt + 88, 0x100000n, true); // SizeOfHeapReserve
  view.setBigUint64(opt + 96, 0x1000n, true); // SizeOfHeapCommit
  view.setUint32(opt + 104, 0, true); // LoaderFlags
  view.setUint32(opt + 108, 16, true); // NumberOfRvaAndSizes

  // Section Table starts at opt + 240 = 0x80 + 24 + 240 = 0x188
  const secTable = opt + 240;
  // Section 1: ".text\0\0\0"
  const secName = [0x2e, 0x74, 0x65, 0x78, 0x74, 0x00, 0x00, 0x00];
  buffer.set(secName, secTable);
  view.setUint32(secTable + 8, 32, true); // VirtualSize (32 bytes)
  view.setUint32(secTable + 12, sectionAlignment, true); // VirtualAddress (0x1000)
  view.setUint32(secTable + 16, fileAlignment, true); // SizeOfRawData (512)
  view.setUint32(secTable + 20, fileAlignment, true); // PointerToRawData (0x200)
  view.setUint32(secTable + 24, 0, true); // PointerToRelocations
  view.setUint32(secTable + 28, 0, true); // PointerToLinenumbers
  view.setUint16(secTable + 32, 0, true); // NumberOfRelocations
  view.setUint16(secTable + 34, 0, true); // NumberOfLinenumbers
  // IMAGE_SCN_CNT_CODE | IMAGE_SCN_MEM_EXECUTE | IMAGE_SCN_MEM_READ (0x60000020)
  view.setUint32(secTable + 36, 0x60000020, true);

  // .text Section at offset 0x200: x64 assembly instructions to return 0 cleanly:
  // xor eax, eax (31 c0)
  // ret          (c3)
  const code = [0x31, 0xc0, 0xc3];
  buffer.set(code, fileAlignment);

  // Compute final checksum
  const chk = calculatePeChecksum(buffer, peOffset, true);
  view.setUint32(opt + 64, chk, true);

  return buffer;
}
