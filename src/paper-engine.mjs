/**
 * PaperClean (净卷宝) — Dual-Runtime Pixel-Level Exam Paper Restoration & Smart Blank-Space Engine.
 * Runs identically in Node.js (ESM) and modern browsers (<script type="module">) with zero dependencies.
 */

export const PUBLIC_SPKI_BASE64 = "MCowBQYDK2VwAyEAP5NCVP7CT0tgaGLSGMe4r87SjYRWTM6gN6igBZYSXys=";
export const PRODUCT_SLUG = "paper-clean";
export const PRICE_CNY = 15;
export const ORDER_EMAIL_QQ = "3152557994@qq.com";
export const ORDER_EMAIL_GMAIL = "a3152557994@gmail.com";

export const A4_SPECS = {
  widthPx: 1240,
  heightPx: 1754,
  marginPx: 56,
  sectionGapPx: 32,
};

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Convert 8-bit RGB (0..255) to HSV ({ h: 0..360, s: 0..1, v: 0..1 }).
 */
export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const s = max === 0 ? 0 : delta / max;
  const v = max / 255;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;
  }

  return { h, s, v };
}

/**
 * Estimate block-wise local paper illumination to eliminate oblique desk-lamp shadows
 * and warm yellow paper tint while preserving dark printed characters.
 *
 * @param {Uint8ClampedArray|Uint8Array} data - RGBA pixel buffer
 * @param {number} width
 * @param {number} height
 * @param {number} [blockSize=32]
 */
export function estimateBlockBackground(data, width, height, blockSize = 32) {
  const bs = Math.max(8, Math.floor(blockSize));
  const cols = Math.max(1, Math.ceil(width / bs));
  const rows = Math.max(1, Math.ceil(height / bs));
  const rawR = new Float32Array(cols * rows);
  const rawG = new Float32Array(cols * rows);
  const rawB = new Float32Array(cols * rows);

  const stride = width * height > 300000 && bs >= 24 ? 2 : 1;

  for (let gy = 0; gy < rows; gy += 1) {
    const y0 = gy * bs;
    const y1 = Math.min(height, y0 + bs);
    for (let gx = 0; gx < cols; gx += 1) {
      const x0 = gx * bs;
      const x1 = Math.min(width, x0 + bs);

      const samples = [];
      for (let y = y0; y < y1; y += stride) {
        let rowIdx = (y * width + x0) * 4;
        for (let x = x0; x < x1; x += stride) {
          const r = data[rowIdx];
          const g = data[rowIdx + 1];
          const b = data[rowIdx + 2];
          const lum = (77 * r + 150 * g + 29 * b) >> 8;
          samples.push({ lum, r, g, b });
          rowIdx += 4 * stride;
        }
      }

      samples.sort((a, b) => a.lum - b.lum);
      const n = samples.length;
      const lo = Math.floor(n * 0.78);
      const hi = Math.max(lo + 1, Math.floor(n * 0.94));
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let i = lo; i < hi && i < n; i += 1) {
        sumR += samples[i].r;
        sumG += samples[i].g;
        sumB += samples[i].b;
        count += 1;
      }

      const cellIdx = gy * cols + gx;
      if (count > 0) {
        rawR[cellIdx] = Math.max(45, sumR / count);
        rawG[cellIdx] = Math.max(45, sumG / count);
        rawB[cellIdx] = Math.max(45, sumB / count);
      } else {
        rawR[cellIdx] = 240;
        rawG[cellIdx] = 240;
        rawB[cellIdx] = 240;
      }
    }
  }

  // Smooth the block grid with a 3x3 weighted box kernel to avoid tile seams
  const smoothR = new Float32Array(cols * rows);
  const smoothG = new Float32Array(cols * rows);
  const smoothB = new Float32Array(cols * rows);

  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let wSum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = Math.min(rows - 1, Math.max(0, gy + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = Math.min(cols - 1, Math.max(0, gx + dx));
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          const idx = ny * cols + nx;
          accR += rawR[idx] * w;
          accG += rawG[idx] * w;
          accB += rawB[idx] * w;
          wSum += w;
        }
      }
      const outIdx = gy * cols + gx;
      smoothR[outIdx] = accR / wSum;
      smoothG[outIdx] = accG / wSum;
      smoothB[outIdx] = accB / wSum;
    }
  }

  return { cols, rows, blockSize: bs, width, height, r: smoothR, g: smoothG, b: smoothB };
}

/**
 * Bilinearly sample estimated local paper background RGB at pixel (x, y).
 */
export function sampleBackgroundAt(grid, x, y) {
  const { cols, rows, blockSize, r, g, b } = grid;
  const fx = Math.max(0, Math.min(cols - 1, (x + 0.5) / blockSize - 0.5));
  const fy = Math.max(0, Math.min(rows - 1, (y + 0.5) / blockSize - 0.5));

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);

  const tx = fx - x0;
  const ty = fy - y0;

  const i00 = y0 * cols + x0;
  const i10 = y0 * cols + x1;
  const i01 = y1 * cols + x0;
  const i11 = y1 * cols + x1;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  return {
    r: r[i00] * w00 + r[i10] * w10 + r[i01] * w01 + r[i11] * w11,
    g: g[i00] * w00 + g[i10] * w10 + g[i01] * w01 + g[i11] * w11,
    b: b[i00] * w00 + b[i10] * w10 + b[i01] * w01 + b[i11] * w11,
  };
}

/**
 * Core dual-channel exam paper restoration pipeline:
 * 1. Adaptive block background bleaching (eliminates oblique lamp shadow & warm tint)
 * 2. HSV color mark erasure (red grading marks, blue/purple ballpoint answers, highlighters)
 * 3. Pencil vs printed toner contrast separation + crisp ink sharpening
 * 4. Interactive rectangular whiteout boxes + optional smart blank-space insertion
 *
 * @param {{ width: number, height: number, data: Uint8ClampedArray|Uint8Array }} image
 * @param {object} [options]
 */
export function cleanExamPaper(image, options = {}) {
  const { width, height, data } = image;
  if (!width || !height || !data || data.length < width * height * 4) {
    throw new Error("Invalid RGBA image buffer passed to cleanExamPaper");
  }

  const {
    bleachShadow = true,
    blockSize = 32,
    eraseColorMarks = true,
    colorSatThreshold = 0.2,
    pencilThreshold = 166,
    inkContrast = 0.65,
    eraseRects = [],
    spacers = [],
    spacerDashedGuide = false,
  } = options;

  const totalPixels = width * height;
  const bgGrid = bleachShadow ? estimateBlockBackground(data, width, height, blockSize) : null;

  const normLumArr = new Uint8Array(totalPixels);
  const colorMask = new Uint8Array(totalPixels);
  const out = new Uint8ClampedArray(totalPixels * 4);

  let erasedColorPixels = 0;
  let erasedPencilPixels = 0;
  let bleachedShadowPixels = 0;
  let preservedInkPixels = 0;

  // Pass 1: Illumination normalization & HSV color handwriting detection
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pIdx = y * width + x;
      const rgbaIdx = pIdx * 4;
      const r = data[rgbaIdx];
      const g = data[rgbaIdx + 1];
      const b = data[rgbaIdx + 2];
      const rawLum = (77 * r + 150 * g + 29 * b) >> 8;

      let nr = r;
      let ng = g;
      let nb = b;

      if (bgGrid) {
        const bg = sampleBackgroundAt(bgGrid, x, y);
        nr = clampByte(Math.round((r / bg.r) * 255));
        ng = clampByte(Math.round((g / bg.g) * 255));
        nb = clampByte(Math.round((b / bg.b) * 255));
      }

      const normLum = (77 * nr + 150 * ng + 29 * nb) >> 8;
      normLumArr[pIdx] = normLum;

      if (eraseColorMarks) {
        const { h, s, v } = rgbToHsv(nr, ng, nb);
        const spread = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);

        // Protect neutral deep-black printed toner/ink (all RGB channels dark & low chromatic spread)
        const isNeutralDarkPrint = nr < 92 && ng < 92 && nb < 92 && spread < 36;

        if (!isNeutralDarkPrint) {
          // Teacher red pen / pink-red marks
          const isRedMark = (h <= 34 || h >= 324) && s >= colorSatThreshold && nr >= 95 && nr - Math.min(ng, nb) >= 28;
          // Student blue / cyan / purple ballpoint or gel pen
          const isBlueMark = h >= 170 && h < 324 && s >= colorSatThreshold && nb >= 82 && nb - nr >= 24;
          // Yellow / green / orange fluorescent highlighter (bright & chromatic, not black ink)
          const isHighlighter = v >= 0.48 && s >= Math.max(0.22, colorSatThreshold) && spread >= 36 && normLum >= 105;

          if (isRedMark || isBlueMark || isHighlighter) {
            colorMask[pIdx] = 1;
          }
        }
      }

      if (rawLum < 228 && normLum >= pencilThreshold) {
        bleachedShadowPixels += 1;
      }
    }
  }

  // Pass 2: 1-pixel fringe cleanup around detected color ink strokes (anti-aliased edges)
  const expandedColorMask = new Uint8Array(colorMask);
  if (eraseColorMarks) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pIdx = y * width + x;
        if (colorMask[pIdx] === 1) continue;
        // Only clean mid/light anti-aliased fringes; never eat into dark printed characters
        if (normLumArr[pIdx] < 112) continue;

        if (
          colorMask[pIdx - 1] ||
          colorMask[pIdx + 1] ||
          colorMask[pIdx - width] ||
          colorMask[pIdx + width] ||
          colorMask[pIdx - width - 1] ||
          colorMask[pIdx - width + 1] ||
          colorMask[pIdx + width - 1] ||
          colorMask[pIdx + width + 1]
        ) {
          expandedColorMask[pIdx] = 1;
        }
      }
    }
  }

  // Pass 3: Synthesize crisp printable output
  const effectivePencilCut = Math.max(85, Math.min(248, pencilThreshold));
  const gamma = 1 + Math.max(0, Math.min(1.6, inkContrast));

  for (let pIdx = 0; pIdx < totalPixels; pIdx += 1) {
    const rgbaIdx = pIdx * 4;
    out[rgbaIdx + 3] = 255;

    if (expandedColorMask[pIdx] === 1) {
      out[rgbaIdx] = 255;
      out[rgbaIdx + 1] = 255;
      out[rgbaIdx + 2] = 255;
      erasedColorPixels += 1;
      continue;
    }

    const normLum = normLumArr[pIdx];
    if (normLum >= effectivePencilCut) {
      if (normLum < 228) {
        erasedPencilPixels += 1;
      }
      out[rgbaIdx] = 255;
      out[rgbaIdx + 1] = 255;
      out[rgbaIdx + 2] = 255;
    } else {
      // Deep black printed character / geometry diagram line: enhance sharpness & contrast
      const blackAnchor = 34;
      const t = Math.max(0, (normLum - blackAnchor) / Math.max(1, effectivePencilCut - blackAnchor));
      const inkGray = clampByte(Math.round(238 * Math.pow(t, gamma)));
      out[rgbaIdx] = inkGray;
      out[rgbaIdx + 1] = inkGray;
      out[rgbaIdx + 2] = inkGray;
      preservedInkPixels += 1;
    }
  }

  // Pass 4: Apply interactive rectangular whiteout eraser boxes
  let erasedRectPixels = 0;
  if (Array.isArray(eraseRects) && eraseRects.length > 0) {
    for (const rect of eraseRects) {
      const rx0 = Math.max(0, Math.min(width, Math.round(rect.x || 0)));
      const ry0 = Math.max(0, Math.min(height, Math.round(rect.y || 0)));
      const rx1 = Math.max(rx0, Math.min(width, Math.round((rect.x || 0) + (rect.width || 0))));
      const ry1 = Math.max(ry0, Math.min(height, Math.round((rect.y || 0) + (rect.height || 0))));
      for (let y = ry0; y < ry1; y += 1) {
        for (let x = rx0; x < rx1; x += 1) {
          const idx = (y * width + x) * 4;
          out[idx] = 255;
          out[idx + 1] = 255;
          out[idx + 2] = 255;
          out[idx + 3] = 255;
          erasedRectPixels += 1;
        }
      }
    }
  }

  let resultImage = { width, height, data: out };

  if (Array.isArray(spacers) && spacers.length > 0) {
    resultImage = insertBlankSpaces(resultImage, spacers, { dashedGuide: spacerDashedGuide });
  }

  return {
    width: resultImage.width,
    height: resultImage.height,
    data: resultImage.data,
    stats: {
      originalWidth: width,
      originalHeight: height,
      outputHeight: resultImage.height,
      erasedColorPixels,
      erasedPencilPixels,
      bleachedShadowPixels,
      preservedInkPixels,
      erasedRectPixels,
      addedBlankHeight: resultImage.height - height,
    },
  };
}

/**
 * Compute deterministic layout mapping when inserting horizontal blank answer bands
 * below fill-in-the-blank or word-problem questions.
 *
 * @param {number} originalHeight
 * @param {Array<{ afterY: number, addHeight: number, id?: string, label?: string }>} spacers
 */
export function computeSpacerLayout(originalHeight, spacers = []) {
  const normalized = (spacers || [])
    .filter((s) => s && Number(s.addHeight) > 0)
    .map((s, idx) => ({
      id: s.id || `spacer-${idx + 1}`,
      afterY: Math.max(0, Math.min(originalHeight, Math.round(Number(s.afterY) || 0))),
      addHeight: Math.max(1, Math.min(2400, Math.round(Number(s.addHeight)))),
      label: s.label || "",
    }))
    .sort((a, b) => a.afterY - b.afterY);

  let cumulativeAdded = 0;
  const bands = [];
  for (const sp of normalized) {
    const outputStartY = sp.afterY + cumulativeAdded;
    bands.push({
      ...sp,
      outputStartY,
      outputEndY: outputStartY + sp.addHeight,
    });
    cumulativeAdded += sp.addHeight;
  }

  return {
    originalHeight,
    totalAddedHeight: cumulativeAdded,
    outputHeight: originalHeight + cumulativeAdded,
    bands,
  };
}

/**
 * Expand exam sheet vertically by inserting pure-white writing space bands at specified Y positions.
 * Prevents the #1 complaint of competing apps ("no room to write answers on fill-in/word problems").
 */
export function insertBlankSpaces(image, spacers = [], options = {}) {
  const { width, height, data } = image;
  const { dashedGuide = false } = options;
  const layout = computeSpacerLayout(height, spacers);
  if (layout.totalAddedHeight === 0) {
    return { width, height, data: new Uint8ClampedArray(data), layout };
  }

  const outHeight = layout.outputHeight;
  const out = new Uint8ClampedArray(width * outHeight * 4);
  out.fill(255);

  const rowBytes = width * 4;
  let srcY = 0;
  let dstY = 0;

  for (const band of layout.bands) {
    const sliceRows = band.afterY - srcY;
    if (sliceRows > 0) {
      const byteOffsetSrc = srcY * rowBytes;
      const byteLen = sliceRows * rowBytes;
      out.set(data.subarray(byteOffsetSrc, byteOffsetSrc + byteLen), dstY * rowBytes);
      srcY += sliceRows;
      dstY += sliceRows;
    }

    if (dashedGuide && band.addHeight >= 36) {
      const lineSpacing = 36;
      const marginX = Math.min(48, Math.floor(width * 0.06));
      for (let relY = lineSpacing; relY < band.addHeight - 10; relY += lineSpacing) {
        const y = dstY + relY;
        for (let x = marginX; x < width - marginX; x += 1) {
          if ((x >> 3) % 2 === 0) {
            const idx = (y * width + x) * 4;
            out[idx] = 222;
            out[idx + 1] = 226;
            out[idx + 2] = 232;
          }
        }
      }
    }

    dstY += band.addHeight;
  }

  const tailRows = height - srcY;
  if (tailRows > 0) {
    out.set(data.subarray(srcY * rowBytes, height * rowBytes), dstY * rowBytes);
  }

  return {
    width,
    height: outHeight,
    data: out,
    layout,
  };
}

/**
 * Find the cleanest horizontal whitespace row near `targetY` so oversized exam sheets
 * never slice a printed text line or formula in half across A4 page boundaries.
 */
export function findCleanHorizontalSplitY(image, targetY, searchRadius = 80) {
  const { width, height, data } = image;
  const clampedTarget = Math.max(1, Math.min(height - 1, Math.round(targetY)));
  const yMin = Math.max(1, clampedTarget - Math.max(4, searchRadius));
  const yMax = Math.min(height - 1, clampedTarget + Math.max(4, searchRadius));

  let bestY = clampedTarget;
  let bestScore = Infinity;

  for (let y = yMin; y <= yMax; y += 1) {
    let darkPixels = 0;
    let rowIdx = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[rowIdx] < 200 || data[rowIdx + 1] < 200 || data[rowIdx + 2] < 200) {
        darkPixels += 1;
      }
      rowIdx += 4;
    }
    const distancePenalty = Math.abs(y - clampedTarget) * 0.05;
    const score = darkPixels + distancePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestY = y;
    }
  }

  return bestY;
}

/**
 * Non-overlapping A4 print compositor & paginator.
 * Guarantees zero vertical overlap between question blocks and automatic page breaks.
 *
 * @param {Array<{ id?: string, width: number, height: number, title?: string, image?: object }>} sections
 * @param {object} [options]
 */
export function paginateForA4Print(sections = [], options = {}) {
  const pageWidth = options.pageWidth || A4_SPECS.widthPx;
  const pageHeight = options.pageHeight || A4_SPECS.heightPx;
  const margin = options.margin ?? A4_SPECS.marginPx;
  const gap = options.gap ?? A4_SPECS.sectionGapPx;

  const contentWidth = pageWidth - margin * 2;
  const maxContentHeight = pageHeight - margin * 2;

  const pages = [];
  let currentPage = { pageNumber: 1, items: [], usedHeight: 0 };

  function pushCurrentPageIfNotEmpty() {
    if (currentPage.items.length > 0) {
      pages.push(currentPage);
      currentPage = { pageNumber: pages.length + 1, items: [], usedHeight: 0 };
    }
  }

  for (let i = 0; i < sections.length; i += 1) {
    const sec = sections[i];
    if (!sec || !sec.width || !sec.height) continue;

    const scale = contentWidth / sec.width;
    const scaledHeight = Math.round(sec.height * scale);

    if (scaledHeight <= maxContentHeight) {
      const neededGap = currentPage.items.length > 0 ? gap : 0;
      if (currentPage.usedHeight + neededGap + scaledHeight > maxContentHeight) {
        pushCurrentPageIfNotEmpty();
      }
      const startY = margin + (currentPage.items.length > 0 ? currentPage.usedHeight + gap : 0);
      currentPage.items.push({
        id: sec.id || `sec-${i + 1}`,
        sourceIndex: i,
        srcY: 0,
        srcHeight: sec.height,
        x: margin,
        y: startY,
        width: contentWidth,
        height: scaledHeight,
      });
      currentPage.usedHeight = startY - margin + scaledHeight;
    } else {
      // Section is taller than a single A4 page: split at clean whitespace rows with zero overlap
      pushCurrentPageIfNotEmpty();
      const maxSliceSrcHeight = Math.max(40, Math.floor(maxContentHeight / scale));
      let cursorSrcY = 0;
      let part = 1;

      while (cursorSrcY < sec.height) {
        const remainingSrc = sec.height - cursorSrcY;
        let sliceSrcHeight = remainingSrc;
        if (remainingSrc > maxSliceSrcHeight) {
          const candidateY = cursorSrcY + maxSliceSrcHeight;
          const splitY = sec.image
            ? findCleanHorizontalSplitY(sec.image, candidateY, Math.min(90, Math.floor(maxSliceSrcHeight * 0.18)))
            : candidateY;
          sliceSrcHeight = Math.max(32, splitY - cursorSrcY);
        }

        const sliceScaledHeight = Math.min(maxContentHeight, Math.round(sliceSrcHeight * scale));
        currentPage.items.push({
          id: `${sec.id || `sec-${i + 1}`}-p${part}`,
          sourceIndex: i,
          srcY: cursorSrcY,
          srcHeight: sliceSrcHeight,
          x: margin,
          y: margin,
          width: contentWidth,
          height: sliceScaledHeight,
        });
        currentPage.usedHeight = sliceScaledHeight;
        pushCurrentPageIfNotEmpty();

        cursorSrcY += sliceSrcHeight;
        part += 1;
      }
    }
  }

  if (currentPage.items.length > 0) {
    pages.push(currentPage);
  }

  return {
    pageWidth,
    pageHeight,
    margin,
    gap,
    totalPages: pages.length,
    pages,
  };
}

/**
 * Funnel gate: basic single-sheet shadow bleaching & handwriting removal is 100% free;
 * multi-sheet batch composing or exporting with custom blank-space expansion requires Pro (¥15 lifetime).
 */
export function canUseProExport({ batchCount = 1, spacerCount = 0, isPro = false } = {}) {
  if (isPro) {
    return { allowed: true, tier: "pro", reason: null };
  }
  if (batchCount > 1) {
    return {
      allowed: false,
      tier: "free",
      reason: "BATCH_COMPOSE_LOCKED",
      message: "多张错题批量组卷打印需解锁 ¥15 永久买断版（无年费）",
    };
  }
  if (spacerCount > 0) {
    return {
      allowed: false,
      tier: "free",
      reason: "SMART_SPACER_EXPORT_LOCKED",
      message: "填空/解答题加宽留白精修导出需解锁 ¥15 永久买断版",
    };
  }
  return { allowed: true, tier: "free", reason: null };
}

/**
 * Deterministic synthetic exam paper fixture for automated tests:
 * - Oblique desk-lamp warm shadow gradient (bright top-left 244, shadowed bottom-right 138)
 * - Deep black printed text bars & question lines (kept intact!)
 * - Teacher red pen cross & score strokes (erased!)
 * - Student blue ballpoint strokes (erased!)
 * - Yellow highlighter band (erased, while black print inside highlighter stays intact!)
 * - Light-gray HB pencil writing (erased!)
 */
export function createSyntheticExamFixture(width = 320, height = 240) {
  const data = new Uint8ClampedArray(width * height * 4);

  const bgAt = (x, y) => {
    const t = (x / Math.max(1, width - 1)) * 0.6 + (y / Math.max(1, height - 1)) * 0.4;
    const base = Math.round(246 - t * 108); // 246 -> 138 oblique shadow
    return {
      r: clampByte(base + 4),
      g: clampByte(base),
      b: clampByte(base - 10),
    };
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const bg = bgAt(x, y);
      data[idx] = bg.r;
      data[idx + 1] = bg.g;
      data[idx + 2] = bg.b;
      data[idx + 3] = 255;
    }
  }

  const paintPixel = (x, y, fn) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    const bg = bgAt(x, y);
    const c = fn(bg);
    data[idx] = clampByte(c.r);
    data[idx + 1] = clampByte(c.g);
    data[idx + 2] = clampByte(c.b);
    data[idx + 3] = 255;
  };

  // 1. Yellow highlighter band across y=44..56, x=30..180 (applied before black print / over paper)
  const highlighterCoords = [];
  for (let y = 44; y <= 56; y += 1) {
    for (let x = 30; x <= 180; x += 1) {
      paintPixel(x, y, (bg) => ({
        r: Math.round(bg.r * 0.99),
        g: Math.round(bg.g * 0.96),
        b: Math.round(bg.b * 0.34),
      }));
      if (x > 140) highlighterCoords.push([x, y]);
    }
  }

  // 2. Printed black question lines (both in bright zone and deep bottom-right shadow zone!)
  const printedCoords = [];
  // Top printed line (partially inside yellow highlighter x=40..120, y=48..51)
  for (let y = 48; y <= 51; y += 1) {
    for (let x = 40; x <= 120; x += 1) {
      paintPixel(x, y, (bg) => ({
        r: Math.round(bg.r * 0.14),
        g: Math.round(bg.g * 0.14),
        b: Math.round(bg.b * 0.14),
      }));
      printedCoords.push([x, y]);
    }
  }
  // Bottom-right shadowed printed question stem (x=170..280, y=175..178)
  for (let y = 175; y <= 178; y += 1) {
    for (let x = 170; x <= 280; x += 1) {
      paintPixel(x, y, (bg) => ({
        r: Math.round(bg.r * 0.16),
        g: Math.round(bg.g * 0.16),
        b: Math.round(bg.b * 0.16),
      }));
      printedCoords.push([x, y]);
    }
  }

  // 3. Teacher red pen X mark (center around x=230, y=95 in mid-shadow)
  const redPenCoords = [];
  for (let i = -18; i <= 18; i += 1) {
    for (let w = -1; w <= 1; w += 1) {
      const p1 = [230 + i, 95 + i + w];
      const p2 = [230 + i, 95 - i + w];
      for (const [rx, ry] of [p1, p2]) {
        paintPixel(rx, ry, (bg) => ({
          r: Math.round(bg.r * 0.88),
          g: Math.round(bg.g * 0.18),
          b: Math.round(bg.b * 0.18),
        }));
        redPenCoords.push([rx, ry]);
      }
    }
  }

  // 4. Student blue ballpoint answer strokes (x=70..155, y=112..115)
  const bluePenCoords = [];
  for (let y = 112; y <= 115; y += 1) {
    for (let x = 70; x <= 155; x += 1) {
      paintPixel(x, y, (bg) => ({
        r: Math.round(bg.r * 0.18),
        g: Math.round(bg.g * 0.34),
        b: Math.round(bg.b * 0.88),
      }));
      bluePenCoords.push([x, y]);
    }
  }

  // 5. Light-gray HB pencil rough calculation (x=60..140, y=195..197)
  const pencilCoords = [];
  for (let y = 195; y <= 197; y += 1) {
    for (let x = 60; x <= 140; x += 1) {
      paintPixel(x, y, (bg) => ({
        r: Math.round(bg.r * 0.74),
        g: Math.round(bg.g * 0.74),
        b: Math.round(bg.b * 0.74),
      }));
      pencilCoords.push([x, y]);
    }
  }

  return {
    width,
    height,
    data,
    regions: {
      printedCoords,
      redPenCoords,
      bluePenCoords,
      highlighterCoords,
      pencilCoords,
      deepShadowPaperCoord: [width - 14, height - 14],
    },
  };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToBytes(b64url) {
  const normalized = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(normalized + "=".repeat(padLen));
}

/**
 * Verify an OPC1.<base64url_payload>.<base64url_sig> Ed25519 offline license token.
 * Signed message is `OPC1.${payloadB64}` in UTF-8.
 */
export async function verifyLicenseToken(token, options = {}) {
  const {
    expectedProduct = PRODUCT_SLUG,
    publicSpkiBase64 = PUBLIC_SPKI_BASE64,
    nowSec = Math.floor(Date.now() / 1000),
  } = options;

  if (typeof token !== "string" || !token.trim()) {
    return { valid: false, reason: "EMPTY_TOKEN", message: "请输入激活码" };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "OPC1" || !parts[1] || !parts[2]) {
    return { valid: false, reason: "BAD_FORMAT", message: "激活码格式应为 OPC1.<payload>.<signature>" };
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return { valid: false, reason: "NO_WEBCRYPTO", message: "当前运行环境不支持 WebCrypto Ed25519" };
  }

  try {
    const [, payloadB64, sigB64] = parts;
    const spkiBytes = base64ToBytes(publicSpkiBase64);
    const sigBytes = base64UrlToBytes(sigB64);
    const signedBytes = new TextEncoder().encode(`OPC1.${payloadB64}`);

    const key = await subtle.importKey("spki", spkiBytes, { name: "Ed25519" }, false, ["verify"]);
    const verified = await subtle.verify("Ed25519", key, sigBytes, signedBytes);
    if (!verified) {
      return { valid: false, reason: "BAD_SIGNATURE", message: "激活码签名校验失败" };
    }

    const payloadJson = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson);

    if (expectedProduct && payload.p !== expectedProduct && payload.p !== "*") {
      return {
        valid: false,
        reason: "PRODUCT_MISMATCH",
        message: `该激活码归属产品 "${payload.p}"，不适用于 "${expectedProduct}"`,
        payload,
      };
    }

    if (payload.exp && Number(payload.exp) > 0 && nowSec > Number(payload.exp)) {
      return {
        valid: false,
        reason: "EXPIRED",
        message: "该激活码已过期",
        payload,
      };
    }

    return { valid: true, payload };
  } catch (err) {
    return {
      valid: false,
      reason: "VERIFY_ERROR",
      message: err?.message || "激活码解析异常",
    };
  }
}
