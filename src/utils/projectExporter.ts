/**
 * Project exporter bundling C/C++ headers, Win32 resources, CMakeLists, and sample main.cpp into a ZIP archive.
 */

import JSZip from 'jszip';
import { ConvertedAsset } from './imageConverter';
import { HeaderConfig, generateCppHeader, generateResourceScript, generateWin32ResourceExtractionCode } from './codeGenerators';

export async function exportDeveloperZip(
  asset: ConvertedAsset,
  config: HeaderConfig,
  patchedPeBuffer?: Uint8Array
): Promise<Blob> {
  const zip = new JSZip();

  // 1. C/C++ Header
  const headerContent = generateCppHeader(asset, config);
  zip.file(`include/${config.variableName}.h`, headerContent);

  // 2. Resource script & Resource header
  const { rc, h } = generateResourceScript(asset, config);
  zip.file('resources/app.rc', rc);
  zip.file('resources/resource.h', h);

  // 3. Raw image asset binary
  zip.file(`resources/${asset.filename}`, asset.data);

  // 4. Sample main.cpp demonstrating Win32 window displaying the embedded image
  const sampleMainCpp = `/**
 * Win32 Native Application Sample
 * Demonstrates loading and displaying embedded image asset without external files.
 * Compile with Visual Studio: cl /EHsc main.cpp /link user32.lib gdi32.lib gdiplus.lib ole32.lib
 */

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include "../include/${config.variableName}.h"
#include "../resources/resource.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "ole32.lib")

static ULONG_PTR g_gdiplusToken = 0;
static Gdiplus::Bitmap* g_pBitmap = nullptr;

LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_CREATE: {
        // Load the image directly from the header memory array!
        g_pBitmap = WinEmbed::LoadGdiplusBitmap();
        return 0;
    }
    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hWnd, &ps);
        if (g_pBitmap) {
            Gdiplus::Graphics graphics(hdc);
            // Draw background
            Gdiplus::SolidBrush bgBrush(Gdiplus::Color(255, 15, 23, 42));
            RECT rc;
            GetClientRect(hWnd, &rc);
            graphics.FillRectangle(&bgBrush, 0, 0, rc.right, rc.bottom);

            // Draw embedded image centered
            int imgW = g_pBitmap->GetWidth();
            int imgH = g_pBitmap->GetHeight();
            int posX = max(20, (rc.right - imgW) / 2);
            int posY = max(20, (rc.bottom - imgH) / 2);
            graphics.DrawImage(g_pBitmap, posX, posY, imgW, imgH);
        }
        EndPaint(hWnd, &ps);
        return 0;
    }
    case WM_DESTROY: {
        if (g_pBitmap) {
            delete g_pBitmap;
            g_pBitmap = nullptr;
        }
        PostQuitMessage(0);
        return 0;
    }
    }
    return DefWindowProc(hWnd, message, wParam, lParam);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE, LPSTR, int nCmdShow) {
    // Initialize GDI+
    Gdiplus::GdiplusStartupInput gdiplusStartupInput;
    Gdiplus::GdiplusStartup(&g_gdiplusToken, &gdiplusStartupInput, NULL);

    WNDCLASS wc = { 0 };
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"WinEmbedSampleWindow";
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    RegisterClass(&wc);

    HWND hWnd = CreateWindowEx(
        0, wc.lpszClassName,
        L"WinEmbed - Native Embedded Asset Viewer",
        WS_OVERLAPPEDWINDOW | WS_VISIBLE,
        CW_USEDEFAULT, CW_USEDEFAULT,
        max(600, ${asset.width} + 80), max(400, ${asset.height} + 120),
        NULL, NULL, hInstance, NULL
    );

    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    Gdiplus::GdiplusShutdown(g_gdiplusToken);
    return (int)msg.wParam;
}
`;
  zip.file('src/main.cpp', sampleMainCpp);

  // 5. CMakeLists.txt
  const cmakeContent = `cmake_minimum_required(VERSION 3.20)
project(WinEmbedApp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(WinEmbedApp WIN32
    src/main.cpp
    include/${config.variableName}.h
    resources/resource.h
    resources/app.rc
)

target_include_directories(WinEmbedApp PRIVATE include resources)
target_link_libraries(WinEmbedApp PRIVATE user32 gdi32 gdiplus ole32)
`;
  zip.file('CMakeLists.txt', cmakeContent);

  // 6. Win32 resource extraction snippet
  zip.file('src/resource_loader.h', generateWin32ResourceExtractionCode(config));

  // 7. README.md
  const readmeContent = `# WinEmbed Developer Asset Package

Embedded Asset: \`${asset.filename}\`
Dimensions: \`${asset.width} x ${asset.height} px\`
Byte Size: \`${asset.byteSize.toLocaleString()} bytes\`
Target Format: \`${asset.targetFormat}\`

## Contents
- \`include/${config.variableName}.h\`: Native C/C++ header containing the byte array and GDI+/WIC memory loaders.
- \`resources/app.rc\`: Standard Windows Resource Script.
- \`resources/resource.h\`: Resource identifier definition.
- \`resources/${asset.filename}\`: Converted binary image asset.
- \`src/main.cpp\`: Complete Win32 window application displaying the embedded asset.
- \`CMakeLists.txt\`: Ready-to-build CMake configuration for Visual Studio or CLion.

## How to Build with MSVC (Visual Studio Developer Command Prompt)
\`\`\`cmd
cd src
cl /EHsc /std:c++20 main.cpp /I../include /I../resources /link user32.lib gdi32.lib gdiplus.lib ole32.lib /out:WinEmbedApp.exe
WinEmbedApp.exe
\`\`\`

## How to Build with CMake
\`\`\`cmd
cmake -B build
cmake --build build --config Release
.\\build\\Release\\WinEmbedApp.exe
\`\`\`
`;
  zip.file('README.md', readmeContent);

  // 8. If patched PE buffer provided, include it in the zip as well
  if (patchedPeBuffer && patchedPeBuffer.length > 0) {
    zip.file('bin/embedded_application.exe', patchedPeBuffer);
  }

  return await zip.generateAsync({ type: 'blob' });
}
