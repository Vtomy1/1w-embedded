/**
 * Code generators for embedding image assets into native Windows executables (C, C++, Win32 .rc, Rust, MASM/NASM).
 */

import { ConvertedAsset } from './imageConverter';

export interface HeaderConfig {
  variableName: string;
  headerGuard: string;
  languageStandard: 'c99' | 'cpp20' | 'msvc_align' | 'pragma_section';
  arrayFormat: 'hex_array' | 'escaped_string';
  bytesPerLine: number;
  includeGdiplusLoader: boolean;
  includeWicLoader: boolean;
  includeGdiBitmapLoader: boolean;
  resourceId: number;
  resourceName: string;
  sectionName: string;
}

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  variableName: 'g_embedded_image_asset',
  headerGuard: 'WIN_EMBEDDED_IMAGE_ASSET_H',
  languageStandard: 'cpp20',
  arrayFormat: 'hex_array',
  bytesPerLine: 16,
  includeGdiplusLoader: true,
  includeWicLoader: true,
  includeGdiBitmapLoader: true,
  resourceId: 101,
  resourceName: 'IDR_IMAGE_ASSET',
  sectionName: '.imgres',
};

/**
 * Converts byte array to formatted hex lines
 */
function bytesToHexArray(bytes: Uint8Array, bytesPerLine: number): string {
  const lines: string[] = [];
  const total = bytes.length;
  for (let i = 0; i < total; i += bytesPerLine) {
    const chunk: string[] = [];
    const end = Math.min(i + bytesPerLine, total);
    for (let j = i; j < end; j++) {
      chunk.push('0x' + bytes[j].toString(16).padStart(2, '0'));
    }
    const isLast = end === total;
    lines.push('    ' + chunk.join(', ') + (isLast ? '' : ','));
  }
  return lines.join('\n');
}

/**
 * Converts byte array to C escaped string literal "\x89\x50\x4e..."
 */
function bytesToEscapedString(bytes: Uint8Array, bytesPerLine: number): string {
  const lines: string[] = [];
  const total = bytes.length;
  for (let i = 0; i < total; i += bytesPerLine) {
    let line = '    "';
    const end = Math.min(i + bytesPerLine, total);
    for (let j = i; j < end; j++) {
      line += '\\x' + bytes[j].toString(16).padStart(2, '0');
    }
    line += '"';
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Generates standalone C/C++ Header file
 */
export function generateCppHeader(asset: ConvertedAsset, config: HeaderConfig): string {
  const { variableName, headerGuard, languageStandard, arrayFormat, bytesPerLine } = config;
  const isString = arrayFormat === 'escaped_string';
  const sizeVar = `${variableName}_size`;
  const widthVar = `${variableName}_width`;
  const heightVar = `${variableName}_height`;
  const formatVar = `${variableName}_format`;

  let declaration = '';
  if (languageStandard === 'cpp20') {
    if (isString) {
      declaration = `// Embedded asset binary literal\ninline constexpr const char ${variableName}[] =\n${bytesToEscapedString(
        asset.data,
        bytesPerLine
      )};\ninline constexpr size_t ${sizeVar} = ${asset.data.length};`;
    } else {
      declaration = `#include <array>\n#include <cstdint>\n#include <cstddef>\n\ninline constexpr std::array<uint8_t, ${asset.data.length}> ${variableName} = {\n${bytesToHexArray(
        asset.data,
        bytesPerLine
      )}\n};\ninline constexpr size_t ${sizeVar} = ${asset.data.length};`;
    }
  } else if (languageStandard === 'msvc_align') {
    declaration = `// MSVC 16-byte aligned binary array for SIMD / DirectX / GDI operations\n__declspec(align(16)) static const unsigned char ${variableName}[${asset.data.length}] = {\n${bytesToHexArray(
      asset.data,
      bytesPerLine
    )}\n};\nstatic const size_t ${sizeVar} = ${asset.data.length};`;
  } else if (languageStandard === 'pragma_section') {
    declaration = `// Place binary payload in custom PE read-only section\n#pragma section(".imgdata", read)\n__declspec(allocate(".imgdata")) static const unsigned char ${variableName}[${asset.data.length}] = {\n${bytesToHexArray(
      asset.data,
      bytesPerLine
    )}\n};\nstatic const size_t ${sizeVar} = ${asset.data.length};`;
  } else {
    // C99 standard
    declaration = `#include <stdint.h>\n#include <stddef.h>\n\nstatic const uint8_t ${variableName}[${asset.data.length}] = {\n${bytesToHexArray(
      asset.data,
      bytesPerLine
    )}\n};\nstatic const size_t ${sizeVar} = ${asset.data.length};`;
  }

  let helperLoaders = '';
  if (config.includeGdiplusLoader || config.includeWicLoader || config.includeGdiBitmapLoader) {
    helperLoaders = `
// ============================================================================
// Native Win32 / GDI+ / WIC Memory Decoders
// ============================================================================
#if defined(_WIN32) || defined(_WIN64)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <ole2.h>
#include <gdiplus.h>
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "ole32.lib")

namespace WinEmbed {

    /**
     * Creates an IStream from raw memory without heap copies
     */
    inline IStream* CreateMemoryStream(const void* data, size_t size) {
        if (!data || size == 0) return nullptr;
        HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, size);
        if (!hMem) return nullptr;
        void* pMem = GlobalLock(hMem);
        if (!pMem) {
            GlobalFree(hMem);
            return nullptr;
        }
        memcpy(pMem, data, size);
        GlobalUnlock(hMem);

        IStream* pStream = nullptr;
        if (FAILED(CreateStreamOnHGlobal(hMem, TRUE, &pStream))) {
            GlobalFree(hMem);
            return nullptr;
        }
        return pStream;
    }
`;

    if (config.includeGdiplusLoader) {
      helperLoaders += `
    /**
     * Loads the embedded image into a GDI+ Bitmap instance
     */
    inline Gdiplus::Bitmap* LoadGdiplusBitmap() {
        IStream* pStream = CreateMemoryStream(${variableName}${isString ? '' : '.data()'}, ${sizeVar});
        if (!pStream) return nullptr;
        Gdiplus::Bitmap* pBitmap = Gdiplus::Bitmap::FromStream(pStream);
        pStream->Release();
        return pBitmap;
    }
`;
    }

    if (config.includeGdiBitmapLoader) {
      helperLoaders += `
    /**
     * Creates a standard Win32 HBITMAP from the embedded image (compatible with buttons, static picture controls)
     */
    inline HBITMAP CreateWin32HBitmap(COLORREF transparentBackground = RGB(0, 0, 0)) {
        Gdiplus::Bitmap* pBmp = LoadGdiplusBitmap();
        if (!pBmp) return NULL;
        HBITMAP hBitmap = NULL;
        Gdiplus::Color bgColor;
        bgColor.SetFromCOLORREF(transparentBackground);
        pBmp->GetHBITMAP(bgColor, &hBitmap);
        delete pBmp;
        return hBitmap;
    }
`;
    }

    helperLoaders += `
} // namespace WinEmbed
#endif // _WIN32
`;
  }

  return `/**
 * Generated by WinEmbed - Windows Native Executable Header Generator
 * Target Asset: ${asset.filename} (${asset.targetFormat})
 * Dimensions:   ${asset.width} x ${asset.height} px
 * Byte Size:    ${asset.byteSize.toLocaleString()} bytes
 * Format Code:  ${asset.formatCode}
 */

#ifndef ${headerGuard}
#define ${headerGuard}

#define ${widthVar} ${asset.width}
#define ${heightVar} ${asset.height}
#define ${formatVar} "${asset.targetFormat}"

${declaration}
${helperLoaders}
#endif // ${headerGuard}
`;
}

/**
 * Generates Windows Resource Script (.rc) and resource.h files
 */
export function generateResourceScript(asset: ConvertedAsset, config: HeaderConfig): { rc: string; h: string } {
  const { resourceId, resourceName } = config;
  const filename = asset.filename;

  let resourceType = 'RCDATA';
  if (asset.targetFormat === 'bmp24' || asset.targetFormat === 'bmp32') {
    resourceType = 'BITMAP';
  } else if (asset.targetFormat === 'ico') {
    resourceType = 'ICON';
  }

  const h = `/**
 * Windows Resource Header Definition
 * Include this file in your C/C++ source and resource script.
 */
#pragma once

#ifndef ${resourceName}
#define ${resourceName} ${resourceId}
#endif
`;

  const rc = `// ============================================================================
// Windows Resource Script (.rc)
// Compile with Microsoft Resource Compiler (rc.exe) or GNU windres
// ============================================================================
#include "resource.h"
#include <windows.h>

// Resource definition: [ID] [TYPE] [FILE_PATH]
${resourceName} ${resourceType} "${filename}"
`;

  return { rc, h };
}

/**
 * Generates Win32 Native C++ Resource Extraction Code
 */
export function generateWin32ResourceExtractionCode(config: HeaderConfig): string {
  const { resourceName } = config;
  return `/**
 * Win32 Native API Resource Extraction
 * Extracts embedded image resource from PE .rsrc section in memory.
 */
#include <windows.h>
#include <stdio.h>
#include "resource.h"

struct EmbeddedResource {
    const void* data;
    DWORD size;
};

// Extracts resource pointer directly from PE memory space (Zero memory allocation!)
EmbeddedResource LoadEmbeddedResource(HINSTANCE hInstance = NULL) {
    EmbeddedResource res = { NULL, 0 };

    HRSRC hRsrc = FindResourceW(hInstance, MAKEINTRESOURCEW(${resourceName}), RT_RCDATA);
    if (!hRsrc) {
        // Fallback check for RT_BITMAP if compiled as BITMAP
        hRsrc = FindResourceW(hInstance, MAKEINTRESOURCEW(${resourceName}), RT_BITMAP);
    }
    if (!hRsrc) {
        return res;
    }

    HGLOBAL hGlobal = LoadResource(hInstance, hRsrc);
    if (!hGlobal) return res;

    res.data = LockResource(hGlobal);
    res.size = SizeofResource(hInstance, hRsrc);
    return res;
}
`;
}

/**
 * Generates PE Overlay Self-Extraction Runtime Code
 */
export function generatePeOverlayExtractionCode(): string {
  return `/**
 * Native PE Overlay Self-Extractor (C++)
 * An executable can read its own embedded image asset at runtime without external dependencies.
 */
#include <windows.h>
#include <iostream>
#include <vector>

#pragma pack(push, 1)
struct WinAssetTrailer {
    char magic[8];        // "IMGxWIN1"
    uint32_t assetId;
    uint16_t width;
    uint16_t height;
    uint8_t  formatCode;  // 1=PNG, 2=JPEG, 3=BMP, 4=ICO, 5=WEBP, 6=RAW_RGBA
    uint8_t  reserved1;
    uint16_t reserved2;
    uint32_t payloadSize;
    uint32_t checksum;
    uint32_t trailerSize; // 32
};
#pragma pack(pop)

bool ExtractEmbeddedImage(std::vector<uint8_t>& outBuffer, WinAssetTrailer& outHeader) {
    wchar_t exePath[MAX_PATH];
    if (GetModuleFileNameW(NULL, exePath, MAX_PATH) == 0) return false;

    HANDLE hFile = CreateFileW(exePath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return false;

    LARGE_INTEGER fileSize;
    if (!GetFileSizeEx(hFile, &fileSize) || fileSize.QuadPart < sizeof(WinAssetTrailer)) {
        CloseHandle(hFile);
        return false;
    }

    // Seek to trailer (last 32 bytes of executable file)
    LARGE_INTEGER seekPos;
    seekPos.QuadPart = fileSize.QuadPart - sizeof(WinAssetTrailer);
    SetFilePointerEx(hFile, seekPos, NULL, FILE_BEGIN);

    WinAssetTrailer trailer;
    DWORD bytesRead = 0;
    ReadFile(hFile, &trailer, sizeof(trailer), &bytesRead, NULL);

    if (memcmp(trailer.magic, "IMGxWIN1", 8) != 0) {
        CloseHandle(hFile);
        return false; // No WinEmbed overlay found
    }

    // Seek to payload start
    seekPos.QuadPart = fileSize.QuadPart - sizeof(WinAssetTrailer) - trailer.payloadSize;
    SetFilePointerEx(hFile, seekPos, NULL, FILE_BEGIN);

    outBuffer.resize(trailer.payloadSize);
    ReadFile(hFile, outBuffer.data(), trailer.payloadSize, &bytesRead, NULL);
    CloseHandle(hFile);

    outHeader = trailer;
    return (bytesRead == trailer.payloadSize);
}
`;
}

/**
 * Generates NASM / MASM Assembly definition
 */
export function generateAssemblyCode(asset: ConvertedAsset, config: HeaderConfig): string {
  const { variableName, bytesPerLine } = config;
  const hexLines = bytesToHexArray(asset.data, bytesPerLine);

  return `; ============================================================================
; NASM / MASM Embedded Image Asset Definition
; Asset: ${asset.filename} (${asset.byteSize.toLocaleString()} bytes)
; ============================================================================

section .rdata align=16
global _${variableName}
global _${variableName}_size

_${variableName}:
${hexLines.replace(/0x([0-9a-f]{2})/g, '0$1h')}

_${variableName}_size dd ${asset.data.length}
`;
}

/**
 * Generates Rust Module Source (asset.rs)
 */
export function generateRustCode(asset: ConvertedAsset, config: HeaderConfig): string {
  const { variableName, bytesPerLine } = config;
  const rustIdent = variableName.toUpperCase();

  return `// ============================================================================
// Rust Native Embedded Asset
// Dimensions: ${asset.width} x ${asset.height} px
// ============================================================================

/// Embedded image binary slice (${asset.byteSize.toLocaleString()} bytes)
pub static ${rustIdent}: &[u8] = &[
${bytesToHexArray(asset.data, bytesPerLine)}
];

pub const ${rustIdent}_WIDTH: u32 = ${asset.width};
pub const ${rustIdent}_HEIGHT: u32 = ${asset.height};
pub const ${rustIdent}_SIZE: usize = ${asset.data.length};

#[cfg(feature = "image")]
pub fn load_dynamic_image() -> Result<image::DynamicImage, image::ImageError> {
    image::load_from_memory(${rustIdent})
}
`;
}
