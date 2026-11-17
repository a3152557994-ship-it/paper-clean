import {
  PRODUCT_SLUG,
  PRICE_CNY,
  ORDER_EMAIL_QQ,
  ORDER_EMAIL_GMAIL,
  cleanExamPaper,
  computeSpacerLayout,
  paginateForA4Print,
  canUseProExport,
  verifyLicenseToken,
} from "./paper-engine.js";

const STORAGE_KEY = "opc_license_paper_clean_v1";

const state = {
  mode: "split", // 'split' | 'spacer' | 'eraser'
  splitRatio: 0.48,
  isPro: false,
  licensePayload: null,
  licenseToken: "",
  params: {
    bleachShadow: true,
    eraseColorMarks: true,
    colorSatThreshold: 0.2,
    pencilThreshold: 166,
    inkContrast: 0.65,
    spacerAddHeight: 140,
    spacerDashedGuide: true,
  },
  activeIndex: 0,
  sheets: [], // Array of { id, name, rawImageData, cleanedResult, spacers: [], eraseRects: [] }
};

const els = {
  fileUpload: document.getElementById("file-upload"),
  proBadge: document.getElementById("pro-status-badge"),
  modePills: Array.from(document.querySelectorAll(".mode-pill")),
  modeHintText: document.getElementById("mode-hint-text"),
  btnAutoSweep: document.getElementById("btn-auto-sweep"),
  btnDemoSpacers: document.getElementById("btn-demo-spacers"),
  btnQuickSpacers: document.getElementById("btn-quick-spacers"),
  btnClearEdits: document.getElementById("btn-clear-edits"),
  btnResetDemo: document.getElementById("btn-reset-demo"),
  btnDownloadPng: document.getElementById("btn-download-png"),
  btnPrintA4: document.getElementById("btn-print-a4"),
  btnDefaultParams: document.getElementById("btn-default-params"),

  paperFrame: document.getElementById("paper-frame"),
  canvasBefore: document.getElementById("canvas-before"),
  canvasAfter: document.getElementById("canvas-after"),
  canvasOverlay: document.getElementById("canvas-overlay"),
  beforeLayer: document.getElementById("before-layer"),
  splitDivider: document.getElementById("split-divider"),
  badgeBefore: document.getElementById("badge-before"),

  statShadow: document.getElementById("stat-shadow"),
  statColor: document.getElementById("stat-color"),
  statPencil: document.getElementById("stat-pencil"),
  statSpacer: document.getElementById("stat-spacer"),

  chkBleach: document.getElementById("chk-bleach"),
  chkColor: document.getElementById("chk-color"),
  rngColorSat: document.getElementById("rng-color-sat"),
  lblColorSat: document.getElementById("lbl-color-sat"),
  rngPencil: document.getElementById("rng-pencil"),
  lblPencil: document.getElementById("lbl-pencil"),
  rngContrast: document.getElementById("rng-contrast"),
  lblContrast: document.getElementById("lbl-contrast"),
  rngSpacerH: document.getElementById("rng-spacer-h"),
  lblSpacerH: document.getElementById("lbl-spacer-h"),
  chkDashedGuide: document.getElementById("chk-dashed-guide"),

  spacerList: document.getElementById("spacer-list"),
  batchList: document.getElementById("batch-list"),
  lblA4Pages: document.getElementById("lbl-a4-pages"),

  inputLicense: document.getElementById("input-license"),
  btnVerifyLicense: document.getElementById("btn-verify-license"),
  btnClearLicense: document.getElementById("btn-clear-license"),
  licenseMsg: document.getElementById("license-msg"),

  btnOpenOrder: document.getElementById("btn-open-order"),
  orderModal: document.getElementById("order-modal"),
  btnCloseModal: document.getElementById("btn-close-modal"),
  orderBriefBox: document.getElementById("order-brief-box"),
  mailtoQQ: document.getElementById("mailto-qq"),
  mailtoGmail: document.getElementById("mailto-gmail"),
  btnCopyOrder: document.getElementById("btn-copy-order"),
  printMount: document.getElementById("print-mount"),
};

/**
 * Render a vivid, realistic photographed exam sheet with angled warm lamp shadow,
 * crisp dark printed stems/geometry diagram, yellow highlighter, blue ballpoint answers,
 * gray HB pencil scratchwork, and bold red teacher grading marks.
 */
function buildRealisticDemoExamImageData() {
  const w = 900;
  const h = 1220;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });

  // 1. Pure white virtual paper first, draw printed & handwritten layers, then multiply uneven lamp illumination
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Yellow highlighter under printed text on Q1
  ctx.save();
  ctx.fillStyle = "rgba(253, 238, 76, 0.78)";
  ctx.fillRect(298, 250, 268, 28);
  ctx.restore();

  // Printed Header & Score Table (Neutral deep toner #1c1e21)
  ctx.fillStyle = "#1b1d20";
  ctx.strokeStyle = "#1b1d20";
  ctx.textAlign = "center";
  ctx.font = "bold 30px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
  ctx.fillText("2026 学年第一学期期中诊断卷 · 八年级数学", w / 2, 74);

  ctx.font = "16px 'PingFang SC', sans-serif";
  ctx.fillText("（满分：100 分   考试时间：90 分钟   闭卷）", w / 2, 108);

  // Score box top right
  ctx.lineWidth = 2;
  ctx.strokeRect(640, 126, 206, 68);
  ctx.beginPath();
  ctx.moveTo(640, 158);
  ctx.lineTo(846, 158);
  ctx.moveTo(708, 126);
  ctx.lineTo(708, 194);
  ctx.moveTo(776, 126);
  ctx.lineTo(776, 194);
  ctx.stroke();

  ctx.font = "bold 15px 'PingFang SC', sans-serif";
  ctx.fillText("题号", 674, 148);
  ctx.fillText("一/二", 742, 148);
  ctx.fillText("总分", 811, 148);
  ctx.fillText("得分", 674, 182);

  // Student info line
  ctx.textAlign = "left";
  ctx.font = "17px 'PingFang SC', sans-serif";
  ctx.fillText("班级：__________   姓名：__________   学号：__________", 56, 174);

  // Divider line
  ctx.beginPath();
  ctx.moveTo(54, 212);
  ctx.lineTo(846, 212);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Question 1 (Multiple choice)
  ctx.font = "bold 20px 'PingFang SC', sans-serif";
  ctx.fillText("一、核心概念与填空诊断（每题 8 分，共 24 分）", 56, 244);

  ctx.font = "19px 'PingFang SC', sans-serif";
  ctx.fillText("1. 已知一次函数 y = kx + b 的图象经过第一、二、四象限，则（        ）", 56, 274);
  ctx.fillText("A. k > 0, b > 0     B. k > 0, b < 0     C. k < 0, b > 0     D. k < 0, b < 0", 82, 312);

  // Question 2 (Fill in the blank — narrow space!)
  ctx.fillText("2. 【填空题】分解因式：2x² - 18 = ______________________；", 56, 386);
  ctx.fillText("   若分式 (x - 3) / (x + 3) 的值为 0，则实数 x = ____________。", 56, 426);

  // Question 3 (Word problem + Geometry diagram)
  ctx.font = "bold 20px 'PingFang SC', sans-serif";
  ctx.fillText("二、综合解答题（本题满分 16 分，需写出完整演算步骤）", 56, 512);

  ctx.font = "19px 'PingFang SC', sans-serif";
  ctx.fillText("3. 如图，在平面直角坐标系 xOy 中，直线 l₁: y = -x + 4 与 x 轴、y 轴", 56, 552);
  ctx.fillText("   分别交于点 A、B，直线 l₂: y = 2x - 2 与直线 l₁ 交于点 P。", 56, 588);
  ctx.fillText("   (1) 求交点 P 的坐标；   (2) 求 △AOP 的面积。", 56, 624);

  // Printed coordinate geometry diagram on the right (x=600..835, y=640..845)
  ctx.save();
  ctx.strokeStyle = "#1c1e21";
  ctx.fillStyle = "#1c1e21";
  ctx.lineWidth = 2.2;
  // Axes
  ctx.beginPath();
  ctx.moveTo(615, 795);
  ctx.lineTo(830, 795); // x-axis
  ctx.moveTo(665, 835);
  ctx.lineTo(665, 645); // y-axis
  ctx.stroke();
  // Arrowheads
  ctx.beginPath();
  ctx.moveTo(830, 795);
  ctx.lineTo(820, 790);
  ctx.lineTo(820, 800);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(665, 645);
  ctx.lineTo(660, 655);
  ctx.lineTo(670, 655);
  ctx.closePath();
  ctx.fill();
  // Line l1: y = -x + 4 -> B(0,4) at (665, 675), A(4,0) at (785, 795)
  ctx.beginPath();
  ctx.moveTo(645, 655);
  ctx.lineTo(805, 815);
  ctx.stroke();
  // Line l2: y = 2x - 2 -> (0,-2) at (665,855 clipped), (1,0) at (695,795), P(2,2) at (725,735)
  ctx.beginPath();
  ctx.moveTo(680, 825);
  ctx.lineTo(765, 655);
  ctx.stroke();
  ctx.font = "bold 15px Georgia, serif";
  ctx.fillText("y", 646, 656);
  ctx.fillText("x", 822, 816);
  ctx.fillText("O", 646, 814);
  ctx.fillText("B", 646, 682);
  ctx.fillText("A", 786, 788);
  ctx.fillText("P", 734, 736);
  ctx.fillText("l₁", 796, 830);
  ctx.fillText("l₂", 768, 666);
  ctx.restore();

  // Question 4 at bottom
  ctx.font = "19px 'PingFang SC', sans-serif";
  ctx.fillText("4. 【拓展压轴】若点 M 在 x 轴上运动，使 △AMP 为等腰三角形，直接写出", 56, 965);
  ctx.fillText("   所有满足条件的点 M 的横坐标：____________________________________。", 56, 1004);

  // --- Student Handwriting Layer: Blue Ballpoint Pen ---
  ctx.save();
  ctx.fillStyle = "#1d4ed8";
  ctx.strokeStyle = "#1d4ed8";
  ctx.font = "italic bold 22px 'Kaiti SC', 'STKaiti', 'KaiTi', cursive, sans-serif";
  ctx.fillText("林小宇", 252, 172);
  ctx.fillText("八(3)", 118, 172);
  ctx.fillText("19", 418, 172);

  // Q1 student choice
  ctx.font = "bold 26px 'Kaiti SC', 'STKaiti', cursive, sans-serif";
  ctx.fillText("C", 696, 273);

  // Q2 student flawed answers
  ctx.font = "italic 24px 'Kaiti SC', 'STKaiti', cursive, sans-serif";
  ctx.fillText("2(x² - 9)", 365, 383);
  ctx.fillText("±3", 472, 423);

  // Q3 student multi-line blue ballpoint work
  ctx.font = "italic 23px 'Kaiti SC', 'STKaiti', cursive, sans-serif";
  ctx.fillText("解：(1) 联立 y = -x + 4 与 y = 2x - 2", 76, 678);
  ctx.fillText("    移项得 -x - 2x = -2 - 4  =>  -3x = -3（算错！）", 76, 718);
  ctx.fillText("    ∴ x = 1，代入得 y = 3，故 P(1, 3)", 76, 758);
  ctx.fillText("(2) 令 y = 0，得 A(4, 0)，OA = 4", 76, 798);
  ctx.fillText("    ∴ S△AOP = 1/2 × 4 × 3 = 6", 76, 838);

  // Q4 student blue answer
  ctx.fillText("4 - 2√2  或  2", 425, 1000);
  ctx.restore();

  // --- Student Light-Gray HB Pencil Margin Scratchwork ---
  ctx.save();
  ctx.fillStyle = "#9ca3af";
  ctx.strokeStyle = "#9ca3af";
  ctx.font = "italic 19px 'Kaiti SC', sans-serif";
  ctx.fillText("铅笔草稿：2x-2 = -x+4 => 3x=6? 6÷2=3...", 82, 898);
  ctx.fillText("等腰分类：PA=PM, AP=AM, MP=MA 漏了两种...", 82, 1068);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(80, 906);
  ctx.lineTo(395, 906);
  ctx.stroke();
  ctx.restore();

  // --- Teacher Red Pen Grading Marks ---
  ctx.save();
  ctx.strokeStyle = "#dc2626";
  ctx.fillStyle = "#dc2626";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Score 72 with double red underline
  ctx.font = "bold italic 38px Georgia, serif";
  ctx.fillText("72", 786, 186);
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("-12", 720, 184);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(782, 191);
  ctx.lineTo(838, 188);
  ctx.moveTo(784, 198);
  ctx.lineTo(840, 195);
  ctx.stroke();

  // Red check mark on Q1
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(742, 265);
  ctx.lineTo(756, 280);
  ctx.lineTo(786, 244);
  ctx.stroke();

  // Big Red X on Q2 + teacher comment
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(548, 355);
  ctx.lineTo(586, 395);
  ctx.moveTo(586, 355);
  ctx.lineTo(548, 395);
  ctx.moveTo(555, 404);
  ctx.lineTo(592, 440);
  ctx.moveTo(592, 404);
  ctx.lineTo(555, 440);
  ctx.stroke();

  ctx.font = "bold 20px 'PingFang SC', sans-serif";
  ctx.fillText("分解不彻底！x+3≠0 舍去 -3！(-8分)", 530, 466);

  // Red wavy underline & Big X on Q3
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(465, 695);
  ctx.lineTo(518, 748);
  ctx.moveTo(518, 695);
  ctx.lineTo(465, 748);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 235; x <= 445; x += 14) {
    ctx.lineTo(x, 726 + ((x / 14) % 2 === 0 ? -4 : 4));
  }
  ctx.stroke();
  ctx.fillText("移项算错！应为 3x=6, x=2！(-10分)", 240, 872);

  // Half-right mark on Q4
  ctx.beginPath();
  ctx.moveTo(605, 982);
  ctx.lineTo(622, 1004);
  ctx.lineTo(654, 966);
  ctx.moveTo(626, 976);
  ctx.lineTo(652, 1002);
  ctx.stroke();
  ctx.fillText("漏解 2 个！(-6分)", 666, 1002);
  ctx.restore();

  // 2. Apply realistic oblique warm desk-lamp illumination & corner shadow at pixel level
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      // Top-left desk lamp bright warm cast -> bottom-right oblique phone shadow
      const distShadow = nx * 0.58 + ny * 0.52;
      const radialShadow = Math.max(0, Math.hypot(nx - 0.18, ny - 0.15) - 0.25);
      const illum = Math.max(0.56, 0.985 - distShadow * 0.34 - radialShadow * 0.12);
      // Slight deterministic paper grain
      const grain = (((x * 73856093) ^ (y * 19349663)) & 7) - 3;

      const i = (y * w + x) * 4;
      d[i] = Math.min(255, Math.max(0, Math.round(d[i] * illum * 1.01 + grain)));
      d[i + 1] = Math.min(255, Math.max(0, Math.round(d[i + 1] * illum * 0.985 + grain)));
      d[i + 2] = Math.min(255, Math.max(0, Math.round(d[i + 2] * illum * 0.93 + grain)));
    }
  }

  return imgData;
}

function getActiveSheet() {
  return state.sheets[state.activeIndex] || null;
}

function formatCount(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

/**
 * Expand raw `before` image vertically at exact spacer bands so Before/After split slider
 * keeps every printed line aligned pixel-for-pixel even when blank answer zones are inserted!
 */
function buildAlignedBeforeImageData(rawImageData, spacers) {
  const { width, height, data } = rawImageData;
  const layout = computeSpacerLayout(height, spacers);
  if (layout.totalAddedHeight === 0) {
    return rawImageData;
  }
  const out = new Uint8ClampedArray(width * layout.outputHeight * 4);
  const rowBytes = width * 4;
  let srcY = 0;
  let dstY = 0;

  for (const band of layout.bands) {
    const rows = band.afterY - srcY;
    if (rows > 0) {
      out.set(data.subarray(srcY * rowBytes, (srcY + rows) * rowBytes), dstY * rowBytes);
      srcY += rows;
      dstY += rows;
    }
    // Paint subtle hatched gray indicator on the "Before" side showing this height did not exist in the cramped original paper
    for (let ry = 0; ry < band.addHeight; ry += 1) {
      const y = dstY + ry;
      for (let x = 0; x < width; x += 1) {
        const stripe = ((x + y) >> 4) % 2 === 0 ? 232 : 222;
        const idx = (y * width + x) * 4;
        out[idx] = stripe;
        out[idx + 1] = stripe + 2;
        out[idx + 2] = stripe + 6;
        out[idx + 3] = 255;
      }
    }
    dstY += band.addHeight;
  }

  const tail = height - srcY;
  if (tail > 0) {
    out.set(data.subarray(srcY * rowBytes, height * rowBytes), dstY * rowBytes);
  }
  return new ImageData(out, width, layout.outputHeight);
}

function processSheet(sheet) {
  const res = cleanExamPaper(sheet.rawImageData, {
    bleachShadow: state.params.bleachShadow,
    eraseColorMarks: state.params.eraseColorMarks,
    colorSatThreshold: state.params.colorSatThreshold,
    pencilThreshold: state.params.pencilThreshold,
    inkContrast: state.params.inkContrast,
    eraseRects: sheet.eraseRects,
    spacers: sheet.spacers,
    spacerDashedGuide: state.params.spacerDashedGuide,
  });
  sheet.cleanedResult = res;
  return res;
}

function renderActiveSheet() {
  const sheet = getActiveSheet();
  if (!sheet) return;

  const res = processSheet(sheet);
  const { width, height, data, stats } = res;

  // Render After Canvas
  els.canvasAfter.width = width;
  els.canvasAfter.height = height;
  const ctxAfter = els.canvasAfter.getContext("2d");
  ctxAfter.putImageData(new ImageData(data, width, height), 0, 0);

  // Render Aligned Before Canvas
  const alignedBefore = buildAlignedBeforeImageData(sheet.rawImageData, sheet.spacers);
  els.canvasBefore.width = alignedBefore.width;
  els.canvasBefore.height = alignedBefore.height;
  const ctxBefore = els.canvasBefore.getContext("2d");
  ctxBefore.putImageData(alignedBefore, 0, 0);

  // Sync Overlay Canvas dimensions
  els.canvasOverlay.width = width;
  els.canvasOverlay.height = height;
  drawInteractionOverlay();

  // Sync Split Slider geometry
  syncSplitPosition();

  // Update Metrics
  els.statShadow.textContent = formatCount(stats.bleachedShadowPixels);
  els.statColor.textContent = formatCount(stats.erasedColorPixels);
  els.statPencil.textContent = formatCount(stats.erasedPencilPixels);
  els.statSpacer.textContent = `+${stats.addedBlankHeight} px`;

  renderSpacerChips(sheet);
  renderBatchList();
}

function syncSplitPosition() {
  const isSplit = state.mode === "split";
  els.beforeLayer.classList.toggle("hidden", !isSplit);
  els.splitDivider.classList.toggle("hidden", !isSplit);
  els.badgeBefore.classList.toggle("hidden", !isSplit);
  els.canvasOverlay.classList.toggle("hidden", isSplit);

  if (isSplit) {
    const pct = `${(state.splitRatio * 100).toFixed(2)}%`;
    els.beforeLayer.style.width = pct;
    els.splitDivider.style.left = pct;
    const frameW = els.paperFrame.clientWidth || 1;
    els.canvasBefore.style.width = `${frameW}px`;
  }
}

function drawInteractionOverlay(hoverY = null, dragRect = null) {
  const sheet = getActiveSheet();
  const ctx = els.canvasOverlay.getContext("2d");
  const w = els.canvasOverlay.width;
  const h = els.canvasOverlay.height;
  ctx.clearRect(0, 0, w, h);
  if (!sheet) return;

  // Highlight inserted blank-space bands
  const layout = computeSpacerLayout(sheet.rawImageData.height, sheet.spacers);
  for (let i = 0; i < layout.bands.length; i += 1) {
    const b = layout.bands[i];
    ctx.save();
    ctx.fillStyle = "rgba(37, 99, 235, 0.06)";
    ctx.fillRect(0, b.outputStartY, w, b.addHeight);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(4, b.outputStartY + 1, w - 8, b.addHeight - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 16px 'PingFang SC', sans-serif";
    ctx.fillText(`↕ 解题留白区 #${i + 1} (+${b.addHeight}px)`, 18, b.outputStartY + 26);
    ctx.restore();
  }

  if (state.mode === "spacer" && hoverY !== null) {
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(0, hoverY);
    ctx.lineTo(w, hoverY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(w - 250, Math.max(6, hoverY - 32), 236, 26);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px 'PingFang SC', sans-serif";
    ctx.fillText(`点击在此插入 +${state.params.spacerAddHeight}px 留白`, w - 240, Math.max(24, hoverY - 14));
    ctx.restore();
  }

  if (state.mode === "eraser" && dragRect) {
    ctx.save();
    ctx.fillStyle = "rgba(239, 68, 68, 0.14)";
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.fillRect(dragRect.x, dragRect.y, dragRect.width, dragRect.height);
    ctx.strokeRect(dragRect.x, dragRect.y, dragRect.width, dragRect.height);
    ctx.restore();
  }
}

function mapOutputYToOriginalY(sheet, outY) {
  const layout = computeSpacerLayout(sheet.rawImageData.height, sheet.spacers);
  let delta = 0;
  for (const b of layout.bands) {
    if (outY >= b.outputEndY) {
      delta += b.addHeight;
    } else if (outY >= b.outputStartY) {
      return b.afterY;
    } else {
      break;
    }
  }
  return Math.max(0, Math.min(sheet.rawImageData.height, Math.round(outY - delta)));
}

function renderSpacerChips(sheet) {
  els.spacerList.innerHTML = "";
  if (!sheet.spacers.length) return;
  sheet.spacers.forEach((sp, idx) => {
    const div = document.createElement("div");
    div.className = "spacer-chip";
    div.innerHTML = `<span>留白 #${idx + 1}（Y=${sp.afterY}px · <strong>+${sp.addHeight}px</strong>）</span>`;
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn-outline btn-sm";
    btnDel.textContent = "移除";
    btnDel.addEventListener("click", () => {
      sheet.spacers.splice(idx, 1);
      renderActiveSheet();
    });
    div.appendChild(btnDel);
    els.spacerList.appendChild(div);
  });
}

function renderBatchList() {
  els.batchList.innerHTML = "";
  const sections = state.sheets.map((s, idx) => {
    const res = s.cleanedResult || processSheet(s);
    return {
      id: s.id,
      width: res.width,
      height: res.height,
      title: s.name || `试卷 ${idx + 1}`,
      image: res,
    };
  });
  const paginated = paginateForA4Print(sections);
  els.lblA4Pages.textContent = `共 ${state.sheets.length} 张原图 → 排版 ${paginated.totalPages} 页 A4`;

  state.sheets.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = `batch-item${idx === state.activeIndex ? " active" : ""}`;
    const extraInfo = s.spacers.length ? ` · +${s.spacers.length}留白` : "";
    row.innerHTML = `<span><strong>#${idx + 1}</strong> ${s.name}${extraInfo}</span>`;

    const rightBox = document.createElement("div");
    rightBox.style.display = "flex";
    rightBox.style.gap = "4px";
    if (state.sheets.length > 1) {
      const btnRm = document.createElement("button");
      btnRm.type = "button";
      btnRm.className = "btn btn-outline btn-sm";
      btnRm.textContent = "删";
      btnRm.addEventListener("click", (e) => {
        e.stopPropagation();
        state.sheets.splice(idx, 1);
        if (state.activeIndex >= state.sheets.length) {
          state.activeIndex = Math.max(0, state.sheets.length - 1);
        }
        renderActiveSheet();
      });
      rightBox.appendChild(btnRm);
    }
    row.appendChild(rightBox);
    row.addEventListener("click", () => {
      state.activeIndex = idx;
      renderActiveSheet();
    });
    els.batchList.appendChild(row);
  });
}

function setMode(mode) {
  state.mode = mode;
  els.modePills.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  if (mode === "split") {
    els.modeHintText.textContent =
      "👉 左右拖动蓝色滑块对比净卷前后效果：左侧为斜拍阴影+红蓝笔原图，右侧为实时擦除还原的纯白打印底。";
    els.btnAutoSweep.classList.remove("hidden");
  } else if (mode === "spacer") {
    els.modeHintText.textContent =
      "➕ 在填空题或解答题下方任意位置点击，即可插入纯白解题书写空间（彻底解决打印后没地方写字痛点）！";
    els.btnAutoSweep.classList.add("hidden");
  } else {
    els.modeHintText.textContent =
      "⬜ 按住鼠标或手指在卷面上拖拽矩形框，可将顽固深黑水笔涂鸦一键抹成纯白。";
    els.btnAutoSweep.classList.add("hidden");
  }
  syncSplitPosition();
  drawInteractionOverlay();
}

function applyQuickDemoSpacers() {
  const sheet = getActiveSheet();
  if (!sheet) return;
  const h = sheet.rawImageData.height;
  sheet.spacers = [
    { id: `sp-${Date.now()}-1`, afterY: Math.round(h * 0.365), addHeight: 130, label: "填空题留白" },
    { id: `sp-${Date.now()}-2`, afterY: Math.round(h * 0.715), addHeight: 180, label: "解答题留白" },
  ];
  setMode("split");
  renderActiveSheet();
}

function checkExportGate() {
  const totalSpacers = state.sheets.reduce((acc, s) => acc + s.spacers.length, 0);
  const gate = canUseProExport({
    batchCount: state.sheets.length,
    spacerCount: totalSpacers,
    isPro: state.isPro,
  });
  if (!gate.allowed) {
    openOrderModal(gate.message);
    return false;
  }
  return true;
}

function downloadActivePng() {
  if (!checkExportGate()) return;
  const sheet = getActiveSheet();
  if (!sheet) return;
  renderActiveSheet();
  els.canvasAfter.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.name.replace(/\.[^.]+$/, "")}-净卷空白卷.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}

function triggerZeroOverlapPrint() {
  if (!checkExportGate()) return;

  const sections = state.sheets.map((s) => {
    const res = processSheet(s);
    const c = document.createElement("canvas");
    c.width = res.width;
    c.height = res.height;
    c.getContext("2d").putImageData(new ImageData(res.data, res.width, res.height), 0, 0);
    return {
      id: s.id,
      width: res.width,
      height: res.height,
      image: res,
      canvas: c,
    };
  });

  const plan = paginateForA4Print(sections);
  els.printMount.innerHTML = "";

  for (const page of plan.pages) {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = plan.pageWidth;
    pageCanvas.height = plan.pageHeight;
    const pCtx = pageCanvas.getContext("2d");
    pCtx.fillStyle = "#ffffff";
    pCtx.fillRect(0, 0, plan.pageWidth, plan.pageHeight);

    for (const item of page.items) {
      const srcSec = sections[item.sourceIndex];
      pCtx.drawImage(
        srcSec.canvas,
        0,
        item.srcY,
        srcSec.width,
        item.srcHeight,
        item.x,
        item.y,
        item.width,
        item.height
      );
    }

    const wrapper = document.createElement("div");
    wrapper.className = "a4-print-page";
    const img = document.createElement("img");
    img.src = pageCanvas.toDataURL("image/png");
    img.alt = `A4 Print Page ${page.pageNumber}`;
    wrapper.appendChild(img);
    els.printMount.appendChild(wrapper);
  }

  setTimeout(() => {
    window.print();
  }, 120);
}

async function handleUploadedFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;

  // Replace built-in demo sheet if it's the only item and untouched
  if (state.sheets.length === 1 && state.sheets[0].isDemo) {
    state.sheets = [];
  }

  for (const file of files) {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1650;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(64, Math.round(bitmap.width * scale));
    const h = Math.max(64, Math.round(bitmap.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const rawImageData = ctx.getImageData(0, 0, w, h);

    state.sheets.push({
      id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name || `错题卷-${state.sheets.length + 1}`,
      isDemo: false,
      rawImageData,
      cleanedResult: null,
      spacers: [],
      eraseRects: [],
    });
  }

  state.activeIndex = state.sheets.length - 1;
  renderActiveSheet();
}

function openOrderModal(reasonNote = "") {
  const totalSpacers = state.sheets.reduce((acc, s) => acc + s.spacers.length, 0);
  const brief = [
    `【下单产品】净卷宝 PaperClean Pro 永久买断版 (slug: ${PRODUCT_SLUG})`,
    `【买断金额】¥${PRICE_CNY} 一次性买断（终身可用，无年费）`,
    `【当前待导出】共 ${state.sheets.length} 张试卷 · 已设 ${totalSpacers} 处解题加宽留白`,
    reasonNote ? `【触发功能】${reasonNote}` : null,
    `【接收激活码邮箱】（请直接用您的常用邮箱发送本邮件，秒回 OPC1. 永久激活码）`,
  ]
    .filter(Boolean)
    .join("\n");

  els.orderBriefBox.textContent = brief;
  const subject = encodeURIComponent(`购买净卷宝 PaperClean 永久买断激活码 (¥${PRICE_CNY})`);
  const body = encodeURIComponent(brief);
  els.mailtoQQ.href = `mailto:${ORDER_EMAIL_QQ}?subject=${subject}&body=${body}`;
  els.mailtoGmail.href = `mailto:${ORDER_EMAIL_GMAIL}?subject=${subject}&body=${body}`;
  els.orderModal.classList.remove("hidden");
}

function updateLicenseUI() {
  if (state.isPro) {
    els.proBadge.textContent = "Pro 永久买断已激活";
    els.btnClearLicense.classList.remove("hidden");
    els.licenseMsg.className = "status-msg ok";
    els.licenseMsg.textContent = `✅ 已通过本地 Ed25519 公钥验签激活 Pro 永久买断版（授权账号：${state.licensePayload?.e || "VIP"}），填空留白导出与多卷组卷打印已全部解锁！`;
    els.licenseMsg.classList.remove("hidden");
  } else {
    els.proBadge.textContent = "零广告 · 本地离线";
    els.btnClearLicense.classList.add("hidden");
  }
}

async function verifyAndSaveToken(token, silent = false) {
  const res = await verifyLicenseToken(token);
  if (res.valid) {
    state.isPro = true;
    state.licensePayload = res.payload;
    state.licenseToken = token.trim();
    localStorage.setItem(STORAGE_KEY, state.licenseToken);
    els.inputLicense.value = state.licenseToken;
    updateLicenseUI();
  } else if (!silent) {
    els.licenseMsg.className = "status-msg err";
    els.licenseMsg.textContent = `❌ 激活未通过：${res.message || res.reason}`;
    els.licenseMsg.classList.remove("hidden");
  }
}

function bindEvents() {
  els.modePills.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  // Split slider pointer drag
  let draggingSplit = false;
  const updateSplitFromClientX = (clientX) => {
    const rect = els.paperFrame.getBoundingClientRect();
    const r = Math.max(0.03, Math.min(0.97, (clientX - rect.left) / Math.max(1, rect.width)));
    state.splitRatio = r;
    syncSplitPosition();
  };

  els.paperFrame.addEventListener("pointerdown", (e) => {
    if (state.mode === "split") {
      draggingSplit = true;
      els.paperFrame.setPointerCapture(e.pointerId);
      updateSplitFromClientX(e.clientX);
    }
  });
  els.paperFrame.addEventListener("pointermove", (e) => {
    if (draggingSplit && state.mode === "split") {
      updateSplitFromClientX(e.clientX);
    }
  });
  els.paperFrame.addEventListener("pointerup", () => {
    draggingSplit = false;
  });

  window.addEventListener("resize", () => syncSplitPosition());

  // Overlay interactions for Spacer & Eraser modes
  let dragStart = null;
  const toCanvasCoords = (e) => {
    const rect = els.canvasOverlay.getBoundingClientRect();
    const scaleX = els.canvasOverlay.width / Math.max(1, rect.width);
    const scaleY = els.canvasOverlay.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  els.canvasOverlay.addEventListener("pointermove", (e) => {
    const pt = toCanvasCoords(e);
    if (state.mode === "spacer") {
      drawInteractionOverlay(pt.y, null);
    } else if (state.mode === "eraser" && dragStart) {
      drawInteractionOverlay(null, {
        x: Math.min(dragStart.x, pt.x),
        y: Math.min(dragStart.y, pt.y),
        width: Math.abs(pt.x - dragStart.x),
        height: Math.abs(pt.y - dragStart.y),
      });
    }
  });

  els.canvasOverlay.addEventListener("pointerleave", () => {
    if (!dragStart) drawInteractionOverlay();
  });

  els.canvasOverlay.addEventListener("pointerdown", (e) => {
    const sheet = getActiveSheet();
    if (!sheet) return;
    const pt = toCanvasCoords(e);
    if (state.mode === "spacer") {
      const origY = mapOutputYToOriginalY(sheet, pt.y);
      sheet.spacers.push({
        id: `sp-${Date.now()}`,
        afterY: origY,
        addHeight: state.params.spacerAddHeight,
      });
      renderActiveSheet();
    } else if (state.mode === "eraser") {
      dragStart = pt;
      els.canvasOverlay.setPointerCapture(e.pointerId);
    }
  });

  els.canvasOverlay.addEventListener("pointerup", (e) => {
    if (state.mode === "eraser" && dragStart) {
      const sheet = getActiveSheet();
      const pt = toCanvasCoords(e);
      const rx = Math.min(dragStart.x, pt.x);
      const ry = Math.min(dragStart.y, pt.y);
      const rw = Math.abs(pt.x - dragStart.x);
      const rh = Math.abs(pt.y - dragStart.y);
      dragStart = null;
      if (sheet && rw > 6 && rh > 6) {
        const origY0 = mapOutputYToOriginalY(sheet, ry);
        const origY1 = mapOutputYToOriginalY(sheet, ry + rh);
        sheet.eraseRects.push({
          x: rx,
          y: origY0,
          width: rw,
          height: Math.max(8, origY1 - origY0),
        });
        renderActiveSheet();
      } else {
        drawInteractionOverlay();
      }
    }
  });

  // Auto sweep animation
  els.btnAutoSweep.addEventListener("click", () => {
    setMode("split");
    const start = performance.now();
    const duration = 1500;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      state.splitRatio = 0.88 - Math.sin(t * Math.PI) * 0.74;
      if (t >= 1) state.splitRatio = 0.35;
      syncSplitPosition();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  els.btnDemoSpacers.addEventListener("click", applyQuickDemoSpacers);
  els.btnQuickSpacers.addEventListener("click", applyQuickDemoSpacers);

  els.btnClearEdits.addEventListener("click", () => {
    const sheet = getActiveSheet();
    if (!sheet) return;
    sheet.spacers = [];
    sheet.eraseRects = [];
    renderActiveSheet();
  });

  els.btnResetDemo.addEventListener("click", () => {
    loadInitialDemo();
  });

  els.btnDefaultParams.addEventListener("click", () => {
    state.params.bleachShadow = true;
    state.params.eraseColorMarks = true;
    state.params.colorSatThreshold = 0.2;
    state.params.pencilThreshold = 166;
    state.params.inkContrast = 0.65;
    els.chkBleach.checked = true;
    els.chkColor.checked = true;
    els.rngColorSat.value = "0.20";
    els.lblColorSat.textContent = "0.20";
    els.rngPencil.value = "166";
    els.lblPencil.textContent = "166";
    els.rngContrast.value = "0.65";
    els.lblContrast.textContent = "0.65";
    renderActiveSheet();
  });

  els.chkBleach.addEventListener("change", () => {
    state.params.bleachShadow = els.chkBleach.checked;
    renderActiveSheet();
  });
  els.chkColor.addEventListener("change", () => {
    state.params.eraseColorMarks = els.chkColor.checked;
    renderActiveSheet();
  });
  els.rngColorSat.addEventListener("input", () => {
    state.params.colorSatThreshold = Number(els.rngColorSat.value);
    els.lblColorSat.textContent = state.params.colorSatThreshold.toFixed(2);
    renderActiveSheet();
  });
  els.rngPencil.addEventListener("input", () => {
    state.params.pencilThreshold = Number(els.rngPencil.value);
    els.lblPencil.textContent = String(state.params.pencilThreshold);
    renderActiveSheet();
  });
  els.rngContrast.addEventListener("input", () => {
    state.params.inkContrast = Number(els.rngContrast.value);
    els.lblContrast.textContent = state.params.inkContrast.toFixed(2);
    renderActiveSheet();
  });
  els.rngSpacerH.addEventListener("input", () => {
    state.params.spacerAddHeight = Number(els.rngSpacerH.value);
    els.lblSpacerH.textContent = `${state.params.spacerAddHeight} px`;
  });
  els.chkDashedGuide.addEventListener("change", () => {
    state.params.spacerDashedGuide = els.chkDashedGuide.checked;
    renderActiveSheet();
  });

  els.fileUpload.addEventListener("change", (e) => {
    handleUploadedFiles(e.target.files);
    e.target.value = "";
  });

  els.btnDownloadPng.addEventListener("click", downloadActivePng);
  els.btnPrintA4.addEventListener("click", triggerZeroOverlapPrint);

  els.btnOpenOrder.addEventListener("click", () => openOrderModal());
  els.btnCloseModal.addEventListener("click", () => els.orderModal.classList.add("hidden"));
  els.orderModal.addEventListener("click", (e) => {
    if (e.target === els.orderModal) els.orderModal.classList.add("hidden");
  });

  els.btnCopyOrder.addEventListener("click", async () => {
    await navigator.clipboard.writeText(
      `${els.orderBriefBox.textContent}\n联系发码邮箱：${ORDER_EMAIL_QQ} / ${ORDER_EMAIL_GMAIL}`
    );
    els.btnCopyOrder.textContent = "✅ 已复制订单摘要";
    setTimeout(() => {
      els.btnCopyOrder.textContent = "📋 复制订单信息";
    }, 2000);
  });

  els.btnVerifyLicense.addEventListener("click", () => {
    verifyAndSaveToken(els.inputLicense.value, false);
  });

  els.btnClearLicense.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state.isPro = false;
    state.licensePayload = null;
    state.licenseToken = "";
    els.inputLicense.value = "";
    els.licenseMsg.classList.add("hidden");
    updateLicenseUI();
  });
}

function loadInitialDemo() {
  const demoImg = buildRealisticDemoExamImageData();
  state.sheets = [
    {
      id: "demo-math-sheet",
      name: "八年级数学期中错题卷（仿真斜拍样张）",
      isDemo: true,
      rawImageData: demoImg,
      cleanedResult: null,
      spacers: [],
      eraseRects: [],
    },
  ];
  state.activeIndex = 0;
  state.splitRatio = 0.46;
  setMode("split");
  renderActiveSheet();
}

async function init() {
  bindEvents();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    await verifyAndSaveToken(saved, true);
  }
  loadInitialDemo();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
