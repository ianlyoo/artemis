/*!*
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */
const t = !("object" != typeof process || process + "" != "[object process]" || process.versions.nw || process.versions.electron && process.type && "browser" !== process.type), e = [1 / 0, 1 / 0, -1 / 0, -1 / 0], i = new Float32Array(e), n = [1e-3, 0, 0, 1e-3, 0, 0], s = "http://www.w3.org/2000/svg", r = 1, a = 2, o = 4, l = 16, h = 32, c = 64, d = 128, u = 256, p = { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2, ENABLE_STORAGE: 3 }, g = "pdfjs_internal_id_", m = "pdfjs_internal_editor_", f = { DISABLE: -1, NONE: 0, FREETEXT: 3, HIGHLIGHT: 9, STAMP: 13, INK: 15, POPUP: 16, SIGNATURE: 101, COMMENT: 102 }, b = { RESIZE: 1, CREATE: 2, FREETEXT_SIZE: 11, FREETEXT_COLOR: 12, FREETEXT_OPACITY: 13, INK_COLOR: 21, INK_THICKNESS: 22, INK_OPACITY: 23, INK_COLOR_AND_OPACITY: 24, HIGHLIGHT_COLOR: 31, HIGHLIGHT_THICKNESS: 32, HIGHLIGHT_FREE: 33, HIGHLIGHT_SHOW_ALL: 34, DRAW_STEP: 41 }, y = { PRINT: 4, MODIFY_CONTENTS: 8, COPY: 16, MODIFY_ANNOTATIONS: 32, FILL_INTERACTIVE_FORMS: 256, COPY_FOR_ACCESSIBILITY: 512, ASSEMBLE: 1024, PRINT_HIGH_QUALITY: 2048 }, v = 0, w = 1, A = 2, x = 3, C = 3, E = 4, S = { GRAYSCALE_1BPP: 1, RGB_24BPP: 2, RGBA_32BPP: 3 }, T = { TEXT: 1, LINK: 2, FREETEXT: 3, LINE: 4, SQUARE: 5, CIRCLE: 6, POLYGON: 7, POLYLINE: 8, HIGHLIGHT: 9, UNDERLINE: 10, SQUIGGLY: 11, STRIKEOUT: 12, STAMP: 13, CARET: 14, INK: 15, POPUP: 16, FILEATTACHMENT: 17, SOUND: 18, MOVIE: 19, WIDGET: 20, SCREEN: 21, PRINTERMARK: 22, TRAPNET: 23, WATERMARK: 24, THREED: 25, REDACT: 26, RICHMEDIA: 27 }, _ = 1, k = 2, D = 3, P = 4, M = 5, I = { ERRORS: 0, WARNINGS: 1, INFOS: 5 }, F = { dependency: 1, setLineWidth: 2, setLineCap: 3, setLineJoin: 4, setMiterLimit: 5, setDash: 6, setRenderingIntent: 7, setFlatness: 8, setGState: 9, save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, clip: 29, eoClip: 30, beginText: 31, endText: 32, setCharSpacing: 33, setWordSpacing: 34, setHScale: 35, setLeading: 36, setFont: 37, setTextRenderingMode: 38, setTextRise: 39, moveText: 40, setLeadingMoveText: 41, setTextMatrix: 42, nextLine: 43, showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47, setCharWidth: 48, setCharWidthAndBounds: 49, setStrokeColorSpace: 50, setFillColorSpace: 51, setStrokeColor: 52, setStrokeColorN: 53, setFillColor: 54, setFillColorN: 55, setStrokeGray: 56, setFillGray: 57, setStrokeRGBColor: 58, setFillRGBColor: 59, setStrokeCMYKColor: 60, setFillCMYKColor: 61, shadingFill: 62, beginInlineImage: 63, beginImageData: 64, endInlineImage: 65, paintXObject: 66, markPoint: 67, markPointProps: 68, beginMarkedContent: 69, beginMarkedContentProps: 70, endMarkedContent: 71, beginCompat: 72, endCompat: 73, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, beginGroup: 76, endGroup: 77, beginAnnotation: 80, endAnnotation: 81, paintImageMaskXObject: 83, paintImageMaskXObjectGroup: 84, paintImageXObject: 85, paintInlineImageXObject: 86, paintInlineImageXObjectGroup: 87, paintImageXObjectRepeat: 88, paintImageMaskXObjectRepeat: 89, paintSolidColorImageMask: 90, constructPath: 91, setStrokeTransparent: 92, setFillTransparent: 93, rawFillPath: 94 }, B = 0, O = 1, R = 2, L = 3, N = 4, U = { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 };
let H = I.WARNINGS;
function setVerbosityLevel(t2) {
  Number.isInteger(t2) && (H = t2);
}
function getVerbosityLevel() {
  return H;
}
function info(t2) {
  H >= I.INFOS && console.info(`Info: ${t2}`);
}
function warn(t2) {
  H >= I.WARNINGS && console.warn(`Warning: ${t2}`);
}
function unreachable(t2) {
  throw new Error(t2);
}
function assert(t2, e2) {
  t2 || unreachable(e2);
}
function createValidAbsoluteUrl(t2, e2 = null, i2 = null) {
  if (!t2) return null;
  if (i2 && "string" == typeof t2) {
    if (i2.addDefaultProtocol && t2.startsWith("www.")) {
      const e3 = t2.match(/\./g);
      e3?.length >= 2 && (t2 = `http://${t2}`);
    }
    if (i2.tryConvertEncoding) try {
      t2 = (function stringToUTF8String(t3) {
        return decodeURIComponent(escape(t3));
      })(t2);
    } catch {
    }
  }
  const n2 = e2 ? URL.parse(t2, e2) : URL.parse(t2);
  return (function _isValidProtocol(t3) {
    switch (t3?.protocol) {
      case "http:":
      case "https:":
      case "ftp:":
      case "mailto:":
      case "tel:":
        return true;
      default:
        return false;
    }
  })(n2) ? n2 : null;
}
function updateUrlHash(t2, e2, i2 = false) {
  const n2 = URL.parse(t2);
  if (n2) {
    n2.hash = e2;
    return n2.href;
  }
  return i2 && createValidAbsoluteUrl(t2, "http://example.com") ? t2.split("#", 1)[0] + (e2 ? `#${e2}` : "") : "";
}
function stripPath(t2) {
  return t2.substring(t2.lastIndexOf("/") + 1);
}
function shadow(t2, e2, i2, n2 = false) {
  Object.defineProperty(t2, e2, { value: i2, enumerable: !n2, configurable: true, writable: false });
  return i2;
}
const z = (function BaseExceptionClosure() {
  function BaseException(t2, e2) {
    this.message = t2;
    this.name = e2;
  }
  BaseException.prototype = new Error();
  BaseException.constructor = BaseException;
  return BaseException;
})();
class PasswordException extends z {
  constructor(t2, e2) {
    super(t2, "PasswordException");
    this.code = e2;
  }
}
class UnknownErrorException extends z {
  constructor(t2, e2) {
    super(t2, "UnknownErrorException");
    this.details = e2;
  }
}
class InvalidPDFException extends z {
  constructor(t2) {
    super(t2, "InvalidPDFException");
  }
}
class ResponseException extends z {
  constructor(t2, e2, i2) {
    super(t2, "ResponseException");
    this.status = e2;
    this.missing = i2;
  }
}
class FormatError extends z {
  constructor(t2) {
    super(t2, "FormatError");
  }
}
class AbortException extends z {
  constructor(t2) {
    super(t2, "AbortException");
  }
}
function stringToBytes(t2) {
  "string" != typeof t2 && unreachable("Invalid argument for stringToBytes");
  const e2 = t2.length, i2 = new Uint8Array(e2);
  for (let n2 = 0; n2 < e2; ++n2) i2[n2] = 255 & t2.charCodeAt(n2);
  return i2;
}
class FeatureTest {
  static get isLittleEndian() {
    const t2 = new Uint8Array(4);
    t2[0] = 1;
    return shadow(this, "isLittleEndian", 1 === new Uint32Array(t2.buffer, 0, 1)[0]);
  }
  static get isOffscreenCanvasSupported() {
    return shadow(this, "isOffscreenCanvasSupported", "undefined" != typeof OffscreenCanvas);
  }
  static get isImageDecoderSupported() {
    return shadow(this, "isImageDecoderSupported", "undefined" != typeof ImageDecoder);
  }
  static get isFloat16ArraySupported() {
    return shadow(this, "isFloat16ArraySupported", "undefined" != typeof Float16Array);
  }
  static get isSanitizerSupported() {
    return shadow(this, "isSanitizerSupported", "undefined" != typeof Sanitizer);
  }
  static get platform() {
    const { platform: t2, userAgent: e2 } = navigator;
    return shadow(this, "platform", { isAndroid: e2.includes("Android"), isLinux: t2.includes("Linux"), isMac: t2.includes("Mac"), isWindows: t2.includes("Win"), isFirefox: e2.includes("Firefox") });
  }
  static get isCanvasFilterSupported() {
    let t2;
    this.isOffscreenCanvasSupported ? t2 = new OffscreenCanvas(1, 1).getContext("2d") : "undefined" != typeof document && (t2 = document.createElement("canvas").getContext("2d"));
    return shadow(this, "isCanvasFilterSupported", void 0 !== t2?.filter);
  }
  static get isAlphaColorInputSupported() {
    if ("undefined" == typeof document) return shadow(this, "isAlphaColorInputSupported", false);
    const t2 = document.createElement("input");
    t2.type = "color";
    t2.setAttribute("alpha", "");
    t2.value = "#ff000080";
    return shadow(this, "isAlphaColorInputSupported", "#ff0000" !== t2.value);
  }
  static get isBackdropFilterSupported() {
    return shadow(this, "isBackdropFilterSupported", "undefined" != typeof CSS && CSS.supports("backdrop-filter", "blur(1px)"));
  }
}
class Util {
  static get hexNums() {
    return shadow(this, "hexNums", Array.from({ length: 256 }, (t2, e2) => e2.toString(16).padStart(2, "0")));
  }
  static makeHexColor(t2, e2, i2) {
    return `#${this.hexNums[t2]}${this.hexNums[e2]}${this.hexNums[i2]}`;
  }
  static transform(t2, e2) {
    return [t2[0] * e2[0] + t2[2] * e2[1], t2[1] * e2[0] + t2[3] * e2[1], t2[0] * e2[2] + t2[2] * e2[3], t2[1] * e2[2] + t2[3] * e2[3], t2[0] * e2[4] + t2[2] * e2[5] + t2[4], t2[1] * e2[4] + t2[3] * e2[5] + t2[5]];
  }
  static multiplyByDOMMatrix(t2, e2) {
    return [t2[0] * e2.a + t2[2] * e2.b, t2[1] * e2.a + t2[3] * e2.b, t2[0] * e2.c + t2[2] * e2.d, t2[1] * e2.c + t2[3] * e2.d, t2[0] * e2.e + t2[2] * e2.f + t2[4], t2[1] * e2.e + t2[3] * e2.f + t2[5]];
  }
  static applyTransform(t2, e2, i2 = 0) {
    const n2 = t2[i2], s2 = t2[i2 + 1];
    t2[i2] = n2 * e2[0] + s2 * e2[2] + e2[4];
    t2[i2 + 1] = n2 * e2[1] + s2 * e2[3] + e2[5];
  }
  static applyTransformToBezier(t2, e2, i2 = 0) {
    const n2 = e2[0], s2 = e2[1], r2 = e2[2], a2 = e2[3], o2 = e2[4], l2 = e2[5];
    for (let e3 = 0; e3 < 6; e3 += 2) {
      const h2 = t2[i2 + e3], c2 = t2[i2 + e3 + 1];
      t2[i2 + e3] = h2 * n2 + c2 * r2 + o2;
      t2[i2 + e3 + 1] = h2 * s2 + c2 * a2 + l2;
    }
  }
  static applyInverseTransform(t2, e2) {
    const i2 = t2[0], n2 = t2[1], s2 = e2[0] * e2[3] - e2[1] * e2[2];
    t2[0] = (i2 * e2[3] - n2 * e2[2] + e2[2] * e2[5] - e2[4] * e2[3]) / s2;
    t2[1] = (-i2 * e2[1] + n2 * e2[0] + e2[4] * e2[1] - e2[5] * e2[0]) / s2;
  }
  static axialAlignedBoundingBox(t2, e2, i2) {
    const n2 = e2[0], s2 = e2[1], r2 = e2[2], a2 = e2[3], o2 = e2[4], l2 = e2[5], h2 = t2[0], c2 = t2[1], d2 = t2[2], u2 = t2[3];
    let p2 = n2 * h2 + o2, g2 = p2, m2 = n2 * d2 + o2, f2 = m2, b2 = a2 * c2 + l2, y2 = b2, v2 = a2 * u2 + l2, w2 = v2;
    if (0 !== s2 || 0 !== r2) {
      const t3 = s2 * h2, e3 = s2 * d2, i3 = r2 * c2, n3 = r2 * u2;
      p2 += i3;
      f2 += i3;
      m2 += n3;
      g2 += n3;
      b2 += t3;
      w2 += t3;
      v2 += e3;
      y2 += e3;
    }
    i2[0] = Math.min(i2[0], p2, m2, g2, f2);
    i2[1] = Math.min(i2[1], b2, v2, y2, w2);
    i2[2] = Math.max(i2[2], p2, m2, g2, f2);
    i2[3] = Math.max(i2[3], b2, v2, y2, w2);
  }
  static inverseTransform(t2) {
    const e2 = t2[0] * t2[3] - t2[1] * t2[2];
    return [t2[3] / e2, -t2[1] / e2, -t2[2] / e2, t2[0] / e2, (t2[2] * t2[5] - t2[4] * t2[3]) / e2, (t2[4] * t2[1] - t2[5] * t2[0]) / e2];
  }
  static singularValueDecompose2dScale(t2, e2) {
    const i2 = t2[0], n2 = t2[1], s2 = t2[2], r2 = t2[3], a2 = i2 ** 2 + n2 ** 2, o2 = i2 * s2 + n2 * r2, l2 = s2 ** 2 + r2 ** 2, h2 = (a2 + l2) / 2, c2 = Math.sqrt(h2 ** 2 - (a2 * l2 - o2 ** 2));
    e2[0] = Math.sqrt(h2 + c2 || 1);
    e2[1] = Math.sqrt(h2 - c2 || 1);
  }
  static normalizeRect(t2) {
    const e2 = t2.slice(0);
    if (t2[0] > t2[2]) {
      e2[0] = t2[2];
      e2[2] = t2[0];
    }
    if (t2[1] > t2[3]) {
      e2[1] = t2[3];
      e2[3] = t2[1];
    }
    return e2;
  }
  static intersect(t2, e2) {
    const i2 = Math.max(Math.min(t2[0], t2[2]), Math.min(e2[0], e2[2])), n2 = Math.min(Math.max(t2[0], t2[2]), Math.max(e2[0], e2[2]));
    if (i2 > n2) return null;
    const s2 = Math.max(Math.min(t2[1], t2[3]), Math.min(e2[1], e2[3])), r2 = Math.min(Math.max(t2[1], t2[3]), Math.max(e2[1], e2[3]));
    return s2 > r2 ? null : [i2, s2, n2, r2];
  }
  static pointBoundingBox(t2, e2, i2) {
    i2[0] = Math.min(i2[0], t2);
    i2[1] = Math.min(i2[1], e2);
    i2[2] = Math.max(i2[2], t2);
    i2[3] = Math.max(i2[3], e2);
  }
  static rectBoundingBox(t2, e2, i2, n2, s2) {
    s2[0] = Math.min(s2[0], t2, i2);
    s2[1] = Math.min(s2[1], e2, n2);
    s2[2] = Math.max(s2[2], t2, i2);
    s2[3] = Math.max(s2[3], e2, n2);
  }
  static #t(t2, e2, i2, n2, s2, r2, a2, o2, l2, h2) {
    if (l2 <= 0 || l2 >= 1) return;
    const c2 = 1 - l2, d2 = l2 * l2, u2 = d2 * l2, p2 = c2 * (c2 * (c2 * t2 + 3 * l2 * e2) + 3 * d2 * i2) + u2 * n2, g2 = c2 * (c2 * (c2 * s2 + 3 * l2 * r2) + 3 * d2 * a2) + u2 * o2;
    h2[0] = Math.min(h2[0], p2);
    h2[1] = Math.min(h2[1], g2);
    h2[2] = Math.max(h2[2], p2);
    h2[3] = Math.max(h2[3], g2);
  }
  static #e(t2, e2, i2, n2, s2, r2, a2, o2, l2, h2, c2, d2) {
    if (Math.abs(l2) < 1e-12) {
      Math.abs(h2) >= 1e-12 && this.#t(t2, e2, i2, n2, s2, r2, a2, o2, -c2 / h2, d2);
      return;
    }
    const u2 = h2 ** 2 - 4 * c2 * l2;
    if (u2 < 0) return;
    const p2 = Math.sqrt(u2), g2 = 2 * l2;
    this.#t(t2, e2, i2, n2, s2, r2, a2, o2, (-h2 + p2) / g2, d2);
    this.#t(t2, e2, i2, n2, s2, r2, a2, o2, (-h2 - p2) / g2, d2);
  }
  static bezierBoundingBox(t2, e2, i2, n2, s2, r2, a2, o2, l2) {
    l2[0] = Math.min(l2[0], t2, a2);
    l2[1] = Math.min(l2[1], e2, o2);
    l2[2] = Math.max(l2[2], t2, a2);
    l2[3] = Math.max(l2[3], e2, o2);
    this.#e(t2, i2, s2, a2, e2, n2, r2, o2, 3 * (3 * (i2 - s2) - t2 + a2), 6 * (t2 - 2 * i2 + s2), 3 * (i2 - t2), l2);
    this.#e(t2, i2, s2, a2, e2, n2, r2, o2, 3 * (3 * (n2 - r2) - e2 + o2), 6 * (e2 - 2 * n2 + r2), 3 * (n2 - e2), l2);
  }
}
let G = null, V = null;
function normalizeUnicode(t2) {
  if (!G) {
    G = /([\u00a0\u00b5\u037e\u0eb3\u2000-\u200a\u202f\u2126\ufb00-\ufb04\ufb06\ufb20-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufba1\ufba4-\ufba9\ufbae-\ufbb1\ufbd3-\ufbdc\ufbde-\ufbe7\ufbea-\ufbf8\ufbfc\ufbfd\ufc00-\ufc5d\ufc64-\ufcf1\ufcf5-\ufd3d\ufd88\ufdf4\ufdfa\ufdfb\ufe71\ufe77\ufe79\ufe7b\ufe7d]+)|(\ufb05+)/gu;
    V = /* @__PURE__ */ new Map([["ﬅ", "ſt"]]);
  }
  return t2.replaceAll(G, (t3, e2, i2) => e2 ? e2.normalize("NFKC") : V.get(i2));
}
function getUuid() {
  if ("function" == typeof crypto.randomUUID) return crypto.randomUUID();
  const t2 = new Uint8Array(32);
  crypto.getRandomValues(t2);
  return (function bytesToString(t3) {
    "object" == typeof t3 && void 0 !== t3?.length || unreachable("Invalid argument for bytesToString");
    const e2 = t3.length, i2 = 8192;
    if (e2 < i2) return String.fromCharCode.apply(null, t3);
    const n2 = [];
    for (let s2 = 0; s2 < e2; s2 += i2) {
      const r2 = Math.min(s2 + i2, e2), a2 = t3.subarray(s2, r2);
      n2.push(String.fromCharCode.apply(null, a2));
    }
    return n2.join("");
  })(t2);
}
const makeArr = () => [], makeMap = () => /* @__PURE__ */ new Map(), makeObj = () => /* @__PURE__ */ Object.create(null), makeSet = () => /* @__PURE__ */ new Set();
"function" != typeof Iterator.prototype.join && (Iterator.prototype.join = function(t2) {
  return [...this].join(t2);
});
function MathClamp(t2, e2, i2) {
  return Math.min(Math.max(t2, e2), i2);
}
class PageViewport {
  constructor({ viewBox: t2, userUnit: e2, scale: i2, rotation: n2, offsetX: s2 = 0, offsetY: r2 = 0, dontFlip: a2 = false }) {
    this.viewBox = t2;
    this.userUnit = e2;
    this.scale = i2;
    this.rotation = n2;
    this.offsetX = s2;
    this.offsetY = r2;
    i2 *= e2;
    const o2 = (t2[2] + t2[0]) / 2, l2 = (t2[3] + t2[1]) / 2;
    let h2, c2, d2, u2, p2, g2, m2, f2;
    (n2 %= 360) < 0 && (n2 += 360);
    switch (n2) {
      case 180:
        h2 = -1;
        c2 = 0;
        d2 = 0;
        u2 = 1;
        break;
      case 90:
        h2 = 0;
        c2 = 1;
        d2 = 1;
        u2 = 0;
        break;
      case 270:
        h2 = 0;
        c2 = -1;
        d2 = -1;
        u2 = 0;
        break;
      case 0:
        h2 = 1;
        c2 = 0;
        d2 = 0;
        u2 = -1;
        break;
      default:
        throw new Error("PageViewport: Invalid rotation, must be a multiple of 90 degrees.");
    }
    if (a2) {
      d2 = -d2;
      u2 = -u2;
    }
    if (0 === h2) {
      p2 = Math.abs(l2 - t2[1]) * i2 + s2;
      g2 = Math.abs(o2 - t2[0]) * i2 + r2;
      m2 = (t2[3] - t2[1]) * i2;
      f2 = (t2[2] - t2[0]) * i2;
    } else {
      p2 = Math.abs(o2 - t2[0]) * i2 + s2;
      g2 = Math.abs(l2 - t2[1]) * i2 + r2;
      m2 = (t2[2] - t2[0]) * i2;
      f2 = (t2[3] - t2[1]) * i2;
    }
    this.transform = [h2 * i2, c2 * i2, d2 * i2, u2 * i2, p2 - h2 * i2 * o2 - d2 * i2 * l2, g2 - c2 * i2 * o2 - u2 * i2 * l2];
    this.width = m2;
    this.height = f2;
  }
  get rawDims() {
    const t2 = this.viewBox;
    return shadow(this, "rawDims", { pageWidth: t2[2] - t2[0], pageHeight: t2[3] - t2[1], pageX: t2[0], pageY: t2[1] });
  }
  clone({ scale: t2 = this.scale, rotation: e2 = this.rotation, offsetX: i2 = this.offsetX, offsetY: n2 = this.offsetY, dontFlip: s2 = false } = {}) {
    return new PageViewport({ viewBox: this.viewBox.slice(), userUnit: this.userUnit, scale: t2, rotation: e2, offsetX: i2, offsetY: n2, dontFlip: s2 });
  }
  convertToViewportPoint(t2, e2) {
    const i2 = [t2, e2];
    Util.applyTransform(i2, this.transform);
    return i2;
  }
  convertToPdfPoint(t2, e2) {
    const i2 = [t2, e2];
    Util.applyInverseTransform(i2, this.transform);
    return i2;
  }
}
class XfaText {
  static textContent(t2) {
    const e2 = [], i2 = { items: e2, styles: /* @__PURE__ */ Object.create(null) };
    !(function walk(t3) {
      if (!t3) return;
      let i3 = null;
      const n2 = t3.name;
      if ("#text" === n2) i3 = t3.value;
      else {
        if (!XfaText.shouldBuildText(n2)) return;
        t3?.attributes?.textContent ? i3 = t3.attributes.textContent : t3.value && (i3 = t3.value);
      }
      null !== i3 && e2.push({ str: i3 });
      if (t3.children) for (const e3 of t3.children) walk(e3);
    })(t2);
    return i2;
  }
  static shouldBuildText(t2) {
    return !("textarea" === t2 || "input" === t2 || "option" === t2 || "select" === t2);
  }
}
const W = /url\(|image-set\(/i, $ = /^on/i;
class XfaLayer {
  static get _allowedHtmlElements() {
    return shadow(this, "_allowedHtmlElements", /* @__PURE__ */ new Set(["a", "b", "br", "button", "div", "i", "img", "input", "label", "li", "ol", "option", "p", "select", "span", "sub", "sup", "textarea", "ul"]));
  }
  static get _allowedSvgElements() {
    return shadow(this, "_allowedSvgElements", /* @__PURE__ */ new Set(["ellipse", "line", "path", "rect", "svg"]));
  }
  static get _allowedRichTextElements() {
    return shadow(this, "_allowedRichTextElements", /* @__PURE__ */ new Set(["a", "b", "br", "div", "i", "li", "ol", "p", "span", "sub", "sup", "ul"]));
  }
  static get _allowedRichTextAttributes() {
    return shadow(this, "_allowedRichTextAttributes", /* @__PURE__ */ new Set(["class", "dir", "style"]));
  }
  static get _allowedRichTextStyles() {
    return shadow(this, "_allowedRichTextStyles", /* @__PURE__ */ new Set(["color", "font", "fontFamily", "fontSize", "fontStretch", "fontStyle", "fontWeight", "kerningMode", "letterSpacing", "lineHeight", "margin", "marginBottom", "marginLeft", "marginRight", "marginTop", "orphans", "paddingLeft", "paddingRight", "breakAfter", "breakBefore", "breakInside", "tabInterval", "tabStop", "textAlign", "textDecoration", "textIndent", "transform", "verticalAlign", "widows"]));
  }
  static setupStorage(t2, e2, i2, n2, s2) {
    const r2 = n2.getValue(e2, { value: null });
    switch (i2.name) {
      case "textarea":
        null !== r2.value && (t2.textContent = r2.value);
        if ("print" === s2) break;
        t2.addEventListener("input", (t3) => {
          n2.setValue(e2, { value: t3.target.value });
        });
        break;
      case "input":
        if ("radio" === i2.attributes.type || "checkbox" === i2.attributes.type) {
          r2.value === i2.attributes.xfaOn ? t2.setAttribute("checked", true) : r2.value === i2.attributes.xfaOff && t2.removeAttribute("checked");
          if ("print" === s2) break;
          t2.addEventListener("change", (t3) => {
            n2.setValue(e2, { value: t3.target.checked ? t3.target.getAttribute("xfaOn") : t3.target.getAttribute("xfaOff") });
          });
        } else {
          null !== r2.value && t2.setAttribute("value", r2.value);
          if ("print" === s2) break;
          t2.addEventListener("input", (t3) => {
            n2.setValue(e2, { value: t3.target.value });
          });
        }
        break;
      case "select":
        if (null !== r2.value) {
          t2.setAttribute("value", r2.value);
          for (const t3 of i2.children) t3.attributes.value === r2.value ? t3.attributes.selected = true : Object.hasOwn(t3.attributes, "selected") && delete t3.attributes.selected;
        }
        t2.addEventListener("input", (t3) => {
          const i3 = t3.target.options, s3 = -1 === i3.selectedIndex ? "" : i3[i3.selectedIndex].value;
          n2.setValue(e2, { value: s3 });
        });
    }
  }
  static setAttributes({ html: t2, element: e2, storage: i2 = null, intent: n2, linkService: s2 }) {
    const { attributes: r2 } = e2, a2 = t2 instanceof HTMLAnchorElement;
    "radio" === r2.type && (r2.name = `${r2.name}-${n2}`);
    for (const [e3, i3] of Object.entries(r2)) if (null != i3 && !$.test(e3) && ("richText" !== n2 || this._allowedRichTextAttributes.has(e3))) switch (e3) {
      case "class":
        i3.length && t2.setAttribute(e3, i3.join(" "));
        break;
      case "dataId":
        break;
      case "id":
        t2.setAttribute("data-element-id", i3);
        break;
      case "style":
        if ("richText" === n2) {
          const e4 = this._allowedRichTextStyles;
          for (const [n3, s3] of Object.entries(i3)) e4.has(n3) && !W.test(s3) && (t2.style[n3] = s3);
        } else Object.assign(t2.style, i3);
        break;
      case "textContent":
        t2.textContent = i3;
        break;
      default:
        (!a2 || "href" !== e3 && "newWindow" !== e3) && t2.setAttribute(e3, i3);
    }
    a2 && s2?.addLinkAttributes(t2, r2.href, r2.newWindow);
    i2 && r2.dataId && this.setupStorage(t2, r2.dataId, e2, i2);
  }
  static #i(t2, e2, i2) {
    return "richText" === i2 ? !e2 && this._allowedRichTextElements.has(t2) ? document.createElement(t2) : null : e2 ? e2 === s && this._allowedSvgElements.has(t2) ? document.createElementNS(s, t2) : null : this._allowedHtmlElements.has(t2) ? document.createElement(t2) : null;
  }
  static render(t2) {
    const e2 = t2.annotationStorage, i2 = t2.linkService, n2 = t2.xfaHtml, s2 = t2.intent || "display", r2 = this.#i(n2.name, n2.attributes?.xmlns, s2) ?? document.createElement("div");
    n2.attributes && this.setAttributes({ html: r2, element: n2, intent: s2, linkService: i2 });
    const a2 = "richText" !== s2, o2 = t2.div;
    o2.append(r2);
    if (t2.viewport) {
      const e3 = `matrix(${t2.viewport.transform.join(",")})`;
      o2.style.transform = e3;
    }
    a2 && o2.setAttribute("class", "xfaLayer xfaFont");
    const l2 = [];
    if (0 === n2.children.length) {
      if (n2.value) {
        const t3 = document.createTextNode(n2.value);
        r2.append(t3);
        a2 && XfaText.shouldBuildText(n2.name) && l2.push(t3);
      }
      return { textDivs: l2 };
    }
    const h2 = [[n2, -1, r2]];
    for (; h2.length > 0; ) {
      const [t3, n3, r3] = h2.at(-1);
      if (n3 + 1 === t3.children.length) {
        h2.pop();
        continue;
      }
      const o3 = t3.children[++h2.at(-1)[1]];
      if (null === o3) continue;
      const { name: c2 } = o3;
      if ("#text" === c2) {
        const t4 = document.createTextNode(o3.value);
        l2.push(t4);
        r3.append(t4);
        continue;
      }
      const d2 = this.#i(c2, o3.attributes?.xmlns, s2);
      if (d2) {
        r3.append(d2);
        o3.attributes && this.setAttributes({ html: d2, element: o3, storage: e2, intent: s2, linkService: i2 });
        if (o3.children?.length > 0) h2.push([o3, -1, d2]);
        else if (o3.value) {
          const t4 = document.createTextNode(o3.value);
          a2 && XfaText.shouldBuildText(c2) && l2.push(t4);
          d2.append(t4);
        }
      }
    }
    for (const t3 of o2.querySelectorAll(".xfaNonInteractive input, .xfaNonInteractive textarea")) t3.setAttribute("readOnly", true);
    return { textDivs: l2 };
  }
  static update(t2) {
    const e2 = `matrix(${t2.viewport.transform.join(",")})`;
    t2.div.style.transform = e2;
    t2.div.hidden = false;
  }
  static getPageViewport(t2, { scale: e2 = 1, rotation: i2 = 0 }) {
    const { width: n2, height: s2 } = t2.attributes.style;
    return new PageViewport({ viewBox: [0, 0, parseInt(n2, 10), parseInt(s2, 10)], userUnit: 1, scale: e2, rotation: i2 });
  }
}
class PixelsPerInch {
  static CSS = 96;
  static PDF = 72;
  static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
}
async function fetchData(t2, e2 = "text") {
  if (isValidFetchUrl(t2, document.baseURI)) {
    const i2 = await fetch(t2);
    if (!i2.ok) throw new Error(i2.statusText);
    switch (e2) {
      case "blob":
        return i2.blob();
      case "bytes":
        return i2.bytes();
      case "json":
        return i2.json();
    }
    return i2.text();
  }
  return new Promise((i2, n2) => {
    const s2 = new XMLHttpRequest();
    s2.open("GET", t2, true);
    s2.responseType = "bytes" === e2 ? "arraybuffer" : e2;
    s2.onreadystatechange = () => {
      if (s2.readyState === XMLHttpRequest.DONE) if (200 !== s2.status && 0 !== s2.status) n2(new Error(s2.statusText));
      else {
        switch (e2) {
          case "bytes":
            i2(new Uint8Array(s2.response));
            return;
          case "blob":
          case "json":
            i2(s2.response);
            return;
        }
        i2(s2.responseText);
      }
    };
    s2.send(null);
  });
}
class RenderingCancelledException extends z {
  constructor(t2, e2 = 0) {
    super(t2, "RenderingCancelledException");
    this.extraDelay = e2;
  }
}
function isDataScheme(t2) {
  const e2 = t2.length;
  let i2 = 0;
  for (; i2 < e2 && "" === t2[i2].trim(); ) i2++;
  return "data:" === t2.substring(i2, i2 + 5).toLowerCase();
}
function isPdfFile(t2) {
  return "string" == typeof t2 && /\.pdf$/i.test(t2);
}
function getFilenameFromUrl(t2) {
  [t2] = t2.split(/[#?]/, 1);
  return stripPath(t2);
}
function getPdfFilenameFromUrl(t2, e2 = "document.pdf") {
  if ("string" != typeof t2) return e2;
  if (isDataScheme(t2)) {
    warn('getPdfFilenameFromUrl: ignore "data:"-URL for performance reasons.');
    return e2;
  }
  const i2 = ((t3) => {
    try {
      return new URL(t3);
    } catch {
    }
    try {
      return new URL(decodeURIComponent(t3));
    } catch {
    }
    try {
      return new URL(t3, "https://foo.bar");
    } catch {
    }
    try {
      return new URL(decodeURIComponent(t3), "https://foo.bar");
    } catch {
    }
    return null;
  })(t2);
  if (!i2) return e2;
  const decode = (t3) => {
    try {
      let e3 = decodeURIComponent(t3);
      if (e3.includes("/")) {
        e3 = stripPath(e3);
        if (4 === e3.length && n2.test(e3)) return t3;
      }
      return e3;
    } catch {
      return t3;
    }
  }, n2 = /\.pdf$/i, s2 = stripPath(i2.pathname);
  if (n2.test(s2)) return decode(s2);
  if (i2.searchParams.size > 0) {
    const getLast = (t4) => [...t4].findLast((t5) => n2.test(t5)), t3 = getLast(i2.searchParams.values()) ?? getLast(i2.searchParams.keys());
    if (t3) return decode(t3);
  }
  if (i2.hash) {
    const { hash: t3 } = i2;
    let e3 = -1;
    for (const { index: i3 } of t3.matchAll(/\.pdf\b/gi)) e3 = i3;
    if (e3 > 0) {
      let i3 = e3;
      for (; i3 > 0 && !"/?#=".includes(t3[i3 - 1]); ) i3--;
      if (i3 < e3) return decode(t3.slice(i3, e3 + 4));
    }
  }
  return e2;
}
class StatTimer {
  #n = /* @__PURE__ */ new Map();
  times = [];
  time(t2) {
    this.#n.has(t2) && warn(`Timer is already running for ${t2}`);
    this.#n.set(t2, Date.now());
  }
  timeEnd(t2) {
    this.#n.has(t2) || warn(`Timer has not been started for ${t2}`);
    this.times.push({ name: t2, start: this.#n.get(t2), end: Date.now() });
    this.#n.delete(t2);
  }
  toString() {
    const t2 = Math.max(...this.times.map((t3) => t3.name.length));
    return this.times.map((e2) => `${e2.name.padEnd(t2)} ${e2.end - e2.start}ms
`).join("");
  }
}
function isValidFetchUrl(t2, e2) {
  const i2 = e2 ? URL.parse(t2, e2) : URL.parse(t2);
  return /https?:/.test(i2?.protocol ?? "");
}
function noContextMenu(t2) {
  t2.preventDefault();
}
function stopEvent(t2) {
  t2.preventDefault();
  t2.stopPropagation();
}
class PDFDateString {
  static #s;
  static toDateObject(t2) {
    if (t2 instanceof Date) return t2;
    if (!t2 || "string" != typeof t2) return null;
    this.#s ||= new RegExp("^D:(\\d{4})(\\d{2})?(\\d{2})?(\\d{2})?(\\d{2})?(\\d{2})?([Z|+\\-])?(\\d{2})?'?(\\d{2})?'?");
    const e2 = this.#s.exec(t2);
    if (!e2) return null;
    const i2 = parseInt(e2[1], 10);
    let n2 = parseInt(e2[2], 10);
    n2 = n2 >= 1 && n2 <= 12 ? n2 - 1 : 0;
    let s2 = parseInt(e2[3], 10);
    s2 = s2 >= 1 && s2 <= 31 ? s2 : 1;
    let r2 = parseInt(e2[4], 10);
    r2 = r2 >= 0 && r2 <= 23 ? r2 : 0;
    let a2 = parseInt(e2[5], 10);
    a2 = a2 >= 0 && a2 <= 59 ? a2 : 0;
    let o2 = parseInt(e2[6], 10);
    o2 = o2 >= 0 && o2 <= 59 ? o2 : 0;
    const l2 = e2[7] || "Z";
    let h2 = parseInt(e2[8], 10);
    h2 = h2 >= 0 && h2 <= 23 ? h2 : 0;
    let c2 = parseInt(e2[9], 10) || 0;
    c2 = c2 >= 0 && c2 <= 59 ? c2 : 0;
    if ("-" === l2) {
      r2 += h2;
      a2 += c2;
    } else if ("+" === l2) {
      r2 -= h2;
      a2 -= c2;
    }
    return new Date(Date.UTC(i2, n2, s2, r2, a2, o2));
  }
}
function getRGBA(t2) {
  if (t2.startsWith("#")) {
    const e3 = t2.slice(1);
    return [parseInt(e3.slice(0, 2), 16), parseInt(e3.slice(2, 4), 16), parseInt(e3.slice(4, 6), 16), e3.length >= 8 ? parseInt(e3.slice(6, 8), 16) / 255 : 1];
  }
  if (t2.startsWith("rgb(")) {
    const [e3, i2, n2] = t2.slice(4, -1).split(",").map((t3) => parseInt(t3, 10));
    return [e3, i2, n2, 1];
  }
  if (t2.startsWith("rgba(")) {
    const e3 = t2.slice(5, -1).split(",");
    return [parseInt(e3[0], 10), parseInt(e3[1], 10), parseInt(e3[2], 10), parseFloat(e3[3])];
  }
  const e2 = t2.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+|none))?\)$/);
  return e2 ? [Math.round(255 * parseFloat(e2[1])), Math.round(255 * parseFloat(e2[2])), Math.round(255 * parseFloat(e2[3])), void 0 !== e2[4] && "none" !== e2[4] ? parseFloat(e2[4]) : 1] : null;
}
function getRGB(t2) {
  const e2 = getRGBA(t2);
  if (!e2) {
    warn(`Not a valid color format: "${t2}"`);
    return [0, 0, 0];
  }
  return e2.slice(0, 3);
}
function getCurrentTransform(t2) {
  const { a: e2, b: i2, c: n2, d: s2, e: r2, f: a2 } = t2.getTransform();
  return [e2, i2, n2, s2, r2, a2];
}
function getCurrentTransformInverse(t2) {
  const { a: e2, b: i2, c: n2, d: s2, e: r2, f: a2 } = t2.getTransform().invertSelf();
  return [e2, i2, n2, s2, r2, a2];
}
function setLayerDimensions(t2, e2, i2 = false, n2 = true) {
  if (e2 instanceof PageViewport) {
    const { pageWidth: n3, pageHeight: s2 } = e2.rawDims, { style: r2 } = t2, a2 = `round(down, var(--total-scale-factor) * ${n3}px, var(--scale-round-x))`, o2 = `round(down, var(--total-scale-factor) * ${s2}px, var(--scale-round-y))`;
    if (i2 && e2.rotation % 180 != 0) {
      r2.width = o2;
      r2.height = a2;
    } else {
      r2.width = a2;
      r2.height = o2;
    }
  }
  n2 && t2.setAttribute("data-main-rotation", e2.rotation);
}
class OutputScale {
  constructor() {
    const { pixelRatio: t2 } = OutputScale;
    this.sx = t2;
    this.sy = t2;
  }
  get scaled() {
    return 1 !== this.sx || 1 !== this.sy;
  }
  get symmetric() {
    return this.sx === this.sy;
  }
  limitCanvas(t2, e2, i2, n2, s2 = -1) {
    let r2 = 1 / 0, a2 = 1 / 0, o2 = 1 / 0;
    (i2 = OutputScale.capPixels(i2, s2)) > 0 && (r2 = Math.sqrt(i2 / (t2 * e2)));
    if (-1 !== n2) {
      a2 = n2 / t2;
      o2 = n2 / e2;
    }
    const l2 = Math.min(r2, a2, o2);
    if (this.sx > l2 || this.sy > l2) {
      this.sx = l2;
      this.sy = l2;
      return true;
    }
    return false;
  }
  static get pixelRatio() {
    return globalThis.devicePixelRatio || 1;
  }
  static capPixels(t2, e2) {
    if (e2 >= 0) {
      const i2 = Math.ceil(window.screen.availWidth * window.screen.availHeight * this.pixelRatio ** 2 * (1 + e2 / 100));
      return t2 > 0 ? Math.min(t2, i2) : i2;
    }
    return t2;
  }
}
const j = /* @__PURE__ */ new Set(["image/apng", "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/x-icon"]);
class ColorScheme {
  static get isDarkMode() {
    return shadow(this, "isDarkMode", !!window?.matchMedia?.("(prefers-color-scheme: dark)").matches);
  }
}
class CSSConstants {
  static get commentForegroundColor() {
    const t2 = document.createElement("span");
    t2.classList.add("comment", "sidebar");
    const { style: e2 } = t2;
    e2.width = e2.height = "0";
    e2.display = "none";
    e2.color = "var(--comment-fg-color)";
    document.body.append(t2);
    const { color: i2 } = window.getComputedStyle(t2);
    t2.remove();
    return shadow(this, "commentForegroundColor", getRGB(i2));
  }
}
function applyOpacity(t2, e2) {
  const i2 = 255 * (1 - (e2 = MathClamp(e2 ?? 1, 0, 1)));
  return t2.map((t3) => Math.round(t3 * e2 + i2));
}
function RGBToHSL(t2, e2) {
  const i2 = t2[0] / 255, n2 = t2[1] / 255, s2 = t2[2] / 255, r2 = Math.max(i2, n2, s2), a2 = Math.min(i2, n2, s2), o2 = (r2 + a2) / 2;
  if (r2 === a2) e2[0] = e2[1] = 0;
  else {
    const t3 = r2 - a2;
    e2[1] = o2 < 0.5 ? t3 / (r2 + a2) : t3 / (2 - r2 - a2);
    switch (r2) {
      case i2:
        e2[0] = 60 * ((n2 - s2) / t3 + (n2 < s2 ? 6 : 0));
        break;
      case n2:
        e2[0] = 60 * ((s2 - i2) / t3 + 2);
        break;
      case s2:
        e2[0] = 60 * ((i2 - n2) / t3 + 4);
    }
  }
  e2[2] = o2;
}
function HSLToRGB(t2, e2) {
  const i2 = t2[0], n2 = t2[1], s2 = t2[2], r2 = (1 - Math.abs(2 * s2 - 1)) * n2, a2 = r2 * (1 - Math.abs(i2 / 60 % 2 - 1)), o2 = s2 - r2 / 2;
  switch (Math.floor(i2 / 60)) {
    case 0:
      e2[0] = r2 + o2;
      e2[1] = a2 + o2;
      e2[2] = o2;
      break;
    case 1:
      e2[0] = a2 + o2;
      e2[1] = r2 + o2;
      e2[2] = o2;
      break;
    case 2:
      e2[0] = o2;
      e2[1] = r2 + o2;
      e2[2] = a2 + o2;
      break;
    case 3:
      e2[0] = o2;
      e2[1] = a2 + o2;
      e2[2] = r2 + o2;
      break;
    case 4:
      e2[0] = a2 + o2;
      e2[1] = o2;
      e2[2] = r2 + o2;
      break;
    case 5:
    case 6:
      e2[0] = r2 + o2;
      e2[1] = o2;
      e2[2] = a2 + o2;
  }
}
function computeLuminance(t2) {
  return t2 <= 0.03928 ? t2 / 12.92 : ((t2 + 0.055) / 1.055) ** 2.4;
}
function contrastRatio(t2, e2, i2) {
  HSLToRGB(t2, i2);
  i2.map(computeLuminance);
  const n2 = 0.2126 * i2[0] + 0.7152 * i2[1] + 0.0722 * i2[2];
  HSLToRGB(e2, i2);
  i2.map(computeLuminance);
  const s2 = 0.2126 * i2[0] + 0.7152 * i2[1] + 0.0722 * i2[2];
  return n2 > s2 ? (n2 + 0.05) / (s2 + 0.05) : (s2 + 0.05) / (n2 + 0.05);
}
const X = /* @__PURE__ */ new Map();
function findContrastColor(t2, e2) {
  const i2 = t2[0] + 256 * t2[1] + 65536 * t2[2] + 16777216 * e2[0] + 4294967296 * e2[1] + 1099511627776 * e2[2];
  let n2 = X.get(i2);
  if (n2) return n2;
  const s2 = new Float32Array(9), r2 = s2.subarray(0, 3), a2 = s2.subarray(3, 6);
  RGBToHSL(t2, a2);
  const o2 = s2.subarray(6, 9);
  RGBToHSL(e2, o2);
  const l2 = o2[2] < 0.5, h2 = l2 ? 12 : 4.5;
  a2[2] = l2 ? Math.sqrt(a2[2]) : 1 - Math.sqrt(1 - a2[2]);
  if (contrastRatio(a2, o2, r2) < h2) {
    let t3, e3;
    if (l2) {
      t3 = a2[2];
      e3 = 1;
    } else {
      t3 = 0;
      e3 = a2[2];
    }
    const i3 = 5e-3;
    for (; e3 - t3 > i3; ) {
      const i4 = a2[2] = (t3 + e3) / 2;
      l2 === contrastRatio(a2, o2, r2) < h2 ? t3 = i4 : e3 = i4;
    }
    a2[2] = l2 ? e3 : t3;
  }
  HSLToRGB(a2, r2);
  n2 = Util.makeHexColor(Math.round(255 * r2[0]), Math.round(255 * r2[1]), Math.round(255 * r2[2]));
  X.set(i2, n2);
  return n2;
}
function renderRichText({ html: t2, dir: e2, className: i2 }, n2) {
  const s2 = document.createDocumentFragment();
  if ("string" == typeof t2) {
    const i3 = document.createElement("p");
    i3.dir = e2 || "auto";
    const n3 = t2.split(/\r\n?|\n/);
    for (let t3 = 0, e3 = n3.length; t3 < e3; ++t3) {
      const s3 = n3[t3];
      i3.append(document.createTextNode(s3));
      t3 < e3 - 1 && i3.append(document.createElement("br"));
    }
    s2.append(i3);
  } else XfaLayer.render({ xfaHtml: t2, div: s2, intent: "richText" });
  s2.firstElementChild.classList.add("richText", i2);
  n2.append(s2);
}
function makePathFromDrawOPS(t2) {
  const e2 = new Path2D();
  if (!t2) return e2;
  for (let i2 = 0, n2 = t2.length; i2 < n2; ) switch (t2[i2++]) {
    case B:
      e2.moveTo(t2[i2++], t2[i2++]);
      break;
    case O:
      e2.lineTo(t2[i2++], t2[i2++]);
      break;
    case R:
      e2.bezierCurveTo(t2[i2++], t2[i2++], t2[i2++], t2[i2++], t2[i2++], t2[i2++]);
      break;
    case L:
      e2.quadraticCurveTo(t2[i2++], t2[i2++], t2[i2++], t2[i2++]);
      break;
    case N:
      e2.closePath();
      break;
    default:
      warn(`Unrecognized drawing path operator: ${t2[i2 - 1]}`);
  }
  return e2;
}
class EditorToolbar {
  #r = null;
  #a = null;
  #o;
  #l = null;
  #h = null;
  #c = null;
  #d = null;
  #u = null;
  static #p = null;
  constructor(t2) {
    this.#o = t2;
    EditorToolbar.#p ||= Object.freeze({ freetext: "pdfjs-editor-remove-freetext-button", highlight: "pdfjs-editor-remove-highlight-button", ink: "pdfjs-editor-remove-ink-button", stamp: "pdfjs-editor-remove-stamp-button", signature: "pdfjs-editor-remove-signature-button" });
  }
  render() {
    const t2 = this.#r = document.createElement("div");
    t2.classList.add("editToolbar", "hidden");
    t2.setAttribute("role", "toolbar");
    const e2 = this.#o._uiManager._signal;
    if (e2 instanceof AbortSignal && !e2.aborted) {
      t2.addEventListener("contextmenu", noContextMenu, { signal: e2 });
      t2.addEventListener("pointerdown", EditorToolbar.#g, { signal: e2 });
    }
    const i2 = this.#l = document.createElement("div");
    i2.className = "buttons";
    t2.append(i2);
    const n2 = this.#o.toolbarPosition;
    if (n2) {
      const { style: e3 } = t2, i3 = "ltr" === this.#o._uiManager.direction ? 1 - n2[0] : n2[0];
      e3.insetInlineEnd = 100 * i3 + "%";
      e3.top = `calc(${100 * n2[1]}% + var(--editor-toolbar-vert-offset))`;
    }
    return t2;
  }
  get div() {
    return this.#r;
  }
  static #g(t2) {
    t2.stopPropagation();
  }
  #m(t2) {
    this.#o._focusEventsAllowed = false;
    stopEvent(t2);
  }
  #f(t2) {
    this.#o._focusEventsAllowed = true;
    stopEvent(t2);
  }
  #b(t2) {
    const e2 = this.#o._uiManager._signal;
    if (!(e2 instanceof AbortSignal) || e2.aborted) return false;
    t2.addEventListener("focusin", this.#m.bind(this), { capture: true, signal: e2 });
    t2.addEventListener("focusout", this.#f.bind(this), { capture: true, signal: e2 });
    t2.addEventListener("contextmenu", noContextMenu, { signal: e2 });
    return true;
  }
  hide() {
    this.#r.classList.add("hidden");
    this.#a?.hideDropdown();
  }
  show() {
    this.#r.classList.remove("hidden");
    this.#h?.shown();
    this.#c?.shown();
  }
  addDeleteButton() {
    const { editorType: t2, _uiManager: e2 } = this.#o, i2 = document.createElement("button");
    i2.classList.add("basic", "deleteButton");
    i2.tabIndex = 0;
    i2.setAttribute("data-l10n-id", EditorToolbar.#p[t2]);
    this.#b(i2) && i2.addEventListener("click", (t3) => {
      e2.delete();
    }, { signal: e2._signal });
    this.#l.append(i2);
  }
  get #y() {
    const t2 = document.createElement("div");
    t2.className = "divider";
    return t2;
  }
  async addAltText(t2) {
    const e2 = await t2.render();
    this.#b(e2);
    this.#l.append(e2, this.#y);
    this.#h = t2;
  }
  addComment(t2, e2 = null) {
    if (this.#c) return;
    const i2 = t2.renderForToolbar();
    if (!i2) return;
    this.#b(i2);
    const n2 = this.#d = this.#y;
    if (e2) {
      this.#l.insertBefore(i2, e2);
      this.#l.insertBefore(n2, e2);
    } else this.#l.append(i2, n2);
    this.#c = t2;
    t2.toolbar = this;
  }
  addColorPicker(t2) {
    if (this.#a) return;
    this.#a = t2;
    const e2 = t2.renderButton();
    this.#b(e2);
    this.#l.append(e2, this.#y);
  }
  async addEditSignatureButton(t2) {
    const e2 = this.#u = await t2.renderEditButton(this.#o);
    if (e2) {
      this.#b(e2);
      this.#l.append(e2, this.#y);
    }
  }
  removeButton(t2) {
    if ("comment" === t2) {
      this.#c?.removeToolbarCommentButton();
      this.#c = null;
      this.#d?.remove();
      this.#d = null;
    }
  }
  async addButton(t2, e2) {
    switch (t2) {
      case "colorPicker":
        e2 && this.addColorPicker(e2);
        break;
      case "altText":
        e2 && await this.addAltText(e2);
        break;
      case "editSignature":
        e2 && await this.addEditSignatureButton(e2);
        break;
      case "delete":
        this.addDeleteButton();
        break;
      case "comment":
        e2 && this.addComment(e2);
    }
  }
  async addButtonBefore(t2, e2, i2) {
    if (!e2 && "comment" === t2) return;
    const n2 = this.#l.querySelector(i2);
    n2 && "comment" === t2 && this.addComment(e2, n2);
  }
  updateEditSignatureButton(t2) {
    this.#u && (this.#u.title = t2);
  }
  remove() {
    this.#r.remove();
    this.#a?.destroy();
    this.#a = null;
  }
}
class FloatingToolbar {
  #l = null;
  #r = null;
  #v;
  constructor(t2) {
    this.#v = t2;
  }
  #w() {
    const t2 = this.#r = document.createElement("div");
    t2.className = "editToolbar";
    t2.setAttribute("role", "toolbar");
    t2.dir = this.#v.direction;
    const e2 = this.#v._signal;
    e2 instanceof AbortSignal && !e2.aborted && t2.addEventListener("contextmenu", noContextMenu, { signal: e2 });
    const i2 = this.#l = document.createElement("div");
    i2.className = "buttons";
    t2.append(i2);
    this.#v.hasCommentManager() && this.#A("commentButton", "pdfjs-comment-floating-button", "pdfjs-comment-floating-button-label", () => {
      this.#v.commentSelection("floating_button");
    });
    this.#A("highlightButton", "pdfjs-highlight-floating-button1", "pdfjs-highlight-floating-button-label", () => {
      this.#v.highlightSelection("floating_button");
    });
    return t2;
  }
  #x(t2, e2) {
    let i2 = 0, n2 = 0;
    for (const s2 of t2) {
      const t3 = s2.y + s2.height;
      if (t3 < i2) continue;
      const r2 = s2.x + (e2 ? s2.width : 0);
      if (t3 > i2) {
        n2 = r2;
        i2 = t3;
      } else e2 ? r2 > n2 && (n2 = r2) : r2 < n2 && (n2 = r2);
    }
    return [e2 ? 1 - n2 : n2, i2];
  }
  show(t2, e2, i2) {
    const [n2, s2] = this.#x(e2, i2), { style: r2 } = this.#r ||= this.#w();
    t2.append(this.#r);
    r2.insetInlineEnd = 100 * n2 + "%";
    r2.top = `calc(${100 * s2}% + var(--editor-toolbar-vert-offset))`;
  }
  hide() {
    this.#r.remove();
  }
  #A(t2, e2, i2, n2) {
    const s2 = document.createElement("button");
    s2.classList.add("basic", t2);
    s2.tabIndex = 0;
    s2.setAttribute("data-l10n-id", e2);
    const r2 = document.createElement("span");
    s2.append(r2);
    r2.className = "visuallyHidden";
    r2.setAttribute("data-l10n-id", i2);
    const a2 = this.#v._signal;
    if (a2 instanceof AbortSignal && !a2.aborted) {
      s2.addEventListener("contextmenu", noContextMenu, { signal: a2 });
      s2.addEventListener("click", n2, { signal: a2 });
    }
    this.#l.append(s2);
  }
}
const K = Object.freeze({ internal: "2837668c-d334-48d1-ba74-aa7deba483da" });
function bindEvents(t2, e2, i2) {
  for (const n2 of i2) e2.addEventListener(n2, t2[n2].bind(t2));
}
class CurrentPointers {
  static #C = NaN;
  static #E = null;
  static #S = NaN;
  static #T = null;
  static initializeAndAddPointerId(t2) {
    (CurrentPointers.#E ||= /* @__PURE__ */ new Set()).add(t2);
  }
  static setPointer(t2, e2) {
    CurrentPointers.#C ||= e2;
    CurrentPointers.#T ??= t2;
  }
  static setTimeStamp(t2) {
    CurrentPointers.#S = t2;
  }
  static isSamePointerId(t2) {
    return CurrentPointers.#C === t2;
  }
  static isSamePointerIdOrRemove(t2) {
    if (CurrentPointers.#C === t2) return true;
    CurrentPointers.#E?.delete(t2);
    return false;
  }
  static isSamePointerType(t2) {
    return CurrentPointers.#T === t2;
  }
  static isInitializedAndDifferentPointerType(t2) {
    return null !== CurrentPointers.#T && !CurrentPointers.isSamePointerType(t2);
  }
  static isSameTimeStamp(t2) {
    return CurrentPointers.#S === t2;
  }
  static isUsingMultiplePointers() {
    return CurrentPointers.#E?.size >= 1;
  }
  static clearPointerType() {
    CurrentPointers.#T = null;
  }
  static clearPointerIds() {
    CurrentPointers.#C = NaN;
    CurrentPointers.#E = null;
  }
  static clearTimeStamp() {
    CurrentPointers.#S = NaN;
  }
}
class IdManager {
  #_ = 0;
  get id() {
    return `${m}${this.#_++}`;
  }
}
class ImageManager {
  #k = getUuid();
  #_ = 0;
  #D = null;
  static get _isSVGFittingCanvas() {
    const t2 = `data:image/svg+xml;charset=UTF-8,<svg viewBox="0 0 1 1" width="1" height="1" xmlns="${s}"><rect width="1" height="1" style="fill:red;"/></svg>`, e2 = new OffscreenCanvas(1, 3).getContext("2d", { willReadFrequently: true }), i2 = new Image();
    i2.src = t2;
    return shadow(this, "_isSVGFittingCanvas", i2.decode().then(() => {
      e2.drawImage(i2, 0, 0, 1, 1, 0, 0, 1, 3);
      return 0 === new Uint32Array(e2.getImageData(0, 0, 1, 1).data.buffer)[0];
    }));
  }
  async #P(t2, e2) {
    this.#D ||= /* @__PURE__ */ new Map();
    let i2 = this.#D.get(t2);
    if (null === i2) return null;
    if (i2?.bitmap) {
      i2.refCounter += 1;
      return i2;
    }
    try {
      i2 ||= { bitmap: null, id: `image_${this.#k}_${this.#_++}`, refCounter: 0, isSvg: false };
      let t3;
      if ("string" == typeof e2) {
        i2.url = e2;
        t3 = await fetchData(e2, "blob");
      } else e2 instanceof File ? t3 = i2.file = e2 : e2 instanceof Blob && (t3 = e2);
      if ("image/svg+xml" === t3.type) {
        const e3 = ImageManager._isSVGFittingCanvas, n2 = new FileReader(), s2 = new Image(), r2 = new Promise((t4, r3) => {
          s2.onload = () => {
            i2.bitmap = s2;
            i2.isSvg = true;
            t4();
          };
          n2.onload = async () => {
            const t5 = i2.svgUrl = n2.result;
            s2.src = await e3 ? `${t5}#svgView(preserveAspectRatio(none))` : t5;
          };
          s2.onerror = n2.onerror = r3;
        });
        n2.readAsDataURL(t3);
        await r2;
      } else i2.bitmap = await createImageBitmap(t3);
      i2.refCounter = 1;
    } catch (t3) {
      warn(t3);
      i2 = null;
    }
    this.#D.set(t2, i2);
    i2 && this.#D.set(i2.id, i2);
    return i2;
  }
  async getFromFile(t2) {
    const { lastModified: e2, name: i2, size: n2, type: s2 } = t2;
    return this.#P(`${e2}_${i2}_${n2}_${s2}`, t2);
  }
  async getFromUrl(t2) {
    return this.#P(t2, t2);
  }
  async getFromBlob(t2, e2) {
    const i2 = await e2;
    return this.#P(t2, i2);
  }
  async getFromId(t2) {
    this.#D ||= /* @__PURE__ */ new Map();
    const e2 = this.#D.get(t2);
    if (!e2) return null;
    if (e2.bitmap) {
      e2.refCounter += 1;
      return e2;
    }
    if (e2.file) return this.getFromFile(e2.file);
    if (e2.blobPromise) {
      const { blobPromise: t3 } = e2;
      delete e2.blobPromise;
      return this.getFromBlob(e2.id, t3);
    }
    return this.getFromUrl(e2.url);
  }
  getFromCanvas(t2, e2) {
    this.#D ||= /* @__PURE__ */ new Map();
    let i2 = this.#D.get(t2);
    if (i2?.bitmap) {
      i2.refCounter += 1;
      return i2;
    }
    const n2 = new OffscreenCanvas(e2.width, e2.height);
    n2.getContext("2d").drawImage(e2, 0, 0);
    i2 = { bitmap: n2.transferToImageBitmap(), id: `image_${this.#k}_${this.#_++}`, refCounter: 1, isSvg: false };
    this.#D.set(t2, i2);
    this.#D.set(i2.id, i2);
    return i2;
  }
  getSvgUrl(t2) {
    const e2 = this.#D.get(t2);
    return e2?.isSvg ? e2.svgUrl : null;
  }
  deleteId(t2) {
    this.#D ||= /* @__PURE__ */ new Map();
    const e2 = this.#D.get(t2);
    if (!e2) return;
    e2.refCounter -= 1;
    if (0 !== e2.refCounter) return;
    const { bitmap: i2 } = e2;
    if (!e2.url && !e2.file) {
      const t3 = new OffscreenCanvas(i2.width, i2.height);
      t3.getContext("bitmaprenderer").transferFromImageBitmap(i2);
      e2.blobPromise = t3.convertToBlob();
    }
    i2.close?.();
    e2.bitmap = null;
  }
  isValidId(t2) {
    return t2.startsWith(`image_${this.#k}_`);
  }
}
class CommandManager {
  #M = [];
  #I = false;
  #F;
  #B = -1;
  constructor(t2 = 128) {
    this.#F = t2;
  }
  add({ cmd: t2, undo: e2, post: i2, mustExec: n2, type: s2 = NaN, overwriteIfSameType: r2 = false, keepUndo: a2 = false }) {
    n2 && t2();
    if (this.#I) return;
    const o2 = { cmd: t2, undo: e2, post: i2, type: s2 };
    if (-1 === this.#B) {
      this.#M.length > 0 && (this.#M.length = 0);
      this.#B = 0;
      this.#M.push(o2);
      return;
    }
    if (r2 && this.#M[this.#B].type === s2) {
      a2 && (o2.undo = this.#M[this.#B].undo);
      this.#M[this.#B] = o2;
      return;
    }
    const l2 = this.#B + 1;
    if (l2 === this.#F) this.#M.splice(0, 1);
    else {
      this.#B = l2;
      l2 < this.#M.length && this.#M.splice(l2);
    }
    this.#M.push(o2);
  }
  undo() {
    if (-1 === this.#B) return;
    this.#I = true;
    const { undo: t2, post: e2 } = this.#M[this.#B];
    t2();
    e2?.();
    this.#I = false;
    this.#B -= 1;
  }
  redo() {
    if (this.#B < this.#M.length - 1) {
      this.#B += 1;
      this.#I = true;
      const { cmd: t2, post: e2 } = this.#M[this.#B];
      t2();
      e2?.();
      this.#I = false;
    }
  }
  hasSomethingToUndo() {
    return -1 !== this.#B;
  }
  hasSomethingToRedo() {
    return this.#B < this.#M.length - 1;
  }
  cleanType(t2) {
    if (-1 !== this.#B) {
      for (let e2 = this.#B; e2 >= 0; e2--) if (this.#M[e2].type !== t2) {
        this.#M.splice(e2 + 1, this.#B - e2);
        this.#B = e2;
        return;
      }
      this.#M.length = 0;
      this.#B = -1;
    }
  }
  destroy() {
    this.#M = null;
  }
}
class KeyboardManager {
  static ALT = 1;
  static CTRL = 2;
  static META = 4;
  static SHIFT = 8;
  constructor(t2) {
    this.callbacks = /* @__PURE__ */ new Map();
    const { isMac: e2 } = FeatureTest.platform;
    for (const [i2, n2, s2 = {}] of t2) {
      const t3 = i2.some((t4) => t4.startsWith("mac+"));
      for (const r2 of i2) {
        let i3 = r2;
        if (t3) {
          const t4 = r2.startsWith("mac+");
          if (e2 !== t4) continue;
          t4 && (i3 = r2.slice(4));
        }
        const [a2, o2] = KeyboardManager.#O(i3);
        null !== a2 && this.callbacks.getOrInsertComputed(a2, makeArr).push({ callback: n2, options: s2, modifiers: o2 });
      }
    }
  }
  static #O(t2) {
    let e2 = null, i2 = 0;
    for (let n2 of t2.split("+")) {
      n2 = n2.trim();
      if (!n2) continue;
      const s2 = n2.toUpperCase(), r2 = KeyboardManager[s2];
      if (r2) i2 |= r2;
      else {
        if (null !== e2) {
          warn(`KeyboardManager: multiple keys in shortcut "${t2}"`);
          break;
        }
        e2 = "SPACE" === s2 ? " " : n2;
      }
    }
    null === e2 && warn(`KeyboardManager: no key found in shortcut "${t2}"`);
    return [e2, i2];
  }
  static #R(t2) {
    const e2 = /^(?:Key([A-Z])|(?:Digit|Numpad)(\d))$/.exec(t2);
    return e2 ? e2[1]?.toLowerCase() ?? e2[2] : null;
  }
  exec(t2, e2) {
    let i2 = this.callbacks.get(e2.key);
    if (!i2) {
      if (/^[a-z]$/i.test(e2.key)) return;
      const t3 = KeyboardManager.#R(e2.code);
      if (null === t3 || t3 === e2.key) return;
      i2 = this.callbacks.get(t3);
      if (!i2) return;
    }
    const n2 = (e2.altKey ? KeyboardManager.ALT : 0) | (e2.ctrlKey ? KeyboardManager.CTRL : 0) | (e2.metaKey ? KeyboardManager.META : 0) | (e2.shiftKey ? KeyboardManager.SHIFT : 0), s2 = i2.find((t3) => t3.modifiers === n2);
    if (!s2) return;
    const { callback: r2, options: { bubbles: a2 = false, args: o2 = [], checker: l2 = null } } = s2;
    if (!l2 || l2(t2, e2)) {
      r2.bind(t2, ...o2, e2)();
      a2 || stopEvent(e2);
    }
  }
}
class ColorManager {
  static _colorsMapping = /* @__PURE__ */ new Map([["CanvasText", [0, 0, 0]], ["Canvas", [255, 255, 255]]]);
  get _colors() {
    const t2 = /* @__PURE__ */ new Map([["CanvasText", null], ["Canvas", null]]);
    !(function getColorValues(t3) {
      const e2 = document.createElement("span");
      e2.style.visibility = "hidden";
      e2.style.colorScheme = "only light";
      document.body.append(e2);
      for (const i2 of t3.keys()) {
        e2.style.color = i2;
        const n2 = window.getComputedStyle(e2).color;
        t3.set(i2, getRGB(n2));
      }
      e2.remove();
    })(t2);
    return shadow(this, "_colors", t2);
  }
  convert(t2) {
    const e2 = getRGB(t2);
    if (!window.matchMedia("(forced-colors: active)").matches) return e2;
    for (const [t3, i2] of this._colors) if (i2.every((t4, i3) => t4 === e2[i3])) return ColorManager._colorsMapping.get(t3);
    return e2;
  }
  getHexCode(t2) {
    const e2 = this._colors.get(t2);
    return e2 ? Util.makeHexColor(...e2) : t2;
  }
}
class AnnotationEditorUIManager {
  #L = new AbortController();
  #N = null;
  #U = null;
  #H = /* @__PURE__ */ new Map();
  #z = /* @__PURE__ */ new Map();
  #G = null;
  #V = null;
  #W = null;
  #$ = null;
  #j = null;
  #X = new CommandManager();
  #K = null;
  #Y = null;
  #q = null;
  #Q = 0;
  #J = /* @__PURE__ */ new Set();
  #Z = null;
  #tt = null;
  #et = /* @__PURE__ */ new Set();
  _editorUndoBar = null;
  #it = false;
  #nt = false;
  #st = false;
  #rt = null;
  #at = null;
  #ot = null;
  #lt = null;
  #ht = false;
  #ct = null;
  #dt = new IdManager();
  #ut = false;
  #pt = false;
  #gt = false;
  #mt = null;
  #ft = null;
  #bt = null;
  #yt = null;
  #vt = null;
  #wt = f.NONE;
  #At = /* @__PURE__ */ new Set();
  #xt = null;
  #Ct = null;
  #Et = null;
  #St = null;
  #Tt = null;
  #_t = { isEditing: false, isEmpty: true, hasSomethingToUndo: false, hasSomethingToRedo: false, hasSelectedEditor: false, hasSelectedText: false };
  #kt = [0, 0];
  #Dt = null;
  #Pt = null;
  #Mt = null;
  #It = null;
  #Ft = null;
  static TRANSLATE_SMALL = 1;
  static TRANSLATE_BIG = 10;
  static get _keyboardManager() {
    const t2 = AnnotationEditorUIManager.prototype, arrowChecker = (t3) => t3.#Pt.contains(document.activeElement) && "BUTTON" !== document.activeElement.tagName && t3.hasSomethingToControl(), textInputChecker = (t3, { target: e3 }) => {
      if (e3 instanceof HTMLInputElement) {
        const { type: t4 } = e3;
        return "text" !== t4 && "number" !== t4;
      }
      return true;
    }, e2 = this.TRANSLATE_SMALL, i2 = this.TRANSLATE_BIG;
    return shadow(this, "_keyboardManager", new KeyboardManager([[["ctrl+a", "mac+meta+a"], t2.selectAll, { checker: textInputChecker }], [["ctrl+z", "mac+meta+z"], t2.undo, { checker: textInputChecker }], [["ctrl+y", "ctrl+shift+z", "mac+meta+shift+z", "ctrl+shift+Z", "mac+meta+shift+Z"], t2.redo, { checker: textInputChecker }], [["Backspace", "alt+Backspace", "ctrl+Backspace", "shift+Backspace", "mac+Backspace", "mac+alt+Backspace", "mac+ctrl+Backspace", "Delete", "ctrl+Delete", "shift+Delete", "mac+Delete"], t2.delete, { checker: textInputChecker }], [["Enter"], t2.addNewEditorFromKeyboard, { checker: (t3, { target: e3 }) => !(e3 instanceof HTMLButtonElement) && t3.#Pt.contains(e3) && !t3.isEnterHandled }], [["Space"], t2.addNewEditorFromKeyboard, { checker: (t3, { target: e3 }) => !(e3 instanceof HTMLButtonElement) && t3.#Pt.contains(document.activeElement) }], [["Escape"], t2.unselectAll], [["ArrowLeft"], t2.translateSelectedEditors, { args: [-e2, 0], checker: arrowChecker }], [["ctrl+ArrowLeft", "mac+shift+ArrowLeft"], t2.translateSelectedEditors, { args: [-i2, 0], checker: arrowChecker }], [["ArrowRight"], t2.translateSelectedEditors, { args: [e2, 0], checker: arrowChecker }], [["ctrl+ArrowRight", "mac+shift+ArrowRight"], t2.translateSelectedEditors, { args: [i2, 0], checker: arrowChecker }], [["ArrowUp"], t2.translateSelectedEditors, { args: [0, -e2], checker: arrowChecker }], [["ctrl+ArrowUp", "mac+shift+ArrowUp"], t2.translateSelectedEditors, { args: [0, -i2], checker: arrowChecker }], [["ArrowDown"], t2.translateSelectedEditors, { args: [0, e2], checker: arrowChecker }], [["ctrl+ArrowDown", "mac+shift+ArrowDown"], t2.translateSelectedEditors, { args: [0, i2], checker: arrowChecker }]]));
  }
  constructor(t2, e2, i2, n2, s2, r2, a2, o2, l2, h2, c2, d2, u2, p2, g2, m2) {
    const f2 = this._signal = this.#L.signal;
    this.#Pt = t2;
    this.#Mt = e2;
    this.#It = i2;
    this.#W = n2;
    this.#K = s2;
    this.#Ct = r2;
    this.#Tt = o2;
    this._eventBus = a2;
    const b2 = { signal: f2, ...K };
    a2.on("editingaction", this.onEditingAction.bind(this), b2);
    a2.on("pagechanging", this.onPageChanging.bind(this), b2);
    a2.on("scalechanging", this.onScaleChanging.bind(this), b2);
    a2.on("rotationchanging", this.onRotationChanging.bind(this), b2);
    a2.on("setpreference", this.onSetPreference.bind(this), b2);
    a2.on("switchannotationeditorparams", (t3) => this.updateParams(t3.type, t3.value), b2);
    window.addEventListener("pointerdown", () => {
      this.#pt = true;
    }, { capture: true, signal: f2 });
    window.addEventListener("pointerup", () => {
      this.#pt = false;
    }, { capture: true, signal: f2 });
    window.addEventListener("beforeunload", this.endCurrentEditing.bind(this), { capture: true, signal: f2 });
    this.#Bt();
    this.#Ot();
    this.#Rt();
    this.#$ = o2.annotationStorage;
    this.#rt = o2.filterFactory;
    this.#Et = l2;
    this.#lt = h2 || null;
    this.#it = c2;
    this.#nt = d2;
    this.#st = u2;
    this.#vt = p2 || null;
    this.viewParameters = { realScale: PixelsPerInch.PDF_TO_CSS_UNITS, rotation: 0 };
    this.isShiftKeyDown = false;
    this._editorUndoBar = g2 || null;
    this._supportsPinchToZoom = false !== m2;
    s2?.setSidebarUiManager(this);
  }
  destroy() {
    this.#Ft?.resolve();
    this.#Ft = null;
    this.#L?.abort();
    this.#L = null;
    this._signal = null;
    for (const t2 of this.#z.values()) t2.destroy();
    this.#z.clear();
    this.#H.clear();
    this.#et.clear();
    this.#yt?.clear();
    this.#N = null;
    this.#At.clear();
    this.#X.destroy();
    this.#W?.destroy();
    this.#K?.destroy();
    this.#Ct?.destroy();
    this.#ct?.hide();
    this.#ct = null;
    this.#bt?.destroy();
    this.#bt = null;
    this.#U = null;
    if (this.#at) {
      clearTimeout(this.#at);
      this.#at = null;
    }
    if (this.#Dt) {
      clearTimeout(this.#Dt);
      this.#Dt = null;
    }
    this._editorUndoBar?.destroy();
    this.#Tt = null;
  }
  combinedSignal(t2) {
    return AbortSignal.any([this._signal, t2.signal]);
  }
  get mlManager() {
    return this.#vt;
  }
  get useNewAltTextFlow() {
    return this.#nt;
  }
  get useNewAltTextWhenAddingImage() {
    return this.#st;
  }
  get hcmFilter() {
    return shadow(this, "hcmFilter", this.#Et ? this.#rt.addHCMFilter(this.#Et.foreground, this.#Et.background) : "none");
  }
  get direction() {
    return shadow(this, "direction", getComputedStyle(this.#Pt).direction);
  }
  get _highlightColors() {
    return shadow(this, "_highlightColors", this.#lt ? new Map(this.#lt.split(",").map((t2) => {
      (t2 = t2.split("=").map((t3) => t3.trim()))[1] = t2[1].toUpperCase();
      return t2;
    })) : null);
  }
  get highlightColors() {
    const { _highlightColors: t2 } = this;
    if (!t2) return shadow(this, "highlightColors", null);
    const e2 = /* @__PURE__ */ new Map(), i2 = !!this.#Et;
    for (const [n2, s2] of t2) {
      const t3 = n2.endsWith("_HCM");
      i2 && t3 ? e2.set(n2.replace("_HCM", ""), s2) : i2 || t3 || e2.set(n2, s2);
    }
    return shadow(this, "highlightColors", e2);
  }
  get highlightColorNames() {
    return shadow(this, "highlightColorNames", this.highlightColors ? new Map(Array.from(this.highlightColors, (t2) => t2.reverse())) : null);
  }
  getNonHCMColor(t2) {
    if (!this._highlightColors) return t2;
    const e2 = this.highlightColorNames.get(t2);
    return this._highlightColors.get(e2) || t2;
  }
  getNonHCMColorName(t2) {
    return this.highlightColorNames.get(t2) || t2;
  }
  setCurrentDrawingSession(t2) {
    if (t2) {
      this.unselectAll();
      this.disableUserSelect(true);
    } else this.disableUserSelect(false);
    this.#q = t2;
  }
  setMainHighlightColorPicker(t2) {
    this.#bt = t2;
  }
  editAltText(t2, e2 = false) {
    this.#W?.editAltText(this, t2, e2);
  }
  hasCommentManager() {
    return !!this.#K;
  }
  editComment(t2, e2, i2, n2) {
    this.#K?.showDialog(this, t2, e2, i2, n2);
  }
  selectComment(t2, e2) {
    const i2 = this.#z.get(t2), n2 = i2?.getEditorByUID(e2);
    n2?.toggleComment(true, true);
  }
  updateComment(t2) {
    this.#K?.updateComment(t2.getData());
  }
  updatePopupColor(t2) {
    this.#K?.updatePopupColor(t2);
  }
  removeComment(t2) {
    this.#K?.removeComments([t2.uid]);
  }
  deleteComment(t2, e2) {
    const undo = () => {
      t2.comment = e2;
    };
    this.addCommands({ cmd: () => {
      this._editorUndoBar?.show(undo, "comment");
      this.toggleComment(null);
      t2.comment = null;
    }, undo, mustExec: true });
  }
  toggleComment(t2, e2, i2 = void 0) {
    this.#K?.toggleCommentPopup(t2, e2, i2);
  }
  makeCommentColor(t2, e2) {
    return t2 && this.#K?.makeCommentColor(t2, e2) || null;
  }
  getCommentDialogElement() {
    return this.#K?.dialogElement || null;
  }
  async waitForEditorsRendered(t2) {
    if (this.#z.has(t2 - 1)) return;
    const { resolve: e2, promise: i2 } = Promise.withResolvers(), onEditorsRendered = (i3) => {
      if (i3.pageNumber === t2) {
        this._eventBus.off("editorsrendered", onEditorsRendered);
        e2();
      }
    };
    this._eventBus.on("editorsrendered", onEditorsRendered, K);
    await i2;
  }
  getSignature(t2) {
    this.#Ct?.getSignature({ uiManager: this, editor: t2 });
  }
  get signatureManager() {
    return this.#Ct;
  }
  switchToMode(t2, e2) {
    this._eventBus.on("annotationeditormodechanged", e2, { once: true, signal: this._signal, ...K });
    this._eventBus.dispatch("showannotationeditorui", { source: this, mode: t2 });
  }
  setPreference(t2, e2) {
    this._eventBus.dispatch("setpreference", { source: this, name: t2, value: e2 });
  }
  onSetPreference({ name: t2, value: e2 }) {
    if ("enableNewAltTextWhenAddingImage" === t2) this.#st = e2;
  }
  onPageChanging({ pageNumber: t2 }) {
    this.#Q = t2 - 1;
  }
  deletePage(t2) {
    for (const e2 of this.getEditors(t2)) e2.remove();
    this.#z.delete(t2);
    this.#Q === t2 && (this.#Q = 0);
  }
  focusMainContainer() {
    this.#Pt.focus();
  }
  findParent(t2, e2) {
    for (const i2 of this.#z.values()) {
      const { x: n2, y: s2, width: r2, height: a2 } = i2.div.getBoundingClientRect();
      if (t2 >= n2 && t2 <= n2 + r2 && e2 >= s2 && e2 <= s2 + a2) return i2;
    }
    return null;
  }
  disableUserSelect(t2 = false) {
    this.#Mt.classList.toggle("noUserSelect", t2);
  }
  addShouldRescale(t2) {
    this.#et.add(t2);
  }
  removeShouldRescale(t2) {
    this.#et.delete(t2);
  }
  onScaleChanging({ scale: t2 }) {
    this.commitOrRemove();
    this.viewParameters.realScale = t2 * PixelsPerInch.PDF_TO_CSS_UNITS;
    for (const t3 of this.#et) t3.onScaleChanging();
    this.#q?.onScaleChanging();
  }
  onRotationChanging({ pagesRotation: t2 }) {
    this.commitOrRemove();
    this.viewParameters.rotation = t2;
  }
  #Lt({ anchorNode: t2 }) {
    return t2.nodeType === Node.TEXT_NODE ? t2.parentElement : t2;
  }
  #Nt(t2) {
    const { currentLayer: e2 } = this;
    if (e2.hasTextLayer(t2)) return e2;
    for (const e3 of this.#z.values()) if (e3.hasTextLayer(t2)) return e3;
    return null;
  }
  highlightSelection(t2 = "", e2 = false) {
    const i2 = document.getSelection();
    if (!i2 || i2.isCollapsed) return;
    const { anchorNode: n2, anchorOffset: s2, focusNode: r2, focusOffset: a2 } = i2, o2 = i2.toString(), l2 = this.#Lt(i2).closest(".textLayer"), h2 = this.getSelectionBoxes(l2);
    if (!h2) return;
    i2.empty();
    const c2 = this.#Nt(l2), d2 = this.#wt === f.NONE, callback = () => {
      const i3 = c2?.createAndAddNewEditor({ x: 0, y: 0 }, false, { methodOfCreation: t2, boxes: h2, anchorNode: n2, anchorOffset: s2, focusNode: r2, focusOffset: a2, text: o2 });
      d2 && this.showAllEditors("highlight", true, true);
      e2 && i3?.editComment();
    };
    d2 ? this.switchToMode(f.HIGHLIGHT, callback) : callback();
  }
  commentSelection(t2 = "") {
    this.highlightSelection(t2, true);
  }
  endCurrentEditing() {
    this.commitOrRemove();
    this.currentLayer?.endDrawingSession(false);
  }
  #Ut() {
    const t2 = document.getSelection();
    if (!t2 || t2.isCollapsed) return;
    const e2 = this.#Lt(t2).closest(".textLayer"), i2 = this.getSelectionBoxes(e2);
    if (i2) {
      this.#ct ||= new FloatingToolbar(this);
      this.#ct.show(e2, i2, "ltr" === this.direction);
    }
  }
  getAndRemoveDataFromAnnotationStorage(t2) {
    if (!this.#$) return null;
    const e2 = `${m}${t2}`, i2 = this.#$.getRawValue(e2);
    i2 && this.#$.remove(e2);
    return i2;
  }
  addToAnnotationStorage(t2) {
    t2.isEmpty() || !this.#$ || this.#$.has(t2.id) || this.#$.setValue(t2.id, t2);
  }
  a11yAlert(t2, e2 = null) {
    const i2 = this.#It;
    if (i2) {
      i2.setAttribute("data-l10n-id", t2);
      e2 ? i2.setAttribute("data-l10n-args", JSON.stringify(e2)) : i2.removeAttribute("data-l10n-args");
    }
  }
  #Ht() {
    const t2 = document.getSelection();
    if (!t2 || t2.isCollapsed) {
      if (this.#xt) {
        this.#ct?.hide();
        this.#xt = null;
        this.#zt({ hasSelectedText: false });
      }
      return;
    }
    const { anchorNode: e2 } = t2;
    if (e2 === this.#xt) return;
    const i2 = this.#Lt(t2).closest(".textLayer");
    if (i2) {
      this.#ct?.hide();
      this.#xt = e2;
      this.#zt({ hasSelectedText: true });
      if (this.#wt === f.HIGHLIGHT || this.#wt === f.NONE) {
        this.#wt === f.HIGHLIGHT && this.showAllEditors("highlight", true, true);
        this.#ht = this.isShiftKeyDown;
        if (!this.isShiftKeyDown) {
          const t3 = this.#wt === f.HIGHLIGHT ? this.#Nt(i2) : null;
          t3?.toggleDrawing();
          if (this.#pt) {
            const e3 = new AbortController(), i3 = this.combinedSignal(e3), pointerup = (i4) => {
              if ("pointerup" !== i4.type || 0 === i4.button) {
                e3.abort();
                t3?.toggleDrawing(true);
                "pointerup" === i4.type && this.#Gt("main_toolbar");
              }
            };
            window.addEventListener("pointerup", pointerup, { signal: i3 });
            window.addEventListener("blur", pointerup, { signal: i3 });
          } else {
            t3?.toggleDrawing(true);
            this.#Gt("main_toolbar");
          }
        }
      }
    } else if (this.#xt) {
      this.#ct?.hide();
      this.#xt = null;
      this.#zt({ hasSelectedText: false });
    }
  }
  #Gt(t2 = "") {
    this.#wt === f.HIGHLIGHT ? this.highlightSelection(t2) : this.#it && this.#Ut();
  }
  #Bt() {
    document.addEventListener("selectionchange", this.#Ht.bind(this), { signal: this._signal });
  }
  #Vt() {
    if (this.#ot) return;
    this.#ot = new AbortController();
    const t2 = this.combinedSignal(this.#ot);
    window.addEventListener("focus", this.focus.bind(this), { signal: t2 });
    window.addEventListener("blur", this.blur.bind(this), { signal: t2 });
  }
  #Wt() {
    this.#ot?.abort();
    this.#ot = null;
  }
  blur() {
    this.isShiftKeyDown = false;
    if (this.#ht) {
      this.#ht = false;
      this.#Gt("main_toolbar");
    }
    if (!this.hasSelection) return;
    const { activeElement: t2 } = document;
    for (const e2 of this.#At) if (e2.div.contains(t2)) {
      this.#ft = [e2, t2];
      e2._focusEventsAllowed = false;
      break;
    }
  }
  focus() {
    if (!this.#ft) return;
    const [t2, e2] = this.#ft;
    this.#ft = null;
    e2.addEventListener("focusin", () => {
      t2._focusEventsAllowed = true;
    }, { once: true, signal: this._signal });
    e2.focus();
  }
  #Rt() {
    if (this.#mt) return;
    this.#mt = new AbortController();
    const t2 = this.combinedSignal(this.#mt);
    window.addEventListener("keydown", this.keydown.bind(this), { signal: t2 });
    window.addEventListener("keyup", this.keyup.bind(this), { signal: t2 });
  }
  #$t() {
    this.#mt?.abort();
    this.#mt = null;
  }
  #jt() {
    if (this.#Y) return;
    this.#Y = new AbortController();
    const t2 = this.combinedSignal(this.#Y);
    document.addEventListener("copy", this.copy.bind(this), { signal: t2 });
    document.addEventListener("cut", this.cut.bind(this), { signal: t2 });
    document.addEventListener("paste", this.paste.bind(this), { signal: t2 });
  }
  #Xt() {
    this.#Y?.abort();
    this.#Y = null;
  }
  #Ot() {
    const t2 = this._signal;
    document.addEventListener("dragover", this.dragOver.bind(this), { signal: t2 });
    document.addEventListener("drop", this.drop.bind(this), { signal: t2 });
  }
  addEditListeners() {
    this.#Rt();
    this.setEditingState(true);
  }
  removeEditListeners() {
    this.#$t();
    this.setEditingState(false);
  }
  dragOver(t2) {
    for (const { type: e2 } of t2.dataTransfer.items) for (const i2 of this.#tt) if (i2.isHandlingMimeForPasting(e2)) {
      t2.dataTransfer.dropEffect = "copy";
      t2.preventDefault();
      return;
    }
  }
  drop(t2) {
    for (const e2 of t2.dataTransfer.items) for (const i2 of this.#tt) if (i2.isHandlingMimeForPasting(e2.type)) {
      i2.paste(e2, this.currentLayer);
      t2.preventDefault();
      return;
    }
  }
  copy(t2) {
    t2.preventDefault();
    this.#N?.commitOrRemove();
    if (!this.hasSelection) return;
    const e2 = [];
    for (const t3 of this.#At) {
      const i2 = t3.serialize(true);
      i2 && e2.push(i2);
    }
    0 !== e2.length && t2.clipboardData.setData("application/pdfjs", JSON.stringify(e2));
  }
  cut(t2) {
    this.copy(t2);
    this.delete();
  }
  async paste(t2) {
    t2.preventDefault();
    const { clipboardData: e2 } = t2;
    for (const t3 of e2.items) for (const e3 of this.#tt) if (e3.isHandlingMimeForPasting(t3.type)) {
      e3.paste(t3, this.currentLayer);
      return;
    }
    let i2 = e2.getData("application/pdfjs");
    if (!i2) return;
    try {
      i2 = JSON.parse(i2);
    } catch (t3) {
      warn(`paste: "${t3.message}".`);
      return;
    }
    if (!Array.isArray(i2)) return;
    this.unselectAll();
    const n2 = this.currentLayer;
    try {
      const t3 = [];
      for (const e3 of i2) {
        const i3 = await n2.deserialize(e3);
        if (!i3) return;
        t3.push(i3);
      }
      const cmd = () => {
        for (const e3 of t3) this.#Kt(e3);
        this.#Yt(t3);
      }, undo = () => {
        for (const e3 of t3) e3.remove();
      };
      this.addCommands({ cmd, undo, mustExec: true });
    } catch (t3) {
      warn(`paste: "${t3.message}".`);
    }
  }
  keydown(t2) {
    this.isShiftKeyDown || "Shift" !== t2.key || (this.isShiftKeyDown = true);
    this.#wt === f.NONE || this.isEditorHandlingKeyboard || AnnotationEditorUIManager._keyboardManager.exec(this, t2);
  }
  keyup(t2) {
    if (this.isShiftKeyDown && "Shift" === t2.key) {
      this.isShiftKeyDown = false;
      if (this.#ht) {
        this.#ht = false;
        this.#Gt("main_toolbar");
      }
    }
  }
  onEditingAction({ name: t2 }) {
    switch (t2) {
      case "undo":
      case "redo":
      case "delete":
      case "selectAll":
        this[t2]();
        break;
      case "highlightSelection":
        this.highlightSelection("context_menu");
        break;
      case "commentSelection":
        this.commentSelection("context_menu");
    }
  }
  updatePageIndex(t2, e2) {
    for (const i3 of this.#V.get(t2) || []) i3.pageIndex = e2;
    const i2 = this.#G.get(t2);
    if (i2) {
      i2.pageIndex = e2;
      this.#z.set(e2, i2);
      this.#ut ? i2.enable() : i2.disable();
    }
  }
  startUpdatePages() {
    this.#G = new Map(this.#z);
    this.#z.clear();
    const t2 = this.#V = /* @__PURE__ */ new Map(), saveEditor = (e2) => {
      t2.getOrInsertComputed(e2.pageIndex, makeArr).push(e2);
    };
    for (const t3 of this.#H.values()) saveEditor(t3);
    for (const [t3, e2] of this.#$) t3.startsWith(m) && !this.#H.has(t3) && Number.isInteger(e2?.pageIndex) && saveEditor(e2);
  }
  endUpdatePages() {
    this.#G = null;
    this.#V = null;
  }
  clonePage(t2, e2) {
    for (const i2 of this.getEditors(t2)) {
      const t3 = i2.serialize(i2.mode !== f.HIGHLIGHT);
      if (t3) {
        t3.pageIndex = e2;
        t3.id = this.getId();
        t3.isClone = true;
        delete t3.popupRef;
        this.#$.setValue(t3.id, t3);
      }
    }
  }
  findClonesForPage(t2) {
    const e2 = [], { pageIndex: i2 } = t2;
    for (const [n2, s2] of this.#$) if (s2.pageIndex === i2 && s2.isClone) {
      this.#$.remove(n2);
      e2.push(t2.deserialize(s2).then((e3) => {
        if (e3) {
          e3.isClone = true;
          t2.addOrRebuild(e3);
        }
      }));
    }
    return Promise.all(e2);
  }
  #zt(t2) {
    if (Object.entries(t2).some(([t3, e2]) => this.#_t[t3] !== e2)) {
      this._eventBus.dispatch("editingstateschanged", { source: this, details: Object.assign(this.#_t, t2) });
      this.#wt === f.HIGHLIGHT && false === t2.hasSelectedEditor && this.#qt([[b.HIGHLIGHT_FREE, true]]);
    }
  }
  #qt(t2) {
    this._eventBus.dispatch("annotationeditorparamschanged", { source: this, details: t2 });
  }
  setEditingState(t2) {
    if (t2) {
      this.#Vt();
      this.#jt();
      this.#zt({ isEditing: this.#wt !== f.NONE, isEmpty: this.#Qt(), hasSomethingToUndo: this.#X.hasSomethingToUndo(), hasSomethingToRedo: this.#X.hasSomethingToRedo(), hasSelectedEditor: false });
    } else {
      this.#Wt();
      this.#Xt();
      this.#zt({ isEditing: false });
      this.disableUserSelect(false);
    }
  }
  registerEditorTypes(t2) {
    if (!this.#tt) {
      this.#tt = t2;
      for (const t3 of this.#tt) this.#qt(t3.defaultPropertiesToUpdate);
    }
  }
  getId() {
    return this.#dt.id;
  }
  get currentLayer() {
    return this.#z.get(this.#Q);
  }
  getLayer(t2) {
    return this.#z.get(t2);
  }
  get currentPageIndex() {
    return this.#Q;
  }
  addLayer(t2) {
    this.#z.set(t2.pageIndex, t2);
    this.#ut ? t2.enable() : t2.disable();
  }
  removeLayer(t2) {
    this.#z.delete(t2.pageIndex);
  }
  async updateMode(t2, e2 = null, i2 = false, n2 = false, s2 = false, r2 = false) {
    if (this.#wt !== t2) {
      if (this.#Ft) {
        await this.#Ft.promise;
        if (!this.#Ft) return;
      }
      this.#Ft = Promise.withResolvers();
      this.#q?.commitOrRemove();
      this.#wt === f.POPUP && this.#K?.hideSidebar();
      this.#K?.destroyPopup();
      this.#wt = t2;
      if (t2 !== f.NONE) {
        for (const t3 of this.#H.values()) t3.addStandaloneCommentButton();
        t2 === f.SIGNATURE && await this.#Ct?.loadSignatures();
        i2 && CurrentPointers.clearPointerType();
        this.setEditingState(true);
        await this.#Jt();
        this.unselectAll();
        for (const e3 of this.#z.values()) e3.updateMode(t2);
        if (t2 === f.POPUP) {
          this.#U ||= await this.#Tt.getAnnotationsByType(new Set(this.#tt.map((t4) => t4._editorType)));
          const t3 = /* @__PURE__ */ new Set(), e3 = [];
          for (const i3 of this.#H.values()) {
            const { annotationElementId: n3, hasComment: s3, deleted: r3 } = i3;
            n3 && t3.add(n3);
            s3 && !r3 && e3.push(i3.getData());
          }
          for (const i3 of this.#U) {
            const { id: n3, popupRef: s3, contentsObj: r3 } = i3;
            s3 && r3?.str && !t3.has(n3) && !this.#J.has(n3) && e3.push(i3);
          }
          this.#K?.showSidebar(e3);
        }
        if (e2) {
          for (const t3 of this.#H.values()) if (t3.uid === e2) {
            this.setSelected(t3);
            r2 ? t3.editComment() : s2 ? t3.enterInEditMode() : t3.focus();
          } else t3.unselect();
          this.#Ft.resolve();
        } else {
          n2 && this.addNewEditorFromKeyboard();
          this.#Ft.resolve();
        }
      } else {
        this.setEditingState(false);
        this.#Zt();
        for (const t3 of this.#H.values()) t3.hideStandaloneCommentButton();
        this._editorUndoBar?.hide();
        this.toggleComment(null);
        this.#Ft.resolve();
      }
    }
  }
  addNewEditorFromKeyboard() {
    this.currentLayer.canCreateNewEmptyEditor() && this.currentLayer.addNewEditor();
  }
  updateToolbar(t2) {
    t2.mode !== this.#wt && this._eventBus.dispatch("switchannotationeditormode", { source: this, ...t2 });
  }
  updateParams(t2, e2) {
    if (this.#tt) {
      switch (t2) {
        case b.CREATE:
          this.currentLayer.addNewEditor(e2);
          return;
        case b.HIGHLIGHT_SHOW_ALL:
          this._eventBus.dispatch("reporttelemetry", { source: this, details: { type: "editing", data: { type: "highlight", action: "toggle_visibility" } } });
          (this.#St ||= /* @__PURE__ */ new Map()).set(t2, e2);
          this.showAllEditors("highlight", e2);
      }
      if (this.hasSelection) for (const i2 of this.#At) i2.updateParams(t2, e2);
      else for (const i2 of this.#tt) i2.updateDefaultParams(t2, e2);
    }
  }
  showAllEditors(t2, e2, i2 = false) {
    for (const i3 of this.#H.values()) i3.editorType === t2 && i3.show(e2);
    (this.#St?.get(b.HIGHLIGHT_SHOW_ALL) ?? true) !== e2 && this.#qt([[b.HIGHLIGHT_SHOW_ALL, e2]]);
  }
  enableWaiting(t2 = false) {
    if (this.#gt !== t2) {
      this.#gt = t2;
      for (const e2 of this.#z.values()) {
        t2 ? e2.disableClick() : e2.enableClick();
        e2.div.classList.toggle("waiting", t2);
      }
    }
  }
  async #Jt() {
    if (!this.#ut) {
      this.#ut = true;
      const t2 = [];
      for (const e2 of this.#z.values()) t2.push(e2.enable());
      await Promise.all(t2);
      for (const t3 of this.#H.values()) t3.enable();
    }
  }
  #Zt() {
    this.unselectAll();
    if (this.#ut) {
      this.#ut = false;
      for (const t2 of this.#z.values()) t2.disable();
      for (const t2 of this.#H.values()) t2.disable();
    }
  }
  *getEditors(t2) {
    for (const e2 of this.#H.values()) e2.pageIndex === t2 && (yield e2);
  }
  getEditor(t2) {
    return this.#H.get(t2);
  }
  addEditor(t2) {
    this.#H.set(t2.id, t2);
  }
  removeEditor(t2) {
    if (t2.div.contains(document.activeElement)) {
      this.#at && clearTimeout(this.#at);
      this.#at = setTimeout(() => {
        this.focusMainContainer();
        this.#at = null;
      }, 0);
    }
    this.#H.delete(t2.id);
    t2.annotationElementId && this.#yt?.delete(t2.annotationElementId);
    this.unselect(t2);
    t2.annotationElementId && this.#J.has(t2.annotationElementId) || this.#$?.remove(t2.id);
  }
  addDeletedAnnotationElement(t2) {
    this.#J.add(t2.annotationElementId);
    this.addChangedExistingAnnotation(t2);
    t2.deleted = true;
  }
  isDeletedAnnotationElement(t2) {
    return this.#J.has(t2);
  }
  removeDeletedAnnotationElement(t2) {
    this.#J.delete(t2.annotationElementId);
    this.removeChangedExistingAnnotation(t2);
    t2.deleted = false;
  }
  #Kt(t2) {
    const e2 = this.#z.get(t2.pageIndex);
    if (e2) e2.addOrRebuild(t2);
    else {
      this.addEditor(t2);
      this.addToAnnotationStorage(t2);
    }
  }
  setActiveEditor(t2) {
    if (this.#N !== t2) {
      this.#N = t2;
      t2 && this.#qt(t2.propertiesToUpdate);
    }
  }
  get #te() {
    let t2 = null;
    for (t2 of this.#At) ;
    return t2;
  }
  updateUI(t2) {
    this.#te === t2 && this.#qt(t2.propertiesToUpdate);
  }
  updateUIForDefaultProperties(t2) {
    this.#qt(t2.defaultPropertiesToUpdate);
  }
  toggleSelected(t2) {
    if (this.#At.has(t2)) {
      this.#At.delete(t2);
      t2.unselect();
      this.#zt({ hasSelectedEditor: this.hasSelection });
    } else {
      this.#At.add(t2);
      t2.select();
      this.#qt(t2.propertiesToUpdate);
      this.#zt({ hasSelectedEditor: true });
    }
  }
  setSelected(t2) {
    this.updateToolbar({ mode: t2.mode, editId: t2.uid });
    this.#q?.commitOrRemove();
    for (const e2 of this.#At) e2 !== t2 && e2.unselect();
    this.#K?.destroyPopup();
    this.#At.clear();
    this.#At.add(t2);
    t2.select();
    this.#qt(t2.propertiesToUpdate);
    this.#zt({ hasSelectedEditor: true });
  }
  get firstSelectedEditor() {
    return this.#At.values().next().value;
  }
  unselect(t2) {
    t2.unselect();
    this.#At.delete(t2);
    this.#zt({ hasSelectedEditor: this.hasSelection });
  }
  get hasSelection() {
    return 0 !== this.#At.size;
  }
  get isEnterHandled() {
    return 1 === this.#At.size && this.firstSelectedEditor.isEnterHandled;
  }
  undo() {
    this.#X.undo();
    this.#zt({ hasSomethingToUndo: this.#X.hasSomethingToUndo(), hasSomethingToRedo: true, isEmpty: this.#Qt() });
    this._editorUndoBar?.hide();
  }
  redo() {
    this.#X.redo();
    this.#zt({ hasSomethingToUndo: true, hasSomethingToRedo: this.#X.hasSomethingToRedo(), isEmpty: this.#Qt() });
  }
  addCommands(t2) {
    this.#X.add(t2);
    this.#zt({ hasSomethingToUndo: true, hasSomethingToRedo: false, isEmpty: this.#Qt() });
  }
  cleanUndoStack(t2) {
    this.#X.cleanType(t2);
  }
  #Qt() {
    if (0 === this.#H.size) return true;
    if (1 === this.#H.size) for (const t2 of this.#H.values()) return t2.isEmpty();
    return false;
  }
  delete() {
    this.commitOrRemove();
    const t2 = this.currentLayer?.endDrawingSession(true);
    if (!this.hasSelection && !t2) return;
    const e2 = t2 ? [t2] : [...this.#At], undo = () => {
      for (const t3 of e2) this.#Kt(t3);
    };
    this.addCommands({ cmd: () => {
      this._editorUndoBar?.show(undo, 1 === e2.length ? e2[0].editorType : e2.length);
      for (const t3 of e2) t3.remove();
    }, undo, mustExec: true });
  }
  commitOrRemove() {
    this.#N?.commitOrRemove();
  }
  hasSomethingToControl() {
    return this.#N || this.hasSelection;
  }
  #Yt(t2) {
    for (const t3 of this.#At) t3.unselect();
    this.#At.clear();
    for (const e2 of t2) if (!e2.isEmpty()) {
      this.#At.add(e2);
      e2.select();
    }
    this.#zt({ hasSelectedEditor: this.hasSelection });
  }
  selectAll() {
    for (const t2 of this.#At) t2.commit();
    this.#Yt(this.#H.values());
  }
  unselectAll() {
    if (this.#N) {
      this.#N.commitOrRemove();
      if (this.#wt !== f.NONE) return;
    }
    if (!this.#q?.commitOrRemove()) {
      this.#K?.destroyPopup();
      if (this.hasSelection) {
        for (const t2 of this.#At) t2.unselect();
        this.#At.clear();
        this.#zt({ hasSelectedEditor: false });
      }
    }
  }
  translateSelectedEditors(t2, e2, i2 = false) {
    i2 || this.commitOrRemove();
    if (!this.hasSelection) return;
    this.#kt[0] += t2;
    this.#kt[1] += e2;
    const [n2, s2] = this.#kt, r2 = [...this.#At];
    this.#Dt && clearTimeout(this.#Dt);
    this.#Dt = setTimeout(() => {
      this.#Dt = null;
      this.#kt[0] = this.#kt[1] = 0;
      this.addCommands({ cmd: () => {
        for (const t3 of r2) if (this.#H.has(t3.id)) {
          t3.translateInPage(n2, s2);
          t3.translationDone();
        }
      }, undo: () => {
        for (const t3 of r2) if (this.#H.has(t3.id)) {
          t3.translateInPage(-n2, -s2);
          t3.translationDone();
        }
      }, mustExec: false });
    }, 1e3);
    for (const i3 of r2) {
      i3.translateInPage(t2, e2);
      i3.translationDone();
    }
  }
  setUpDragSession() {
    if (this.hasSelection) {
      this.disableUserSelect(true);
      this.#Z = /* @__PURE__ */ new Map();
      for (const t2 of this.#At) this.#Z.set(t2, { savedX: t2.x, savedY: t2.y, savedPageIndex: t2.pageIndex, newX: 0, newY: 0, newPageIndex: -1 });
    }
  }
  endDragSession() {
    if (!this.#Z) return false;
    this.disableUserSelect(false);
    const t2 = this.#Z;
    this.#Z = null;
    let e2 = false;
    for (const [{ x: i2, y: n2, pageIndex: s2 }, r2] of t2) {
      r2.newX = i2;
      r2.newY = n2;
      r2.newPageIndex = s2;
      e2 ||= i2 !== r2.savedX || n2 !== r2.savedY || s2 !== r2.savedPageIndex;
    }
    if (!e2) return false;
    const move = (t3, e3, i2, n2) => {
      if (this.#H.has(t3.id)) {
        const s2 = this.#z.get(n2);
        if (s2) t3._setParentAndPosition(s2, e3, i2);
        else {
          t3.pageIndex = n2;
          t3.x = e3;
          t3.y = i2;
        }
      }
    };
    this.addCommands({ cmd: () => {
      for (const [e3, { newX: i2, newY: n2, newPageIndex: s2 }] of t2) move(e3, i2, n2, s2);
    }, undo: () => {
      for (const [e3, { savedX: i2, savedY: n2, savedPageIndex: s2 }] of t2) move(e3, i2, n2, s2);
    }, mustExec: true });
    return true;
  }
  dragSelectedEditors(t2, e2) {
    if (this.#Z) for (const i2 of this.#Z.keys()) i2.drag(t2, e2);
  }
  rebuild(t2) {
    if (null === t2.parent) {
      const e2 = this.getLayer(t2.pageIndex);
      if (e2) {
        e2.changeParent(t2);
        e2.addOrRebuild(t2);
      } else {
        this.addEditor(t2);
        this.addToAnnotationStorage(t2);
        t2.rebuild();
      }
    } else t2.parent.addOrRebuild(t2);
  }
  get isEditorHandlingKeyboard() {
    return this.getActive()?.shouldGetKeyboardEvents() || 1 === this.#At.size && this.firstSelectedEditor.shouldGetKeyboardEvents();
  }
  isActive(t2) {
    return this.#N === t2;
  }
  getActive() {
    return this.#N;
  }
  getMode() {
    return this.#wt;
  }
  isEditingMode() {
    return this.#wt !== f.NONE;
  }
  get imageManager() {
    return shadow(this, "imageManager", new ImageManager());
  }
  getSelectionBoxes(t2) {
    if (!t2) return null;
    const e2 = document.getSelection();
    for (let i3 = 0, n3 = e2.rangeCount; i3 < n3; i3++) if (!t2.contains(e2.getRangeAt(i3).commonAncestorContainer)) return null;
    const { x: i2, y: n2, width: s2, height: r2 } = t2.getBoundingClientRect();
    let a2;
    switch (t2.getAttribute("data-main-rotation")) {
      case "90":
        a2 = (t3, e3, a3, o3) => ({ x: (e3 - n2) / r2, y: 1 - (t3 + a3 - i2) / s2, width: o3 / r2, height: a3 / s2 });
        break;
      case "180":
        a2 = (t3, e3, a3, o3) => ({ x: 1 - (t3 + a3 - i2) / s2, y: 1 - (e3 + o3 - n2) / r2, width: a3 / s2, height: o3 / r2 });
        break;
      case "270":
        a2 = (t3, e3, a3, o3) => ({ x: 1 - (e3 + o3 - n2) / r2, y: (t3 - i2) / s2, width: o3 / r2, height: a3 / s2 });
        break;
      default:
        a2 = (t3, e3, a3, o3) => ({ x: (t3 - i2) / s2, y: (e3 - n2) / r2, width: a3 / s2, height: o3 / r2 });
    }
    const o2 = [];
    for (let t3 = 0, i3 = e2.rangeCount; t3 < i3; t3++) {
      const i4 = e2.getRangeAt(t3);
      if (!i4.collapsed) for (const { x: t4, y: e3, width: n3, height: s3 } of i4.getClientRects()) 0 !== n3 && 0 !== s3 && o2.push(a2(t4, e3, n3, s3));
    }
    return 0 === o2.length ? null : o2;
  }
  addChangedExistingAnnotation({ annotationElementId: t2, id: e2 }) {
    (this.#j ||= /* @__PURE__ */ new Map()).set(t2, e2);
  }
  removeChangedExistingAnnotation({ annotationElementId: t2 }) {
    this.#j?.delete(t2);
  }
  renderAnnotationElement(t2) {
    const e2 = this.#j?.get(t2.data.id);
    if (!e2) return;
    const i2 = this.#$.getRawValue(e2);
    i2 && (this.#wt !== f.NONE || i2.hasBeenModified) && i2.renderAnnotationElement(t2);
  }
  setMissingCanvas(t2, e2, i2) {
    const n2 = this.#yt?.get(t2);
    if (n2) {
      n2.setCanvas(e2, i2);
      this.#yt.delete(t2);
    }
  }
  addMissingCanvas(t2, e2) {
    (this.#yt ||= /* @__PURE__ */ new Map()).set(t2, e2);
  }
}
class AltText {
  #h = null;
  #ee = false;
  #ie = null;
  #ne = null;
  #se = null;
  #re = null;
  #ae = false;
  #oe = null;
  #o = null;
  #le = null;
  #he = null;
  #ce = false;
  static #de = null;
  static _l10n = null;
  constructor(t2) {
    this.#o = t2;
    this.#ce = t2._uiManager.useNewAltTextFlow;
    AltText.#de ||= Object.freeze({ added: "pdfjs-editor-new-alt-text-added-button", "added-label": "pdfjs-editor-new-alt-text-added-button-label", missing: "pdfjs-editor-new-alt-text-missing-button", "missing-label": "pdfjs-editor-new-alt-text-missing-button-label", review: "pdfjs-editor-new-alt-text-to-review-button", "review-label": "pdfjs-editor-new-alt-text-to-review-button-label" });
  }
  static initialize(t2) {
    AltText._l10n ??= t2;
  }
  async render() {
    const t2 = this.#ie = document.createElement("button");
    t2.className = "altText";
    t2.tabIndex = "0";
    const e2 = this.#ne = document.createElement("span");
    t2.append(e2);
    if (this.#ce) {
      t2.classList.add("new");
      t2.setAttribute("data-l10n-id", AltText.#de.missing);
      e2.setAttribute("data-l10n-id", AltText.#de["missing-label"]);
    } else {
      t2.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button");
      e2.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button-label");
    }
    const i2 = this.#o._uiManager._signal;
    t2.addEventListener("contextmenu", noContextMenu, { signal: i2 });
    t2.addEventListener("pointerdown", (t3) => t3.stopPropagation(), { signal: i2 });
    const onClick = (t3) => {
      t3.preventDefault();
      this.#o._uiManager.editAltText(this.#o);
      this.#ce && this.#o._reportTelemetry({ action: "pdfjs.image.alt_text.image_status_label_clicked", data: { label: this.#ue } });
    };
    t2.addEventListener("click", onClick, { capture: true, signal: i2 });
    t2.addEventListener("keydown", (e3) => {
      if (e3.target === t2 && "Enter" === e3.key) {
        this.#ae = true;
        onClick(e3);
      }
    }, { signal: i2 });
    await this.#pe();
    return t2;
  }
  get #ue() {
    return (this.#h ? "added" : null === this.#h && this.guessedText && "review") || "missing";
  }
  finish() {
    if (this.#ie) {
      this.#ie.focus({ focusVisible: this.#ae });
      this.#ae = false;
    }
  }
  isEmpty() {
    return this.#ce ? null === this.#h : !this.#h && !this.#ee;
  }
  hasData() {
    return this.#ce ? null !== this.#h || !!this.#le : this.isEmpty();
  }
  get guessedText() {
    return this.#le;
  }
  async setGuessedText(t2) {
    if (null === this.#h) {
      this.#le = t2;
      this.#he = await AltText._l10n.get("pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer", { generatedAltText: t2 });
      this.#pe();
    }
  }
  toggleAltTextBadge(t2 = false) {
    if (this.#ce && !this.#h) {
      if (!this.#oe) {
        const t3 = this.#oe = document.createElement("div");
        t3.className = "noAltTextBadge";
        this.#o.div.append(t3);
      }
      this.#oe.classList.toggle("hidden", !t2);
    } else {
      this.#oe?.remove();
      this.#oe = null;
    }
  }
  serialize(t2) {
    let e2 = this.#h;
    t2 || this.#le !== e2 || (e2 = this.#he);
    return { altText: e2, decorative: this.#ee, guessedText: this.#le, textWithDisclaimer: this.#he };
  }
  get data() {
    return { altText: this.#h, decorative: this.#ee };
  }
  set data({ altText: t2, decorative: e2, guessedText: i2, textWithDisclaimer: n2, cancel: s2 = false }) {
    if (i2) {
      this.#le = i2;
      this.#he = n2;
    }
    if (this.#h !== t2 || this.#ee !== e2) {
      if (!s2) {
        this.#h = t2;
        this.#ee = e2;
      }
      this.#pe();
    }
  }
  toggle(t2 = false) {
    if (this.#ie) {
      if (!t2 && this.#re) {
        clearTimeout(this.#re);
        this.#re = null;
      }
      this.#ie.disabled = !t2;
    }
  }
  shown() {
    this.#o._reportTelemetry({ action: "pdfjs.image.alt_text.image_status_label_displayed", data: { label: this.#ue } });
  }
  destroy() {
    this.#ie?.remove();
    this.#ie = null;
    this.#ne = null;
    this.#se = null;
    this.#oe?.remove();
    this.#oe = null;
  }
  async #pe() {
    const t2 = this.#ie;
    if (!t2) return;
    if (this.#ce) {
      t2.classList.toggle("done", !!this.#h);
      t2.setAttribute("data-l10n-id", AltText.#de[this.#ue]);
      this.#ne?.setAttribute("data-l10n-id", AltText.#de[`${this.#ue}-label`]);
      if (!this.#h) {
        this.#se?.remove();
        return;
      }
    } else {
      if (!this.#h && !this.#ee) {
        t2.classList.remove("done");
        this.#se?.remove();
        return;
      }
      t2.classList.add("done");
      t2.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-edit-button");
    }
    let e2 = this.#se;
    if (!e2) {
      this.#se = e2 = document.createElement("span");
      e2.className = "tooltip";
      e2.setAttribute("role", "tooltip");
      e2.id = `alt-text-tooltip-${this.#o.id}`;
      const i3 = 100, n2 = this.#o._uiManager._signal;
      n2.addEventListener("abort", () => {
        clearTimeout(this.#re);
        this.#re = null;
      }, { once: true });
      t2.addEventListener("mouseenter", () => {
        this.#re = setTimeout(() => {
          this.#re = null;
          this.#se.classList.add("show");
          this.#o._reportTelemetry({ action: "alt_text_tooltip" });
        }, i3);
      }, { signal: n2 });
      t2.addEventListener("mouseleave", () => {
        if (this.#re) {
          clearTimeout(this.#re);
          this.#re = null;
        }
        this.#se?.classList.remove("show");
      }, { signal: n2 });
    }
    if (this.#ee) e2.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-decorative-tooltip");
    else {
      e2.removeAttribute("data-l10n-id");
      e2.textContent = this.#h;
    }
    e2.parentNode || t2.append(e2);
    const i2 = this.#o.getElementForAltText();
    i2?.setAttribute("aria-describedby", e2.id);
  }
}
class Comment {
  #ge = null;
  #me = null;
  #fe = false;
  #o = null;
  #be = null;
  #ye = null;
  #ve = null;
  #we = null;
  #Ae = false;
  #xe = null;
  constructor(t2) {
    this.#o = t2;
  }
  renderForToolbar() {
    const t2 = this.#me = document.createElement("button");
    t2.className = "comment";
    return this.#w(t2, false);
  }
  renderForStandalone() {
    const t2 = this.#ge = document.createElement("button");
    t2.className = "annotationCommentButton";
    const e2 = this.#o.commentButtonPosition;
    if (e2) {
      const { style: i2 } = t2;
      i2.insetInlineEnd = `calc(${100 * ("ltr" === this.#o._uiManager.direction ? 1 - e2[0] : e2[0])}% - var(--comment-button-dim))`;
      i2.top = `calc(${100 * e2[1]}% - var(--comment-button-dim))`;
      const n2 = this.#o.commentButtonColor;
      n2 && (i2.backgroundColor = n2);
    }
    return this.#w(t2, true);
  }
  focusButton() {
    setTimeout(() => {
      (this.#ge ?? this.#me)?.focus();
    }, 0);
  }
  onUpdatedColor() {
    if (!this.#ge) return;
    const t2 = this.#o.commentButtonColor;
    t2 && (this.#ge.style.backgroundColor = t2);
    this.#o._uiManager.updatePopupColor(this.#o);
  }
  get commentButtonWidth() {
    return (this.#ge?.getBoundingClientRect().width ?? 0) / this.#o.parent.boundingClientRect.width;
  }
  get commentPopupPositionInLayer() {
    if (this.#xe) return this.#xe;
    if (!this.#ge) return null;
    const { x: t2, y: e2, height: i2 } = this.#ge.getBoundingClientRect(), { x: n2, y: s2, width: r2, height: a2 } = this.#o.parent.boundingClientRect;
    return [(t2 - n2) / r2, (e2 + i2 - s2) / a2];
  }
  set commentPopupPositionInLayer(t2) {
    this.#xe = t2;
  }
  hasDefaultPopupPosition() {
    return null === this.#xe;
  }
  removeStandaloneCommentButton() {
    this.#ge?.remove();
    this.#ge = null;
  }
  removeToolbarCommentButton() {
    this.#me?.remove();
    this.#me = null;
  }
  setCommentButtonStates({ selected: t2, hasPopup: e2 }) {
    if (this.#ge) {
      this.#ge.classList.toggle("selected", t2);
      this.#ge.ariaExpanded = e2;
    }
  }
  #w(t2, e2) {
    if (!this.#o._uiManager.hasCommentManager()) return null;
    t2.tabIndex = "0";
    t2.ariaHasPopup = "dialog";
    if (e2) {
      t2.ariaControls = "commentPopup";
      t2.setAttribute("data-l10n-id", "pdfjs-show-comment-button");
    } else {
      t2.ariaControlsElements = [this.#o._uiManager.getCommentDialogElement()];
      t2.setAttribute("data-l10n-id", "pdfjs-editor-add-comment-button");
    }
    const i2 = this.#o._uiManager._signal;
    if (!(i2 instanceof AbortSignal) || i2.aborted) return t2;
    t2.addEventListener("contextmenu", noContextMenu, { signal: i2 });
    if (e2) {
      t2.addEventListener("focusin", (t3) => {
        this.#o._focusEventsAllowed = false;
        stopEvent(t3);
      }, { capture: true, signal: i2 });
      t2.addEventListener("focusout", (t3) => {
        this.#o._focusEventsAllowed = true;
        stopEvent(t3);
      }, { capture: true, signal: i2 });
    }
    t2.addEventListener("pointerdown", (t3) => t3.stopPropagation(), { signal: i2 });
    const onClick = (e3) => {
      e3.preventDefault();
      t2 === this.#me ? this.edit() : this.#o.toggleComment(true);
    };
    t2.addEventListener("click", onClick, { capture: true, signal: i2 });
    t2.addEventListener("keydown", (e3) => {
      if (e3.target === t2 && "Enter" === e3.key) {
        this.#fe = true;
        onClick(e3);
      }
    }, { signal: i2 });
    t2.addEventListener("pointerenter", () => {
      this.#o.toggleComment(false, true);
    }, { signal: i2 });
    t2.addEventListener("pointerleave", () => {
      this.#o.toggleComment(false, false);
    }, { signal: i2 });
    return t2;
  }
  edit(t2) {
    const e2 = this.commentPopupPositionInLayer;
    let i2, n2;
    if (e2) [i2, n2] = e2;
    else {
      [i2, n2] = this.#o.commentButtonPosition;
      const { width: t3, height: e3, x: s3, y: r3 } = this.#o;
      i2 = s3 + i2 * t3;
      n2 = r3 + n2 * e3;
    }
    const s2 = this.#o.parent.boundingClientRect, { x: r2, y: a2, width: o2, height: l2 } = s2;
    this.#o._uiManager.editComment(this.#o, r2 + i2 * o2, a2 + n2 * l2, { ...t2, parentDimensions: s2 });
  }
  finish() {
    if (this.#me) {
      this.#me.focus({ focusVisible: this.#fe });
      this.#fe = false;
    }
  }
  isDeleted() {
    return this.#Ae || "" === this.#ve;
  }
  isEmpty() {
    return null === this.#ve;
  }
  hasBeenEdited() {
    return this.isDeleted() || this.#ve !== this.#be;
  }
  serialize() {
    return this.data;
  }
  get data() {
    return { text: this.#ve, richText: this.#ye, date: this.#we, deleted: this.isDeleted() };
  }
  set data(t2) {
    t2 !== this.#ve && (this.#ye = null);
    if (null !== t2) {
      this.#ve = t2;
      this.#we = /* @__PURE__ */ new Date();
      this.#Ae = false;
    } else {
      this.#ve = "";
      this.#Ae = true;
    }
  }
  restoreData({ text: t2, richText: e2, date: i2 }) {
    this.#ve = t2;
    this.#ye = e2;
    this.#we = i2;
    this.#Ae = false;
  }
  setInitialText(t2, e2 = null) {
    this.#be = t2;
    this.data = t2;
    this.#we = null;
    this.#ye = e2;
  }
  shown() {
  }
  destroy() {
    this.#me?.remove();
    this.#me = null;
    this.#ge?.remove();
    this.#ge = null;
    this.#ve = "";
    this.#ye = null;
    this.#we = null;
    this.#o = null;
    this.#fe = false;
    this.#Ae = false;
  }
}
function preventDefault(t2) {
  t2.preventDefault();
}
const Y = 1e-4;
function stopTouchEvent(t2) {
  if (t2.cancelable) {
    stopEvent(t2);
    return true;
  }
  t2.stopPropagation();
  return false;
}
class TouchManager {
  #Pt;
  #Ce = false;
  #Ee = null;
  #Se;
  #Te;
  #_e;
  #ke;
  #De;
  #Pe = false;
  #Me = null;
  #Ie;
  #Fe = /* @__PURE__ */ new Set();
  #Be = null;
  #Oe;
  #Re = null;
  #Le = 0;
  constructor({ container: t2, isPinchingDisabled: e2 = null, isPinchingStopped: i2 = null, onPinchStart: n2 = null, onPinching: s2 = null, onPinchEnd: r2 = null, onPanning: a2 = null, signal: o2 }) {
    this.#Pt = t2;
    this.#Ee = i2;
    this.#Se = e2;
    this.#Te = n2;
    this.#_e = s2;
    this.#ke = r2;
    this.#De = a2;
    this.#Oe = new AbortController();
    this.#Ie = AbortSignal.any([o2, this.#Oe.signal]);
    t2.addEventListener("touchstart", this.#Ne.bind(this), { passive: false, signal: this.#Ie });
  }
  get MIN_TOUCH_DISTANCE_TO_PINCH() {
    return 35 / OutputScale.pixelRatio;
  }
  get MIN_TOUCH_DISTANCE_TO_SCALE() {
    return 4 / OutputScale.pixelRatio;
  }
  #Ne(t2) {
    if (this.#Se?.()) return;
    this.#Ue(t2);
    const e2 = this.#Fe;
    for (const { identifier: i2 } of t2.changedTouches) e2.add(i2);
    if (1 !== e2.size) {
      if (!this.#Re) {
        this.#Re = new AbortController();
        const t3 = AbortSignal.any([this.#Ie, this.#Re.signal]), e3 = this.#Pt, i2 = { signal: t3, capture: false, passive: false };
        e3.addEventListener("touchmove", this.#He.bind(this), i2);
        const n2 = this.#ze.bind(this);
        e3.addEventListener("touchend", n2, i2);
        e3.addEventListener("touchcancel", n2, i2);
        i2.capture = true;
        e3.addEventListener("pointerdown", stopEvent, i2);
        e3.addEventListener("pointermove", stopEvent, i2);
        e3.addEventListener("pointercancel", preventDefault, i2);
        e3.addEventListener("pointerup", preventDefault, i2);
        this.#Te?.();
      }
      this.#Pe = stopTouchEvent(t2);
      this.#Ge(t2);
    } else this.#Ve();
  }
  #Ve() {
    if (this.#Me) return;
    const t2 = this.#Me = new AbortController(), e2 = AbortSignal.any([this.#Ie, t2.signal]), i2 = this.#Pt, n2 = { capture: true, signal: e2, passive: false }, cancelPointerDown = (t3) => {
      if ("touch" === t3.pointerType) {
        this.#Me?.abort();
        this.#Me = null;
      }
    };
    i2.addEventListener("pointerdown", (t3) => {
      if ("touch" === t3.pointerType) {
        stopEvent(t3);
        cancelPointerDown(t3);
      }
    }, n2);
    i2.addEventListener("pointerup", cancelPointerDown, n2);
    i2.addEventListener("pointercancel", cancelPointerDown, n2);
  }
  #Ue(t2) {
    const e2 = this.#Fe;
    if (0 === e2.size) return;
    const i2 = this.#Fe = /* @__PURE__ */ new Set();
    for (const { identifier: n2 } of t2.touches) e2.has(n2) && i2.add(n2);
  }
  #We(t2) {
    const e2 = this.#Fe, i2 = [];
    for (const n2 of t2.touches) e2.has(n2.identifier) && i2.push(n2);
    return i2;
  }
  #Ge(t2) {
    const e2 = this.#We(t2);
    if (2 !== e2.length || this.#Ee?.()) {
      this.#Be = null;
      return;
    }
    const [i2, n2] = e2;
    this.#Be = { touch0X: i2.screenX, touch0Y: i2.screenY, touch1X: n2.screenX, touch1Y: n2.screenY, panX: (i2.clientX + n2.clientX) / 2, panY: (i2.clientY + n2.clientY) / 2, screenPanX: (i2.screenX + n2.screenX) / 2, screenPanY: (i2.screenY + n2.screenY) / 2 };
  }
  #He(t2) {
    if (!this.#Be) return;
    const e2 = this.#We(t2);
    if (2 !== e2.length) return;
    const i2 = this.#Pe;
    this.#Pe = stopTouchEvent(t2);
    if (!this.#Pe) return;
    if (!i2) {
      this.#Ge(t2);
      return;
    }
    const [n2, s2] = e2, { screenX: r2, screenY: a2 } = n2, { screenX: o2, screenY: l2 } = s2, h2 = this.#Be, { touch0X: c2, touch0Y: d2, touch1X: u2, touch1Y: p2, panX: g2, panY: m2 } = h2, f2 = u2 - c2, b2 = p2 - d2, y2 = o2 - r2, v2 = l2 - a2, w2 = (n2.clientX + s2.clientX) / 2, A2 = (n2.clientY + s2.clientY) / 2;
    h2.panX = w2;
    h2.panY = A2;
    const x2 = w2 - g2, C2 = A2 - m2, E2 = (r2 + o2) / 2, S2 = (a2 + l2) / 2, T2 = Math.hypot(E2 - h2.screenPanX, S2 - h2.screenPanY);
    h2.screenPanX = E2;
    h2.screenPanY = S2;
    const _2 = Math.hypot(y2, v2), k2 = Math.hypot(f2, b2), D2 = this.#Ce ? this.MIN_TOUCH_DISTANCE_TO_SCALE : this.MIN_TOUCH_DISTANCE_TO_PINCH + 2 * T2;
    if (_2 < Y || k2 < Y || Math.abs(k2 - _2) <= D2) {
      (x2 || C2) && this.#De?.(x2, C2);
      return;
    }
    h2.touch0X = r2;
    h2.touch0Y = a2;
    h2.touch1X = o2;
    h2.touch1Y = l2;
    const P2 = Math.sign(_2 - k2);
    if (this.#Ce) {
      if (this.#Le) {
        const t3 = this.#Le;
        this.#Le = 0;
        if (P2 !== t3 && Math.abs(_2 - k2) <= 2 * T2) {
          this.#Ce = false;
          (x2 || C2) && this.#De?.(x2, C2);
          return;
        }
      }
      this.#_e?.([g2, m2], k2, _2, x2, C2);
    } else {
      this.#Ce = true;
      this.#Le = P2;
      (x2 || C2) && this.#De?.(x2, C2);
    }
  }
  #ze(t2) {
    this.#Ue(t2);
    if (this.#Fe.size >= 2) {
      this.#Ge(t2);
      return;
    }
    const e2 = !!this.#Be;
    this.#$e();
    1 === this.#Fe.size && this.#Ve();
    e2 && stopTouchEvent(t2);
  }
  #$e() {
    this.#Be = null;
    this.#Ce = false;
    this.#Le = 0;
    this.#Pe = false;
    if (this.#Re) {
      this.#Re.abort();
      this.#Re = null;
      this.#ke?.();
    }
  }
  destroy() {
    this.#$e();
    this.#Fe.clear();
    this.#Oe?.abort();
    this.#Oe = null;
    this.#Me?.abort();
    this.#Me = null;
  }
}
class AnnotationEditor {
  #je = null;
  #Xe = null;
  #h = null;
  #c = null;
  #ge = null;
  #Ke = false;
  #Ye = null;
  #qe = "";
  #Qe = null;
  #Je = null;
  #Ze = null;
  #ti = null;
  #ei = null;
  #ii = "";
  #ni = false;
  #si = null;
  #ri = false;
  #ai = false;
  #oi = false;
  #li = null;
  #hi = 0;
  #ci = 0;
  #di = null;
  #ui = null;
  isSelected = false;
  _isCopy = false;
  _editToolbar = null;
  _initialOptions = /* @__PURE__ */ Object.create(null);
  _initialData = null;
  _isVisible = true;
  _uiManager = null;
  _focusEventsAllowed = true;
  static _l10n = null;
  static _l10nAlert = null;
  static _l10nResizer = null;
  #pi = false;
  #gi = AnnotationEditor._zIndex++;
  static _borderLineWidth = -1;
  static _colorManager = new ColorManager();
  static _zIndex = 1;
  static _telemetryTimeout = 1e3;
  static get _resizerKeyboardManager() {
    const t2 = AnnotationEditor.prototype._resizeWithKeyboard, e2 = AnnotationEditorUIManager.TRANSLATE_SMALL, i2 = AnnotationEditorUIManager.TRANSLATE_BIG;
    return shadow(this, "_resizerKeyboardManager", new KeyboardManager([[["ArrowLeft"], t2, { args: [-e2, 0] }], [["ctrl+ArrowLeft", "mac+shift+ArrowLeft"], t2, { args: [-i2, 0] }], [["ArrowRight"], t2, { args: [e2, 0] }], [["ctrl+ArrowRight", "mac+shift+ArrowRight"], t2, { args: [i2, 0] }], [["ArrowUp"], t2, { args: [0, -e2] }], [["ctrl+ArrowUp", "mac+shift+ArrowUp"], t2, { args: [0, -i2] }], [["ArrowDown"], t2, { args: [0, e2] }], [["ctrl+ArrowDown", "mac+shift+ArrowDown"], t2, { args: [0, i2] }], [["Escape"], AnnotationEditor.prototype._stopResizingWithKeyboard]]));
  }
  constructor(t2) {
    this.parent = t2.parent;
    this.id = t2.id;
    this.width = this.height = null;
    this.pageIndex = t2.parent.pageIndex;
    this.name = t2.name;
    this.div = null;
    this._uiManager = t2.uiManager;
    this.annotationElementId = null;
    this._willKeepAspectRatio = false;
    this._initialOptions.isCentered = t2.isCentered;
    this._structTreeParentId = null;
    this.annotationElementId = t2.annotationElementId || null;
    this.creationDate = t2.creationDate || /* @__PURE__ */ new Date();
    this.modificationDate = t2.modificationDate || null;
    this.canAddComment = true;
    const { rotation: e2, rawDims: { pageWidth: i2, pageHeight: n2, pageX: s2, pageY: r2 } } = this.parent.viewport;
    this.rotation = e2;
    this.pageRotation = (360 + e2 - this._uiManager.viewParameters.rotation) % 360;
    this.pageDimensions = [i2, n2];
    this.pageTranslation = [s2, r2];
    const [a2, o2] = this.parentDimensions;
    this.x = t2.x / a2;
    this.y = t2.y / o2;
    this.isAttachedToDOM = false;
    this.deleted = false;
  }
  updatePageIndex(t2) {
    this.pageIndex = t2;
  }
  get editorType() {
    return Object.getPrototypeOf(this).constructor._type;
  }
  get mode() {
    return Object.getPrototypeOf(this).constructor._editorType;
  }
  static get isDrawer() {
    return false;
  }
  static get _defaultLineColor() {
    return shadow(this, "_defaultLineColor", this._colorManager.getHexCode("CanvasText"));
  }
  static deleteAnnotationElement(t2) {
    const e2 = new FakeEditor({ id: t2._uiManager.getId(), parent: t2.parent, uiManager: t2._uiManager });
    e2.annotationElementId = t2.annotationElementId;
    e2.deleted = true;
    e2._uiManager.addToAnnotationStorage(e2);
  }
  static initialize(t2, e2) {
    AnnotationEditor._l10n ??= t2;
    AnnotationEditor._l10nAlert ??= Object.freeze({ highlight: "pdfjs-editor-highlight-added-alert", freetext: "pdfjs-editor-freetext-added-alert", ink: "pdfjs-editor-ink-added-alert", stamp: "pdfjs-editor-stamp-added-alert", signature: "pdfjs-editor-signature-added-alert" });
    AnnotationEditor._l10nResizer ??= Object.freeze({ topLeft: "pdfjs-editor-resizer-top-left", topMiddle: "pdfjs-editor-resizer-top-middle", topRight: "pdfjs-editor-resizer-top-right", middleRight: "pdfjs-editor-resizer-middle-right", bottomRight: "pdfjs-editor-resizer-bottom-right", bottomMiddle: "pdfjs-editor-resizer-bottom-middle", bottomLeft: "pdfjs-editor-resizer-bottom-left", middleLeft: "pdfjs-editor-resizer-middle-left" });
    if (-1 !== AnnotationEditor._borderLineWidth) return;
    const i2 = getComputedStyle(document.documentElement);
    AnnotationEditor._borderLineWidth = parseFloat(i2.getPropertyValue("--outline-width")) || 0;
  }
  static updateDefaultParams(t2, e2) {
  }
  static get defaultPropertiesToUpdate() {
    return [];
  }
  static isHandlingMimeForPasting(t2) {
    return false;
  }
  static paste(t2, e2) {
    unreachable("Not implemented");
  }
  get propertiesToUpdate() {
    return [];
  }
  get _isDraggable() {
    return this.#pi;
  }
  set _isDraggable(t2) {
    this.#pi = t2;
    this.div?.classList.toggle("draggable", t2);
  }
  get uid() {
    return this.annotationElementId || this.id;
  }
  get isEnterHandled() {
    return true;
  }
  center() {
    const [t2, e2] = this.pageDimensions;
    switch (this.parentRotation) {
      case 90:
        this.x -= this.height * e2 / (2 * t2);
        this.y += this.width * t2 / (2 * e2);
        break;
      case 180:
        this.x += this.width / 2;
        this.y += this.height / 2;
        break;
      case 270:
        this.x += this.height * e2 / (2 * t2);
        this.y -= this.width * t2 / (2 * e2);
        break;
      default:
        this.x -= this.width / 2;
        this.y -= this.height / 2;
    }
    this.fixAndSetPosition();
  }
  addCommands(t2) {
    this._uiManager.addCommands(t2);
  }
  get currentLayer() {
    return this._uiManager.currentLayer;
  }
  setInBackground() {
    this.div.style.zIndex = 0;
  }
  setInForeground() {
    this.div.style.zIndex = this.#gi;
  }
  setParent(t2) {
    if (null !== t2) {
      this.pageIndex = t2.pageIndex;
      this.pageDimensions = t2.pageDimensions;
    } else {
      this.#mi();
      this.#ti?.remove();
      this.#ti = null;
    }
    this.parent = t2;
  }
  focusin(t2) {
    this._focusEventsAllowed && (this.#ni ? this.#ni = false : this.parent.setSelected(this));
  }
  focusout(t2) {
    if (!this._focusEventsAllowed || !this.isAttachedToDOM) return;
    const e2 = t2.relatedTarget;
    if (!e2?.closest(`#${this.id}`)) {
      t2.preventDefault();
      this.parent?.isMultipleSelection || this.commitOrRemove();
    }
  }
  commitOrRemove() {
    this.isEmpty() ? this.remove() : this.commit();
  }
  commit() {
    this.isInEditMode() && this.addToAnnotationStorage();
  }
  addToAnnotationStorage() {
    this._uiManager.addToAnnotationStorage(this);
  }
  setAt(t2, e2, i2, n2) {
    const [s2, r2] = this.parentDimensions;
    [i2, n2] = this.screenToPageTranslation(i2, n2);
    this.x = (t2 + i2) / s2;
    this.y = (e2 + n2) / r2;
    this.fixAndSetPosition();
  }
  _moveAfterPaste(t2, e2) {
    if (this.isClone) {
      delete this.isClone;
      return;
    }
    const [i2, n2] = this.parentDimensions;
    this.setAt(t2 * i2, e2 * n2, this.width * i2, this.height * n2);
    this._onTranslated();
  }
  #fi([t2, e2], i2, n2) {
    [i2, n2] = this.screenToPageTranslation(i2, n2);
    this.x += i2 / t2;
    this.y += n2 / e2;
    this._onTranslating(this.x, this.y);
    this.fixAndSetPosition();
  }
  translate(t2, e2) {
    this.#fi(this.parentDimensions, t2, e2);
  }
  translateInPage(t2, e2) {
    this.#si ||= [this.x, this.y, this.width, this.height];
    this.#fi(this.pageDimensions, t2, e2);
    this.div.scrollIntoView({ block: "nearest" });
  }
  translationDone() {
    this._onTranslated(this.x, this.y);
  }
  drag(t2, e2) {
    this.#si ||= [this.x, this.y, this.width, this.height];
    const { div: i2, parentDimensions: [n2, s2] } = this;
    this.x += t2 / n2;
    this.y += e2 / s2;
    if (this.parent && (this.x < 0 || this.x > 1 || this.y < 0 || this.y > 1)) {
      const { x: t3, y: e3 } = this.div.getBoundingClientRect();
      if (this.parent.findNewParent(this, t3, e3)) {
        this.x -= Math.floor(this.x);
        this.y -= Math.floor(this.y);
      }
    }
    let { x: r2, y: a2 } = this;
    const [o2, l2] = this.getBaseTranslation();
    r2 += o2;
    a2 += l2;
    const { style: h2 } = i2;
    h2.left = `${(100 * r2).toFixed(2)}%`;
    h2.top = `${(100 * a2).toFixed(2)}%`;
    this._onTranslating(r2, a2);
  }
  _onTranslating(t2, e2) {
  }
  _onTranslated(t2, e2) {
  }
  get _hasBeenMoved() {
    return !!this.#si && (this.#si[0] !== this.x || this.#si[1] !== this.y);
  }
  get _hasBeenResized() {
    return !!this.#si && (this.#si[2] !== this.width || this.#si[3] !== this.height);
  }
  getBaseTranslation() {
    const [t2, e2] = this.parentDimensions, { _borderLineWidth: i2 } = AnnotationEditor, n2 = i2 / t2, s2 = i2 / e2;
    switch (this.rotation) {
      case 90:
        return [-n2, s2];
      case 180:
        return [n2, s2];
      case 270:
        return [n2, -s2];
      default:
        return [-n2, -s2];
    }
  }
  get _mustFixPosition() {
    return true;
  }
  fixAndSetPosition(t2 = this.rotation) {
    const { div: { style: e2 }, pageDimensions: [i2, n2] } = this;
    let { x: s2, y: r2, width: a2, height: o2 } = this;
    a2 *= i2;
    o2 *= n2;
    s2 *= i2;
    r2 *= n2;
    if (this._mustFixPosition) switch (t2) {
      case 0:
        s2 = MathClamp(s2, 0, i2 - a2);
        r2 = MathClamp(r2, 0, n2 - o2);
        break;
      case 90:
        s2 = MathClamp(s2, 0, i2 - o2);
        r2 = MathClamp(r2, a2, n2);
        break;
      case 180:
        s2 = MathClamp(s2, a2, i2);
        r2 = MathClamp(r2, o2, n2);
        break;
      case 270:
        s2 = MathClamp(s2, o2, i2);
        r2 = MathClamp(r2, 0, n2 - a2);
    }
    this.x = s2 /= i2;
    this.y = r2 /= n2;
    const [l2, h2] = this.getBaseTranslation();
    s2 += l2;
    r2 += h2;
    e2.left = `${(100 * s2).toFixed(2)}%`;
    e2.top = `${(100 * r2).toFixed(2)}%`;
    this.moveInDOM();
  }
  static #bi(t2, e2, i2) {
    switch (i2) {
      case 90:
        return [e2, -t2];
      case 180:
        return [-t2, -e2];
      case 270:
        return [-e2, t2];
      default:
        return [t2, e2];
    }
  }
  screenToPageTranslation(t2, e2) {
    return AnnotationEditor.#bi(t2, e2, this.parentRotation);
  }
  pageTranslationToScreen(t2, e2) {
    return AnnotationEditor.#bi(t2, e2, 360 - this.parentRotation);
  }
  #yi(t2) {
    switch (t2) {
      case 90: {
        const [t3, e2] = this.pageDimensions;
        return [0, -t3 / e2, e2 / t3, 0];
      }
      case 180:
        return [-1, 0, 0, -1];
      case 270: {
        const [t3, e2] = this.pageDimensions;
        return [0, t3 / e2, -e2 / t3, 0];
      }
      default:
        return [1, 0, 0, 1];
    }
  }
  get parentScale() {
    return this._uiManager.viewParameters.realScale;
  }
  get parentRotation() {
    return (this._uiManager.viewParameters.rotation + this.pageRotation) % 360;
  }
  get parentDimensions() {
    const { parentScale: t2, pageDimensions: [e2, i2] } = this;
    return [e2 * t2, i2 * t2];
  }
  setDims() {
    const { div: { style: t2 }, width: e2, height: i2 } = this;
    t2.width = `${(100 * e2).toFixed(2)}%`;
    t2.height = `${(100 * i2).toFixed(2)}%`;
  }
  getInitialTranslation() {
    return [0, 0];
  }
  #vi() {
    if (this.#Qe) return;
    this.#Qe = document.createElement("div");
    this.#Qe.classList.add("resizers");
    const t2 = this._willKeepAspectRatio ? ["topLeft", "topRight", "bottomRight", "bottomLeft"] : ["topLeft", "topMiddle", "topRight", "middleRight", "bottomRight", "bottomMiddle", "bottomLeft", "middleLeft"], e2 = this._uiManager._signal;
    for (const i2 of t2) {
      const t3 = document.createElement("div");
      this.#Qe.append(t3);
      t3.classList.add("resizer", i2);
      t3.setAttribute("data-resizer-name", i2);
      t3.addEventListener("pointerdown", this.#wi.bind(this, i2), { signal: e2 });
      t3.addEventListener("contextmenu", noContextMenu, { signal: e2 });
      t3.tabIndex = -1;
    }
    this.div.prepend(this.#Qe);
  }
  #wi(t2, e2) {
    e2.preventDefault();
    const { isMac: i2 } = FeatureTest.platform;
    if (0 !== e2.button || e2.ctrlKey && i2) return;
    this.#h?.toggle(false);
    const n2 = this._isDraggable;
    this._isDraggable = false;
    this.#Je = [e2.screenX, e2.screenY];
    const s2 = new AbortController(), r2 = this._uiManager.combinedSignal(s2);
    this.parent.togglePointerEvents(false);
    window.addEventListener("pointermove", this.#Ai.bind(this, t2), { passive: true, capture: true, signal: r2 });
    window.addEventListener("touchmove", stopEvent, { passive: false, signal: r2 });
    window.addEventListener("contextmenu", noContextMenu, { signal: r2 });
    this.#Ze = { savedX: this.x, savedY: this.y, savedWidth: this.width, savedHeight: this.height };
    const a2 = this.parent.div.style.cursor, o2 = this.div.style.cursor;
    this.div.style.cursor = this.parent.div.style.cursor = window.getComputedStyle(e2.target).cursor;
    const pointerUpCallback = () => {
      s2.abort();
      this.parent.togglePointerEvents(true);
      this.#h?.toggle(true);
      this._isDraggable = n2;
      this.parent.div.style.cursor = a2;
      this.div.style.cursor = o2;
      this.#xi();
    };
    window.addEventListener("pointerup", pointerUpCallback, { signal: r2 });
    window.addEventListener("blur", pointerUpCallback, { signal: r2 });
  }
  #Ci(t2, e2, i2, n2) {
    this.width = i2;
    this.height = n2;
    this.x = t2;
    this.y = e2;
    this.setDims();
    this.fixAndSetPosition();
    this._onResized();
  }
  _onResized() {
  }
  #xi() {
    if (!this.#Ze) return;
    const { savedX: t2, savedY: e2, savedWidth: i2, savedHeight: n2 } = this.#Ze;
    this.#Ze = null;
    const s2 = this.x, r2 = this.y, a2 = this.width, o2 = this.height;
    s2 === t2 && r2 === e2 && a2 === i2 && o2 === n2 || this.addCommands({ cmd: this.#Ci.bind(this, s2, r2, a2, o2), undo: this.#Ci.bind(this, t2, e2, i2, n2), mustExec: true });
  }
  static _round(t2) {
    return Math.round(1e4 * t2) / 1e4;
  }
  #Ai(t2, e2) {
    const [i2, n2] = this.parentDimensions, s2 = this.x, r2 = this.y, a2 = this.width, o2 = this.height, l2 = AnnotationEditor.MIN_SIZE / i2, h2 = AnnotationEditor.MIN_SIZE / n2, c2 = this.#yi(this.rotation), transf = (t3, e3) => [c2[0] * t3 + c2[2] * e3, c2[1] * t3 + c2[3] * e3], d2 = this.#yi(360 - this.rotation);
    let u2, p2, g2 = false, m2 = false;
    switch (t2) {
      case "topLeft":
        g2 = true;
        u2 = (t3, e3) => [0, 0];
        p2 = (t3, e3) => [t3, e3];
        break;
      case "topMiddle":
        u2 = (t3, e3) => [t3 / 2, 0];
        p2 = (t3, e3) => [t3 / 2, e3];
        break;
      case "topRight":
        g2 = true;
        u2 = (t3, e3) => [t3, 0];
        p2 = (t3, e3) => [0, e3];
        break;
      case "middleRight":
        m2 = true;
        u2 = (t3, e3) => [t3, e3 / 2];
        p2 = (t3, e3) => [0, e3 / 2];
        break;
      case "bottomRight":
        g2 = true;
        u2 = (t3, e3) => [t3, e3];
        p2 = (t3, e3) => [0, 0];
        break;
      case "bottomMiddle":
        u2 = (t3, e3) => [t3 / 2, e3];
        p2 = (t3, e3) => [t3 / 2, 0];
        break;
      case "bottomLeft":
        g2 = true;
        u2 = (t3, e3) => [0, e3];
        p2 = (t3, e3) => [t3, 0];
        break;
      case "middleLeft":
        m2 = true;
        u2 = (t3, e3) => [0, e3 / 2];
        p2 = (t3, e3) => [t3, e3 / 2];
    }
    const f2 = u2(a2, o2), b2 = p2(a2, o2);
    let y2 = transf(...b2);
    const v2 = AnnotationEditor._round(s2 + y2[0]), w2 = AnnotationEditor._round(r2 + y2[1]);
    let A2, x2, C2 = 1, E2 = 1;
    if (e2.fromKeyboard) ({ deltaX: A2, deltaY: x2 } = e2);
    else {
      const { screenX: t3, screenY: i3 } = e2, [n3, s3] = this.#Je;
      [A2, x2] = this.screenToPageTranslation(t3 - n3, i3 - s3);
      this.#Je[0] = t3;
      this.#Je[1] = i3;
    }
    [A2, x2] = (S2 = A2 / i2, T2 = x2 / n2, [d2[0] * S2 + d2[2] * T2, d2[1] * S2 + d2[3] * T2]);
    var S2, T2;
    if (g2) {
      const t3 = Math.hypot(a2, o2);
      C2 = E2 = Math.max(Math.min(Math.hypot(b2[0] - f2[0] - A2, b2[1] - f2[1] - x2) / t3, 1 / a2, 1 / o2), l2 / a2, h2 / o2);
    } else m2 ? C2 = MathClamp(Math.abs(b2[0] - f2[0] - A2), l2, 1) / a2 : E2 = MathClamp(Math.abs(b2[1] - f2[1] - x2), h2, 1) / o2;
    const _2 = AnnotationEditor._round(a2 * C2), k2 = AnnotationEditor._round(o2 * E2);
    y2 = transf(...p2(_2, k2));
    const D2 = v2 - y2[0], P2 = w2 - y2[1];
    this.#si ||= [this.x, this.y, this.width, this.height];
    this.width = _2;
    this.height = k2;
    this.x = D2;
    this.y = P2;
    this.setDims();
    this.fixAndSetPosition();
    this._onResizing();
  }
  _onResizing() {
  }
  altTextFinish() {
    this.#h?.finish();
  }
  get toolbarButtons() {
    return null;
  }
  async addEditToolbar() {
    if (this._editToolbar || this.#ai) return this._editToolbar;
    this._editToolbar = new EditorToolbar(this);
    this.div.append(this._editToolbar.render());
    const { toolbarButtons: t2 } = this;
    if (t2) for (const [e2, i2] of t2) await this._editToolbar.addButton(e2, i2);
    this.hasComment || this._editToolbar.addButton("comment", this.addCommentButton());
    this._editToolbar.addButton("delete");
    return this._editToolbar;
  }
  addCommentButtonInToolbar() {
    this._editToolbar?.addButtonBefore("comment", this.addCommentButton(), ".deleteButton");
  }
  removeCommentButtonFromToolbar() {
    this._editToolbar?.removeButton("comment");
  }
  removeEditToolbar() {
    this._editToolbar?.remove();
    this._editToolbar = null;
    this.#h?.destroy();
  }
  addContainer(t2) {
    const e2 = this._editToolbar?.div;
    e2 ? e2.before(t2) : this.div.append(t2);
  }
  getClientDimensions() {
    return this.div.getBoundingClientRect();
  }
  createAltText() {
    if (!this.#h) {
      AltText.initialize(AnnotationEditor._l10n);
      this.#h = new AltText(this);
      if (this.#je) {
        this.#h.data = this.#je;
        this.#je = null;
      }
    }
    return this.#h;
  }
  get altTextData() {
    return this.#h?.data;
  }
  set altTextData(t2) {
    this.#h && (this.#h.data = t2);
  }
  get guessedAltText() {
    return this.#h?.guessedText;
  }
  async setGuessedAltText(t2) {
    await this.#h?.setGuessedText(t2);
  }
  serializeAltText(t2) {
    return this.#h?.serialize(t2);
  }
  hasAltText() {
    return !!this.#h && !this.#h.isEmpty();
  }
  hasAltTextData() {
    return this.#h?.hasData() ?? false;
  }
  focusCommentButton() {
    this.#c?.focusButton();
  }
  addCommentButton() {
    return this.canAddComment ? this.#c ||= new Comment(this) : null;
  }
  addStandaloneCommentButton() {
    if (this._uiManager.hasCommentManager()) {
      if (this.#ge) this._uiManager.isEditingMode() && this.#ge.classList.remove("hidden");
      else if (this.hasComment) {
        this.#ge = this.#c.renderForStandalone();
        this.div.append(this.#ge);
      }
    }
  }
  removeStandaloneCommentButton() {
    this.#c.removeStandaloneCommentButton();
    this.#ge = null;
  }
  hideStandaloneCommentButton() {
    this.#ge?.classList.add("hidden");
  }
  get comment() {
    if (!this.#c) return null;
    const { data: { richText: t2, text: e2, date: i2, deleted: n2 } } = this.#c;
    return { text: e2, richText: t2, date: i2, deleted: n2, color: this.getNonHCMColor(), opacity: this.opacity ?? 1 };
  }
  set comment(t2) {
    this.#c ||= new Comment(this);
    "object" == typeof t2 && null !== t2 ? this.#c.restoreData(t2) : this.#c.data = t2;
    if (this.hasComment) {
      this.removeCommentButtonFromToolbar();
      this.addStandaloneCommentButton();
      this._uiManager.updateComment(this);
    } else {
      this.addCommentButtonInToolbar();
      this.removeStandaloneCommentButton();
      this._uiManager.removeComment(this);
    }
  }
  setCommentData({ comment: t2, popupRef: e2, richText: i2 }) {
    if (!e2) return;
    this.#c ||= new Comment(this);
    this.#c.setInitialText(t2, i2);
    if (!this.annotationElementId) return;
    const n2 = this._uiManager.getAndRemoveDataFromAnnotationStorage(this.annotationElementId);
    n2 && this.updateFromAnnotationLayer(n2);
  }
  get hasEditedComment() {
    return this.#c?.hasBeenEdited();
  }
  get hasDeletedComment() {
    return this.#c?.isDeleted();
  }
  get hasComment() {
    return !!this.#c && !this.#c.isEmpty() && !this.#c.isDeleted();
  }
  async editComment(t2) {
    this.#c ||= new Comment(this);
    this.#c.edit(t2);
  }
  toggleComment(t2, e2 = void 0) {
    this.hasComment && this._uiManager.toggleComment(this, t2, e2);
  }
  setSelectedCommentButton(t2) {
    this.#c.setSelectedButton(t2);
  }
  addComment(t2) {
    if (this.hasEditedComment) {
      const e2 = 180, i2 = 100, [, , , n2] = t2.rect, [s2] = this.pageDimensions, [r2] = this.pageTranslation, a2 = r2 + s2 + 1, o2 = n2 - i2, l2 = a2 + e2;
      t2.popup = { contents: this.comment.text, deleted: this.comment.deleted, rect: [a2, o2, l2, n2] };
    }
  }
  updateFromAnnotationLayer({ popup: { contents: t2, deleted: e2 } }) {
    this.#c.data = e2 ? null : t2;
  }
  get parentBoundingClientRect() {
    return this.parent.boundingClientRect;
  }
  render() {
    const t2 = this.div = document.createElement("div");
    t2.setAttribute("data-editor-rotation", (360 - this.rotation) % 360);
    t2.className = this.name;
    t2.setAttribute("id", this.id);
    t2.tabIndex = this.#Ke ? -1 : 0;
    t2.setAttribute("role", "application");
    this.defaultL10nId && t2.setAttribute("data-l10n-id", this.defaultL10nId);
    this._isVisible || t2.classList.add("hidden");
    this.setInForeground();
    this.#Ei();
    const [e2, i2] = this.parentDimensions;
    if (this.parentRotation % 180 != 0) {
      t2.style.maxWidth = `${(100 * i2 / e2).toFixed(2)}%`;
      t2.style.maxHeight = `${(100 * e2 / i2).toFixed(2)}%`;
    }
    const [n2, s2] = this.getInitialTranslation();
    this.translate(n2, s2);
    bindEvents(this, t2, ["keydown", "pointerdown", "dblclick"]);
    this.#Si();
    this.addStandaloneCommentButton();
    this._uiManager._editorUndoBar?.hide();
    return t2;
  }
  #Ti() {
    this.#Ze = { savedX: this.x, savedY: this.y, savedWidth: this.width, savedHeight: this.height };
    this.#h?.toggle(false);
    this.parent.togglePointerEvents(false);
  }
  #_i(t2, e2, i2) {
    let n2 = i2 / e2 * 0.7 + 1 - 0.7;
    if (1 === n2) return;
    const s2 = this.#yi(this.rotation), transf = (t3, e3) => [s2[0] * t3 + s2[2] * e3, s2[1] * t3 + s2[3] * e3], [r2, a2] = this.parentDimensions, o2 = this.x, l2 = this.y, h2 = this.width, c2 = this.height, d2 = AnnotationEditor.MIN_SIZE / r2, u2 = AnnotationEditor.MIN_SIZE / a2;
    n2 = Math.max(Math.min(n2, 1 / h2, 1 / c2), d2 / h2, u2 / c2);
    const p2 = AnnotationEditor._round(h2 * n2), g2 = AnnotationEditor._round(c2 * n2);
    if (p2 === h2 && g2 === c2) return;
    this.#si ||= [o2, l2, h2, c2];
    const m2 = transf(h2 / 2, c2 / 2), f2 = AnnotationEditor._round(o2 + m2[0]), b2 = AnnotationEditor._round(l2 + m2[1]), y2 = transf(p2 / 2, g2 / 2);
    this.x = f2 - y2[0];
    this.y = b2 - y2[1];
    this.width = p2;
    this.height = g2;
    this.setDims();
    this.fixAndSetPosition();
    this._onResizing();
  }
  #ki() {
    this.#h?.toggle(true);
    this.parent.togglePointerEvents(true);
    this.#xi();
  }
  pointerdown(t2) {
    const { isMac: e2 } = FeatureTest.platform;
    if (0 !== t2.button || t2.ctrlKey && e2) t2.preventDefault();
    else {
      this.#ni = true;
      this._isDraggable ? this.#Di(t2) : this.#Pi(t2);
    }
  }
  #Pi(t2) {
    const { isMac: e2 } = FeatureTest.platform;
    t2.ctrlKey && !e2 || t2.shiftKey || t2.metaKey && e2 ? this.parent.toggleSelected(this) : this.parent.setSelected(this);
  }
  #Di(t2) {
    const { isSelected: e2 } = this;
    this._uiManager.setUpDragSession();
    let i2 = false;
    const n2 = new AbortController(), s2 = this._uiManager.combinedSignal(n2), r2 = { capture: true, passive: false, signal: s2 }, cancelDrag = (t3) => {
      n2.abort();
      this.#Ye = null;
      this.#ni = false;
      this._uiManager.endDragSession() || this.#Pi(t3);
      i2 && this._onStopDragging();
    };
    if (e2) {
      this.#hi = t2.clientX;
      this.#ci = t2.clientY;
      this.#Ye = t2.pointerId;
      this.#qe = t2.pointerType;
      window.addEventListener("pointermove", (t3) => {
        if (!i2) {
          i2 = true;
          this._uiManager.toggleComment(this, true, false);
          this._onStartDragging();
        }
        const { clientX: e3, clientY: n3, pointerId: s3 } = t3;
        if (s3 !== this.#Ye) {
          stopEvent(t3);
          return;
        }
        const [r3, a2] = this.screenToPageTranslation(e3 - this.#hi, n3 - this.#ci);
        this.#hi = e3;
        this.#ci = n3;
        this._uiManager.dragSelectedEditors(r3, a2);
        this.div.scrollIntoView({ block: "nearest" });
      }, r2);
      window.addEventListener("touchmove", stopEvent, r2);
      window.addEventListener("pointerdown", (t3) => {
        t3.pointerType === this.#qe && (this.#ui || t3.isPrimary) && cancelDrag(t3);
        stopEvent(t3);
      }, r2);
    }
    const pointerUpCallback = (t3) => {
      this.#Ye && this.#Ye !== t3.pointerId ? stopEvent(t3) : cancelDrag(t3);
    };
    window.addEventListener("pointerup", pointerUpCallback, { signal: s2 });
    window.addEventListener("blur", pointerUpCallback, { signal: s2 });
  }
  _onStartDragging() {
  }
  _onStopDragging() {
  }
  moveInDOM() {
    this.#li && clearTimeout(this.#li);
    this.#li = setTimeout(() => {
      this.#li = null;
      this.parent?.moveEditorInDOM(this);
    }, 0);
  }
  _setParentAndPosition(t2, e2, i2) {
    t2.changeParent(this);
    this.x = e2;
    this.y = i2;
    this.fixAndSetPosition();
    this._onTranslated();
  }
  getRect(t2, e2, i2 = this.rotation) {
    const n2 = this.parentScale, [s2, r2] = this.pageDimensions, [a2, o2] = this.pageTranslation, l2 = t2 / n2, h2 = e2 / n2, c2 = this.x * s2, d2 = this.y * r2, u2 = this.width * s2, p2 = this.height * r2;
    switch (i2) {
      case 0:
        return [c2 + l2 + a2, r2 - d2 - h2 - p2 + o2, c2 + l2 + u2 + a2, r2 - d2 - h2 + o2];
      case 90:
        return [c2 + h2 + a2, r2 - d2 + l2 + o2, c2 + h2 + p2 + a2, r2 - d2 + l2 + u2 + o2];
      case 180:
        return [c2 - l2 - u2 + a2, r2 - d2 + h2 + o2, c2 - l2 + a2, r2 - d2 + h2 + p2 + o2];
      case 270:
        return [c2 - h2 - p2 + a2, r2 - d2 - l2 - u2 + o2, c2 - h2 + a2, r2 - d2 - l2 + o2];
      default:
        throw new Error("Invalid rotation");
    }
  }
  getRectInCurrentCoords(t2, e2) {
    const [i2, n2, s2, r2] = t2, a2 = s2 - i2, o2 = r2 - n2;
    switch (this.rotation) {
      case 0:
        return [i2, e2 - r2, a2, o2];
      case 90:
        return [i2, e2 - n2, o2, a2];
      case 180:
        return [s2, e2 - n2, a2, o2];
      case 270:
        return [s2, e2 - r2, o2, a2];
      default:
        throw new Error("Invalid rotation");
    }
  }
  getPDFRect() {
    return this.getRect(0, 0);
  }
  getNonHCMColor() {
    return this.color && AnnotationEditor._colorManager.convert(this._uiManager.getNonHCMColor(this.color));
  }
  onUpdatedColor() {
    this.#c?.onUpdatedColor();
  }
  getData() {
    const { comment: { text: t2, color: e2, date: i2, opacity: n2, deleted: s2, richText: r2 }, uid: a2, pageIndex: o2, creationDate: l2, modificationDate: h2 } = this;
    return { id: a2, pageIndex: o2, rect: this.getPDFRect(), richText: r2, contentsObj: { str: t2 }, creationDate: l2, modificationDate: i2 || h2, popupRef: !s2, color: e2, opacity: n2 };
  }
  onceAdded(t2) {
  }
  isEmpty() {
    return false;
  }
  enableEditMode() {
    if (this.isInEditMode()) return false;
    this.parent.setEditingState(false);
    this.#ai = true;
    return true;
  }
  disableEditMode() {
    if (!this.isInEditMode()) return false;
    this.parent.setEditingState(true);
    this.#ai = false;
    return true;
  }
  isInEditMode() {
    return this.#ai;
  }
  shouldGetKeyboardEvents() {
    return this.#oi;
  }
  needsToBeRebuilt() {
    return this.div && !this.isAttachedToDOM;
  }
  get isOnScreen() {
    const { top: t2, left: e2, bottom: i2, right: n2 } = this.getClientDimensions(), { innerHeight: s2, innerWidth: r2 } = window;
    return e2 < r2 && n2 > 0 && t2 < s2 && i2 > 0;
  }
  #Ei() {
    if (this.#ei || !this.div) return;
    this.#ei = new AbortController();
    const t2 = this._uiManager.combinedSignal(this.#ei);
    this.div.addEventListener("focusin", this.focusin.bind(this), { signal: t2 });
    this.div.addEventListener("focusout", this.focusout.bind(this), { signal: t2 });
  }
  #Si() {
    !this.#ui && this.div && this.isResizable && this._uiManager._supportsPinchToZoom && (this.#ui = new TouchManager({ container: this.div, isPinchingDisabled: () => !this.isSelected, onPinchStart: this.#Ti.bind(this), onPinching: this.#_i.bind(this), onPinchEnd: this.#ki.bind(this), signal: this._uiManager._signal }));
  }
  rebuild() {
    this.#Ei();
    this.#Si();
  }
  rotate(t2) {
  }
  resize() {
  }
  serializeDeleted() {
    return { id: this.annotationElementId, deleted: true, pageIndex: this.pageIndex, popupRef: this._initialData?.popupRef || "" };
  }
  serialize(t2 = false, e2 = null) {
    return { annotationType: this.mode, pageIndex: this.pageIndex, rect: this.getPDFRect(), rotation: this.rotation, structTreeParentId: this._structTreeParentId, popupRef: this._initialData?.popupRef || "" };
  }
  static async deserialize(t2, e2, i2) {
    const n2 = new this.prototype.constructor({ parent: e2, id: i2.getId(), uiManager: i2, annotationElementId: t2.annotationElementId, creationDate: t2.creationDate, modificationDate: t2.modificationDate });
    n2.rotation = t2.rotation;
    n2.#je = t2.accessibilityData;
    n2._isCopy = t2.isCopy || false;
    const [s2, r2] = n2.pageDimensions, [a2, o2, l2, h2] = n2.getRectInCurrentCoords(t2.rect, r2);
    n2.x = a2 / s2;
    n2.y = o2 / r2;
    n2.width = l2 / s2;
    n2.height = h2 / r2;
    return n2;
  }
  get hasBeenModified() {
    return !!this.annotationElementId && (this.deleted || null !== this.serialize());
  }
  remove() {
    this.#ei?.abort();
    this.#ei = null;
    this.isEmpty() || this.commit();
    this.#ui?.destroy();
    this.#ui = null;
    this.parent ? this.parent.remove(this) : this._uiManager.removeEditor(this);
    this.hideCommentPopup();
    if (this.#li) {
      clearTimeout(this.#li);
      this.#li = null;
    }
    this.#mi();
    this.removeEditToolbar();
    if (this.#di) {
      for (const t2 of this.#di.values()) clearTimeout(t2);
      this.#di = null;
    }
    this.parent = null;
    this.#ti?.remove();
    this.#ti = null;
  }
  get isResizable() {
    return false;
  }
  makeResizable() {
    if (this.isResizable) {
      this.#vi();
      this.#Qe.classList.remove("hidden");
    }
  }
  get toolbarPosition() {
    return null;
  }
  get commentButtonPosition() {
    return "ltr" === this._uiManager.direction ? [1, 0] : [0, 0];
  }
  get commentButtonPositionInPage() {
    const { commentButtonPosition: [t2, e2] } = this, [i2, n2, s2, r2] = this.getPDFRect();
    return [AnnotationEditor._round(i2 + (s2 - i2) * t2), AnnotationEditor._round(n2 + (r2 - n2) * (1 - e2))];
  }
  get commentButtonColor() {
    return this._uiManager.makeCommentColor(this.getNonHCMColor(), this.opacity);
  }
  get commentPopupPosition() {
    return this.#c.commentPopupPositionInLayer;
  }
  set commentPopupPosition(t2) {
    this.#c.commentPopupPositionInLayer = t2;
  }
  hasDefaultPopupPosition() {
    return this.#c.hasDefaultPopupPosition();
  }
  get commentButtonWidth() {
    return this.#c.commentButtonWidth;
  }
  get elementBeforePopup() {
    return this.div;
  }
  setCommentButtonStates(t2) {
    this.#c?.setCommentButtonStates(t2);
  }
  keydown(t2) {
    if (!this.isResizable || t2.target !== this.div || "Enter" !== t2.key) return;
    this._uiManager.setSelected(this);
    this.#Ze = { savedX: this.x, savedY: this.y, savedWidth: this.width, savedHeight: this.height };
    const e2 = this.#Qe.children;
    if (!this.#Xe) {
      this.#Xe = Array.from(e2);
      const t3 = this.#Mi.bind(this), i3 = this.#Ii.bind(this), n3 = this._uiManager._signal;
      for (const e3 of this.#Xe) {
        const s3 = e3.getAttribute("data-resizer-name");
        e3.setAttribute("role", "spinbutton");
        e3.addEventListener("keydown", t3, { signal: n3 });
        e3.addEventListener("blur", i3, { signal: n3 });
        e3.addEventListener("focus", this.#Fi.bind(this, s3), { signal: n3 });
        e3.setAttribute("data-l10n-id", AnnotationEditor._l10nResizer[s3]);
      }
    }
    const i2 = this.#Xe[0];
    let n2 = 0;
    for (const t3 of e2) {
      if (t3 === i2) break;
      n2++;
    }
    const s2 = (360 - this.rotation + this.parentRotation) % 360 / 90 * (this.#Xe.length / 4);
    if (s2 !== n2) {
      if (s2 < n2) for (let t4 = 0; t4 < n2 - s2; t4++) this.#Qe.append(this.#Qe.firstElementChild);
      else if (s2 > n2) for (let t4 = 0; t4 < s2 - n2; t4++) this.#Qe.firstElementChild.before(this.#Qe.lastElementChild);
      let t3 = 0;
      for (const i3 of e2) {
        const e3 = this.#Xe[t3++].getAttribute("data-resizer-name");
        i3.setAttribute("data-l10n-id", AnnotationEditor._l10nResizer[e3]);
      }
    }
    this.#Bi(0);
    this.#oi = true;
    this.#Qe.firstElementChild.focus({ focusVisible: true });
    t2.preventDefault();
    t2.stopImmediatePropagation();
  }
  #Mi(t2) {
    AnnotationEditor._resizerKeyboardManager.exec(this, t2);
  }
  #Ii(t2) {
    this.#oi && t2.relatedTarget?.parentNode !== this.#Qe && this.#mi();
  }
  #Fi(t2) {
    this.#ii = this.#oi ? t2 : "";
  }
  #Bi(t2) {
    if (this.#Xe) for (const e2 of this.#Xe) e2.tabIndex = t2;
  }
  _resizeWithKeyboard(t2, e2) {
    this.#oi && this.#Ai(this.#ii, { deltaX: t2, deltaY: e2, fromKeyboard: true });
  }
  #mi() {
    this.#oi = false;
    this.#Bi(-1);
    this.#xi();
  }
  _stopResizingWithKeyboard() {
    this.#mi();
    this.div.focus();
  }
  select() {
    if (this.isSelected && this._editToolbar) this._editToolbar.show();
    else {
      this.isSelected = true;
      this.makeResizable();
      this.div?.classList.add("selectedEditor");
      if (this._editToolbar) {
        this._editToolbar?.show();
        this.#h?.toggleAltTextBadge(false);
      } else this.addEditToolbar().then(() => {
        this.div?.classList.contains("selectedEditor") && this._editToolbar?.show();
      });
    }
  }
  focus() {
    this.div && !this.div.contains(document.activeElement) && setTimeout(() => this.div?.focus({ preventScroll: true }), 0);
  }
  unselect() {
    if (this.isSelected) {
      this.isSelected = false;
      this.#Qe?.classList.add("hidden");
      this.div?.classList.remove("selectedEditor");
      this.div?.contains(document.activeElement) && this._uiManager.currentLayer.div.focus({ preventScroll: true });
      this._editToolbar?.hide();
      this.#h?.toggleAltTextBadge(true);
      this.hideCommentPopup();
    }
  }
  hideCommentPopup() {
    this.hasComment && this._uiManager.toggleComment(null);
  }
  updateParams(t2, e2) {
  }
  disableEditing() {
  }
  enableEditing() {
  }
  get canChangeContent() {
    return false;
  }
  enterInEditMode() {
    if (this.canChangeContent) {
      this.enableEditMode();
      this.div.focus();
    }
  }
  dblclick(t2) {
    if ("BUTTON" !== t2.target.nodeName) {
      this.enterInEditMode();
      this.parent.updateToolbar({ mode: this.constructor._editorType, editId: this.uid });
    }
  }
  getElementForAltText() {
    return this.div;
  }
  get contentDiv() {
    return this.div;
  }
  get isEditing() {
    return this.#ri;
  }
  set isEditing(t2) {
    this.#ri = t2;
    if (this.parent) if (t2) {
      this.parent.setSelected(this);
      this.parent.setActiveEditor(this);
    } else this.parent.setActiveEditor(null);
  }
  static get MIN_SIZE() {
    return 16;
  }
  static canCreateNewEmptyEditor() {
    return true;
  }
  get telemetryInitialData() {
    return { action: "added" };
  }
  get telemetryFinalData() {
    return null;
  }
  _reportTelemetry(t2, e2 = false) {
    if (e2) {
      this.#di ||= /* @__PURE__ */ new Map();
      const { action: e3 } = t2;
      let i2 = this.#di.get(e3);
      i2 && clearTimeout(i2);
      i2 = setTimeout(() => {
        this._reportTelemetry(t2);
        this.#di.delete(e3);
        0 === this.#di.size && (this.#di = null);
      }, AnnotationEditor._telemetryTimeout);
      this.#di.set(e3, i2);
      return;
    }
    t2.type ||= this.editorType;
    this._uiManager._eventBus.dispatch("reporttelemetry", { source: this, details: { type: "editing", data: t2 } });
  }
  show(t2 = this._isVisible) {
    this.div.classList.toggle("hidden", !t2);
    this._isVisible = t2;
  }
  enable() {
    this.div && (this.div.tabIndex = 0);
    this.#Ke = false;
  }
  disable() {
    this.div && (this.div.tabIndex = -1);
    this.#Ke = true;
  }
  updateFakeAnnotationElement(t2) {
    if (this.#ti || this.deleted) if (this.deleted) {
      this.#ti.remove();
      this.#ti = null;
    } else (this.hasEditedComment || this._hasBeenMoved || this._hasBeenResized) && this.#ti.updateEdited({ rect: this.getPDFRect(), popup: this.comment });
    else this.#ti = t2.addFakeAnnotation(this);
  }
  renderAnnotationElement(t2) {
    if (this.deleted) {
      t2.hide();
      return null;
    }
    let e2 = t2.container.querySelector(".annotationContent");
    if (e2) {
      if ("CANVAS" === e2.nodeName) {
        const t3 = e2;
        e2 = document.createElement("div");
        e2.classList.add("annotationContent", this.editorType);
        t3.before(e2);
      }
    } else {
      e2 = document.createElement("div");
      e2.classList.add("annotationContent", this.editorType);
      t2.container.prepend(e2);
    }
    return e2;
  }
  resetAnnotationElement(t2) {
    const { firstElementChild: e2 } = t2.container;
    "DIV" === e2?.nodeName && e2.classList.contains("annotationContent") && e2.remove();
  }
}
class FakeEditor extends AnnotationEditor {
  constructor(t2) {
    super(t2);
    this.annotationElementId = t2.annotationElementId;
    this.deleted = true;
  }
  serialize() {
    return this.serializeDeleted();
  }
}
const q = 3285377520, Q = 4294901760, J = 65535;
class MurmurHash3_64 {
  constructor(t2) {
    this.h1 = t2 ? 4294967295 & t2 : q;
    this.h2 = t2 ? 4294967295 & t2 : q;
  }
  update(t2) {
    let e2, i2;
    if ("string" == typeof t2) {
      e2 = new Uint8Array(2 * t2.length);
      i2 = 0;
      for (let n3 = 0, s3 = t2.length; n3 < s3; n3++) {
        const s4 = t2.charCodeAt(n3);
        if (s4 <= 255) e2[i2++] = s4;
        else {
          e2[i2++] = s4 >>> 8;
          e2[i2++] = 255 & s4;
        }
      }
    } else {
      if (!ArrayBuffer.isView(t2)) throw new Error("Invalid data format, must be a string or TypedArray.");
      e2 = t2.slice();
      i2 = e2.byteLength;
    }
    const n2 = i2 >> 2, s2 = i2 - 4 * n2, r2 = new Uint32Array(e2.buffer, 0, n2);
    let a2 = 0, o2 = 0, l2 = this.h1, h2 = this.h2;
    const c2 = 3432918353, d2 = 461845907, u2 = 11601, p2 = 13715;
    for (let t3 = 0; t3 < n2; t3++) if (1 & t3) {
      a2 = r2[t3];
      a2 = a2 * c2 & Q | a2 * u2 & J;
      a2 = a2 << 15 | a2 >>> 17;
      a2 = a2 * d2 & Q | a2 * p2 & J;
      l2 ^= a2;
      l2 = l2 << 13 | l2 >>> 19;
      l2 = 5 * l2 + 3864292196;
    } else {
      o2 = r2[t3];
      o2 = o2 * c2 & Q | o2 * u2 & J;
      o2 = o2 << 15 | o2 >>> 17;
      o2 = o2 * d2 & Q | o2 * p2 & J;
      h2 ^= o2;
      h2 = h2 << 13 | h2 >>> 19;
      h2 = 5 * h2 + 3864292196;
    }
    a2 = 0;
    switch (s2) {
      case 3:
        a2 ^= e2[4 * n2 + 2] << 16;
      case 2:
        a2 ^= e2[4 * n2 + 1] << 8;
      case 1:
        a2 ^= e2[4 * n2];
        a2 = a2 * c2 & Q | a2 * u2 & J;
        a2 = a2 << 15 | a2 >>> 17;
        a2 = a2 * d2 & Q | a2 * p2 & J;
        1 & n2 ? l2 ^= a2 : h2 ^= a2;
    }
    this.h1 = l2;
    this.h2 = h2;
  }
  hexdigest() {
    let t2 = this.h1, e2 = this.h2;
    t2 ^= e2 >>> 1;
    t2 = 3981806797 * t2 & Q | 36045 * t2 & J;
    e2 = 4283543511 * e2 & Q | (2950163797 * (e2 << 16 | t2 >>> 16) & Q) >>> 16;
    t2 ^= e2 >>> 1;
    t2 = 444984403 * t2 & Q | 60499 * t2 & J;
    e2 = 3301882366 * e2 & Q | (3120437893 * (e2 << 16 | t2 >>> 16) & Q) >>> 16;
    t2 ^= e2 >>> 1;
    return (t2 >>> 0).toString(16).padStart(8, "0") + (e2 >>> 0).toString(16).padStart(8, "0");
  }
}
const Z = Object.freeze({ map: null, hash: "", transfer: void 0 });
class AnnotationStorage {
  #Oi = false;
  #Ri = null;
  #Li = null;
  #Ni = /* @__PURE__ */ new Map();
  onSetModified = null;
  onResetModified = null;
  onAnnotationEditor = null;
  getValue(t2, e2) {
    const i2 = this.#Ni.get(t2);
    return void 0 === i2 ? e2 : Object.assign(e2, i2);
  }
  getRawValue(t2) {
    return this.#Ni.get(t2);
  }
  remove(t2) {
    const e2 = this.#Ni.get(t2);
    if (void 0 !== e2) {
      e2 instanceof AnnotationEditor && this.#Li.delete(e2.annotationElementId);
      this.#Ni.delete(t2);
      0 === this.#Ni.size && this.resetModified();
      this.#Ni.values().some((t3) => t3 instanceof AnnotationEditor) || this.onAnnotationEditor?.(null);
    }
  }
  setValue(t2, e2) {
    const i2 = this.#Ni.get(t2);
    let n2 = false;
    if (void 0 !== i2) {
      for (const [t3, s2] of Object.entries(e2)) if (i2[t3] !== s2) {
        n2 = true;
        i2[t3] = s2;
      }
    } else {
      n2 = true;
      this.#Ni.set(t2, e2);
    }
    n2 && this.#Ui();
    if (e2 instanceof AnnotationEditor) {
      (this.#Li ||= /* @__PURE__ */ new Map()).set(e2.annotationElementId, e2);
      this.onAnnotationEditor?.(e2.constructor._type);
    }
  }
  has(t2) {
    return this.#Ni.has(t2);
  }
  get size() {
    return this.#Ni.size;
  }
  #Ui() {
    if (!this.#Oi) {
      this.#Oi = true;
      this.onSetModified?.();
    }
  }
  resetModified() {
    if (this.#Oi) {
      this.#Oi = false;
      this.onResetModified?.();
    }
  }
  get print() {
    return new PrintAnnotationStorage(this);
  }
  get serializable() {
    if (0 === this.#Ni.size) return Z;
    const t2 = /* @__PURE__ */ new Map(), e2 = new MurmurHash3_64(), i2 = [], n2 = /* @__PURE__ */ Object.create(null);
    let s2 = false;
    for (const [i3, r2] of this.#Ni) {
      const a2 = r2 instanceof AnnotationEditor ? r2.serialize(false, n2) : r2;
      if (r2.page) {
        r2.pageIndex = r2.page._pageIndex;
        delete r2.page;
      }
      if (a2) {
        t2.set(i3, a2);
        e2.update(`${i3}:${JSON.stringify(a2)}`);
        s2 ||= !!a2.bitmap;
      }
    }
    if (s2) for (const e3 of t2.values()) e3.bitmap && i2.push(e3.bitmap);
    return t2.size > 0 ? { map: t2, hash: e2.hexdigest(), transfer: i2 } : Z;
  }
  get editorStats() {
    let t2 = null;
    const e2 = /* @__PURE__ */ new Map();
    let i2 = 0, n2 = 0;
    for (const s2 of this.#Ni.values()) {
      if (!(s2 instanceof AnnotationEditor)) {
        s2.popup && (s2.popup.deleted ? n2 += 1 : i2 += 1);
        continue;
      }
      s2.isCommentDeleted ? n2 += 1 : s2.hasEditedComment && (i2 += 1);
      const r2 = s2.telemetryFinalData;
      if (!r2) continue;
      const { type: a2 } = r2;
      e2.getOrInsertComputed(a2, () => Object.getPrototypeOf(s2).constructor);
      t2 ||= /* @__PURE__ */ Object.create(null);
      const o2 = t2[a2] ||= /* @__PURE__ */ new Map();
      for (const [t3, e3] of Object.entries(r2)) {
        if ("type" === t3) continue;
        const i3 = o2.getOrInsertComputed(t3, makeMap);
        i3.set(e3, (i3.get(e3) ?? 0) + 1);
      }
    }
    if (n2 > 0 || i2 > 0) {
      t2 ||= /* @__PURE__ */ Object.create(null);
      t2.comments = { deleted: n2, edited: i2 };
    }
    if (!t2) return null;
    for (const [i3, n3] of e2) t2[i3] = n3.computeTelemetryFinalData(t2[i3]);
    return t2;
  }
  resetModifiedIds() {
    this.#Ri = null;
  }
  updateEditor(t2, e2) {
    const i2 = this.#Li?.get(t2);
    if (i2) {
      i2.updateFromAnnotationLayer(e2);
      return true;
    }
    return false;
  }
  getEditor(t2) {
    return this.#Li?.get(t2) || null;
  }
  get modifiedIds() {
    if (this.#Ri) return this.#Ri;
    const t2 = [];
    if (this.#Li) for (const e3 of this.#Li.values()) e3.serialize() && t2.push(e3.annotationElementId);
    let e2 = "";
    if (t2.length) {
      const i2 = new MurmurHash3_64();
      i2.update(t2.join(","));
      e2 = i2.hexdigest();
    }
    return this.#Ri = { ids: new Set(t2), hash: e2 };
  }
  [Symbol.iterator]() {
    return this.#Ni.entries();
  }
}
class PrintAnnotationStorage extends AnnotationStorage {
  #Hi = Z;
  constructor(t2) {
    super();
    const { serializable: e2 } = t2;
    if (e2 === Z) return;
    const { map: i2, hash: n2, transfer: s2 } = e2, r2 = structuredClone(i2, s2 ? { transfer: s2 } : null);
    this.#Hi = { map: r2, hash: n2, transfer: [] };
  }
  get print() {
    unreachable("Should not call PrintAnnotationStorage.print");
  }
  get serializable() {
    return this.#Hi;
  }
  get modifiedIds() {
    return shadow(this, "modifiedIds", { ids: /* @__PURE__ */ new Set(), hash: "" });
  }
}
const tt = "__forcedDependency", { floor: et, ceil: it } = Math;
function expandBBox(t2, e2, i2, n2, s2, r2) {
  t2[4 * e2 + 0] = Math.min(t2[4 * e2 + 0], i2);
  t2[4 * e2 + 1] = Math.min(t2[4 * e2 + 1], n2);
  t2[4 * e2 + 2] = Math.max(t2[4 * e2 + 2], s2);
  t2[4 * e2 + 3] = Math.max(t2[4 * e2 + 3], r2);
}
const nt = new Uint32Array(new Uint8Array([255, 255, 0, 0]).buffer)[0];
class BBoxReader {
  #zi;
  #Gi;
  constructor(t2, e2) {
    this.#zi = t2;
    this.#Gi = e2;
  }
  get length() {
    return this.#zi.length;
  }
  isEmpty(t2) {
    return this.#zi[t2] === nt;
  }
  minX(t2) {
    return this.#Gi[4 * t2 + 0] / 256;
  }
  minY(t2) {
    return this.#Gi[4 * t2 + 1] / 256;
  }
  maxX(t2) {
    return (this.#Gi[4 * t2 + 2] + 1) / 256;
  }
  maxY(t2) {
    return (this.#Gi[4 * t2 + 3] + 1) / 256;
  }
}
const ensureDebugMetadata = (t2, e2) => t2?.getOrInsertComputed(e2, () => ({ dependencies: /* @__PURE__ */ new Set(), isRenderingOperation: false }));
class CanvasBBoxTracker {
  #Vi = [[1, 0, 0, 1, 0, 0]];
  #Wi = [-1 / 0, -1 / 0, 1 / 0, 1 / 0];
  #$i = new Float64Array(e);
  _pendingBBoxIdx = -1;
  #ji;
  #Xi;
  #Ki;
  #zi;
  _savesStack = [];
  _markedContentStack = [];
  constructor(t2, e2) {
    this.#ji = t2.width;
    this.#Xi = t2.height;
    this.#Yi(e2);
  }
  growOperationsCount(t2) {
    t2 >= this.#zi.length && this.#Yi(t2, this.#zi);
  }
  #Yi(t2, e2) {
    const i2 = new ArrayBuffer(4 * t2);
    this.#Ki = new Uint8ClampedArray(i2);
    this.#zi = new Uint32Array(i2);
    if (e2 && e2.length > 0) {
      this.#zi.set(e2);
      this.#zi.fill(nt, e2.length);
    } else this.#zi.fill(nt);
  }
  get clipBox() {
    return this.#Wi;
  }
  save(t2) {
    this.#Wi = { __proto__: this.#Wi };
    this._savesStack.push(t2);
    return this;
  }
  restore(t2, e2) {
    const i2 = Object.getPrototypeOf(this.#Wi);
    if (null === i2) return this;
    this.#Wi = i2;
    const n2 = this._savesStack.pop();
    if (void 0 !== n2) {
      e2?.(n2, t2);
      this.#zi[t2] = this.#zi[n2];
    }
    return this;
  }
  recordOpenMarker(t2) {
    this._savesStack.push(t2);
    return this;
  }
  getOpenMarker() {
    return 0 === this._savesStack.length ? null : this._savesStack.at(-1);
  }
  recordCloseMarker(t2, e2) {
    const i2 = this._savesStack.pop();
    if (void 0 !== i2) {
      e2?.(i2, t2);
      this.#zi[t2] = this.#zi[i2];
    }
    return this;
  }
  beginMarkedContent(t2) {
    this._markedContentStack.push(t2);
    return this;
  }
  endMarkedContent(t2, e2) {
    const i2 = this._markedContentStack.pop();
    if (void 0 !== i2) {
      e2?.(i2, t2);
      this.#zi[t2] = this.#zi[i2];
    }
    return this;
  }
  pushBaseTransform(t2) {
    this.#Vi.push(Util.multiplyByDOMMatrix(this.#Vi.at(-1), t2.getTransform()));
    return this;
  }
  popBaseTransform() {
    this.#Vi.length > 1 && this.#Vi.pop();
    return this;
  }
  resetBBox(t2) {
    if (this._pendingBBoxIdx !== t2) {
      this._pendingBBoxIdx = t2;
      this.#$i.set(e, 0);
    }
    return this;
  }
  recordClipBox(t2, i2, n2, s2, r2, a2) {
    const o2 = Util.multiplyByDOMMatrix(this.#Vi.at(-1), i2.getTransform()), l2 = e.slice();
    Util.axialAlignedBoundingBox([n2, r2, s2, a2], o2, l2);
    const h2 = Util.intersect(this.#Wi, l2);
    if (h2) {
      this.#Wi[0] = h2[0];
      this.#Wi[1] = h2[1];
      this.#Wi[2] = h2[2];
      this.#Wi[3] = h2[3];
    } else {
      this.#Wi[0] = this.#Wi[1] = 1 / 0;
      this.#Wi[2] = this.#Wi[3] = -1 / 0;
    }
    return this;
  }
  recordBBox(t2, i2, n2, s2, r2, a2) {
    const o2 = this.#Wi;
    if (o2[0] === 1 / 0) return this;
    const l2 = Util.multiplyByDOMMatrix(this.#Vi.at(-1), i2.getTransform());
    if (o2[0] === -1 / 0) {
      Util.axialAlignedBoundingBox([n2, r2, s2, a2], l2, this.#$i);
      return this;
    }
    const h2 = e.slice();
    Util.axialAlignedBoundingBox([n2, r2, s2, a2], l2, h2);
    this.#$i[0] = MathClamp(h2[0], o2[0], this.#$i[0]);
    this.#$i[1] = MathClamp(h2[1], o2[1], this.#$i[1]);
    this.#$i[2] = MathClamp(h2[2], this.#$i[2], o2[2]);
    this.#$i[3] = MathClamp(h2[3], this.#$i[3], o2[3]);
    return this;
  }
  recordFullPageBBox(t2) {
    this.#$i[0] = Math.max(0, this.#Wi[0]);
    this.#$i[1] = Math.max(0, this.#Wi[1]);
    this.#$i[2] = Math.min(this.#ji, this.#Wi[2]);
    this.#$i[3] = Math.min(this.#Xi, this.#Wi[3]);
    return this;
  }
  recordOperation(t2, e2 = false, i2) {
    if (this._pendingBBoxIdx !== t2) return this;
    const n2 = et(256 * this.#$i[0] / this.#ji), s2 = et(256 * this.#$i[1] / this.#Xi), r2 = it(256 * this.#$i[2] / this.#ji), a2 = it(256 * this.#$i[3] / this.#Xi);
    expandBBox(this.#Ki, t2, n2, s2, r2, a2);
    if (i2) for (const e3 of i2) for (const i3 of e3) i3 !== t2 && expandBBox(this.#Ki, i3, n2, s2, r2, a2);
    e2 || (this._pendingBBoxIdx = -1);
    return this;
  }
  bboxToClipBoxDropOperation(t2) {
    if (this._pendingBBoxIdx === t2) {
      this._pendingBBoxIdx = -1;
      this.#Wi[0] = Math.max(this.#Wi[0], this.#$i[0]);
      this.#Wi[1] = Math.max(this.#Wi[1], this.#$i[1]);
      this.#Wi[2] = Math.min(this.#Wi[2], this.#$i[2]);
      this.#Wi[3] = Math.min(this.#Wi[3], this.#$i[3]);
    }
    return this;
  }
  take() {
    return new BBoxReader(this.#zi, this.#Ki);
  }
  takeDebugMetadata() {
    throw new Error("Unreachable");
  }
  recordSimpleData(t2, e2) {
    return this;
  }
  recordIncrementalData(t2, e2) {
    return this;
  }
  resetIncrementalData(t2, e2) {
    return this;
  }
  recordNamedData(t2, e2) {
    return this;
  }
  recordSimpleDataFromNamed(t2, e2, i2) {
    return this;
  }
  recordFutureForcedDependency(t2, e2) {
    return this;
  }
  inheritSimpleDataAsFutureForcedDependencies(t2) {
    return this;
  }
  inheritPendingDependenciesAsFutureForcedDependencies() {
    return this;
  }
  recordCharacterBBox(t2, e2, i2, n2 = 1, s2 = 0, r2 = 0, a2) {
    return this;
  }
  getSimpleIndex(t2) {
  }
  recordDependencies(t2, e2) {
    return this;
  }
  recordNamedDependency(t2, e2) {
    return this;
  }
  recordShowTextOperation(t2, e2 = false) {
    return this;
  }
}
class CanvasDependencyTracker {
  #qi = { __proto__: null };
  #Qi = { __proto__: null, transform: [], moveText: [], sameLineText: [], [tt]: [] };
  #Ji = /* @__PURE__ */ new Map();
  #Zi = /* @__PURE__ */ new Set();
  #tn = /* @__PURE__ */ new Map();
  #en;
  #in;
  #nn;
  constructor(t2, e2 = false) {
    this.#nn = t2;
    if (e2) {
      this.#en = /* @__PURE__ */ new Map();
      this.#in = (t3, e3) => {
        ensureDebugMetadata(this.#en, e3).dependencies.add(t3);
      };
    }
  }
  get clipBox() {
    return this.#nn.clipBox;
  }
  growOperationsCount(t2) {
    this.#nn.growOperationsCount(t2);
  }
  save(t2) {
    this.#qi = { __proto__: this.#qi };
    this.#Qi = { __proto__: this.#Qi, transform: { __proto__: this.#Qi.transform }, moveText: { __proto__: this.#Qi.moveText }, sameLineText: { __proto__: this.#Qi.sameLineText }, [tt]: { __proto__: this.#Qi[tt] } };
    this.#nn.save(t2);
    return this;
  }
  restore(t2) {
    this.#nn.restore(t2, this.#in);
    const e2 = Object.getPrototypeOf(this.#qi);
    if (null === e2) return this;
    this.#qi = e2;
    this.#Qi = Object.getPrototypeOf(this.#Qi);
    return this;
  }
  recordOpenMarker(t2) {
    this.#nn.recordOpenMarker(t2, this.#in);
    return this;
  }
  getOpenMarker() {
    return this.#nn.getOpenMarker();
  }
  recordCloseMarker(t2) {
    this.#nn.recordCloseMarker(t2, this.#in);
    return this;
  }
  beginMarkedContent(t2) {
    this.#nn.beginMarkedContent(t2);
    return this;
  }
  endMarkedContent(t2) {
    this.#nn.endMarkedContent(t2, this.#in);
    return this;
  }
  pushBaseTransform(t2) {
    this.#nn.pushBaseTransform(t2);
    return this;
  }
  popBaseTransform() {
    this.#nn.popBaseTransform();
    return this;
  }
  recordSimpleData(t2, e2) {
    this.#qi[t2] = e2;
    return this;
  }
  recordIncrementalData(t2, e2) {
    this.#Qi[t2].push(e2);
    return this;
  }
  resetIncrementalData(t2, e2) {
    this.#Qi[t2].length = 0;
    return this;
  }
  recordNamedData(t2, e2) {
    this.#Ji.set(t2, e2);
    return this;
  }
  recordSimpleDataFromNamed(t2, e2, i2) {
    this.#qi[t2] = this.#Ji.get(e2) ?? i2;
  }
  recordFutureForcedDependency(t2, e2) {
    this.recordIncrementalData(tt, e2);
    return this;
  }
  inheritSimpleDataAsFutureForcedDependencies(t2) {
    for (const e2 of t2) e2 in this.#qi && this.recordFutureForcedDependency(e2, this.#qi[e2]);
    return this;
  }
  inheritPendingDependenciesAsFutureForcedDependencies() {
    for (const t2 of this.#Zi) this.recordFutureForcedDependency(tt, t2);
    return this;
  }
  resetBBox(t2) {
    this.#nn.resetBBox(t2);
    return this;
  }
  recordClipBox(t2, e2, i2, n2, s2, r2) {
    this.#nn.recordClipBox(t2, e2, i2, n2, s2, r2);
    return this;
  }
  recordBBox(t2, e2, i2, n2, s2, r2) {
    this.#nn.recordBBox(t2, e2, i2, n2, s2, r2);
    return this;
  }
  recordCharacterBBox(t2, e2, i2, n2 = 1, s2 = 0, r2 = 0, a2) {
    const o2 = i2.bbox;
    let l2, h2;
    if (o2) {
      l2 = o2[2] !== o2[0] && o2[3] !== o2[1] && this.#tn.get(i2);
      if (false !== l2) {
        h2 = [0, 0, 0, 0];
        Util.axialAlignedBoundingBox(o2, i2.fontMatrix, h2);
        1 === n2 && 0 === s2 && 0 === r2 || (function scaleCharBBox(t3, e3, i3, n3, s3) {
          let r3;
          if (t3) {
            if (t3 < 0) {
              r3 = s3[0];
              s3[0] = s3[2];
              s3[2] = r3;
            }
            s3[0] *= t3;
            s3[2] *= t3;
            if (e3 < 0) {
              r3 = s3[1];
              s3[1] = s3[3];
              s3[3] = r3;
            }
            s3[1] *= e3;
            s3[3] *= e3;
          } else s3.fill(0);
          s3[0] += i3;
          s3[1] += n3;
          s3[2] += i3;
          s3[3] += n3;
        })(n2, -n2, s2, r2, h2);
        if (l2) return this.recordBBox(t2, e2, h2[0], h2[2], h2[1], h2[3]);
      }
    }
    if (!a2) return this.recordFullPageBBox(t2);
    const c2 = a2();
    if (o2 && h2 && void 0 === l2) {
      l2 = h2[0] <= s2 - c2.actualBoundingBoxLeft && h2[2] >= s2 + c2.actualBoundingBoxRight && h2[1] <= r2 - c2.actualBoundingBoxAscent && h2[3] >= r2 + c2.actualBoundingBoxDescent;
      this.#tn.set(i2, l2);
      if (l2) return this.recordBBox(t2, e2, h2[0], h2[2], h2[1], h2[3]);
    }
    return this.recordBBox(t2, e2, s2 - c2.actualBoundingBoxLeft, s2 + c2.actualBoundingBoxRight, r2 - c2.actualBoundingBoxAscent, r2 + c2.actualBoundingBoxDescent);
  }
  recordFullPageBBox(t2) {
    this.#nn.recordFullPageBBox(t2);
    return this;
  }
  getSimpleIndex(t2) {
    return this.#qi[t2];
  }
  recordDependencies(t2, e2) {
    const i2 = this.#Zi, n2 = this.#qi, s2 = this.#Qi;
    for (const t3 of e2) t3 in this.#qi ? i2.add(n2[t3]) : t3 in s2 && s2[t3].forEach(i2.add, i2);
    return this;
  }
  recordNamedDependency(t2, e2) {
    this.#Ji.has(e2) && this.#Zi.add(this.#Ji.get(e2));
    return this;
  }
  recordOperation(t2, e2 = false) {
    this.recordDependencies(t2, [tt]);
    if (this.#en) {
      const e3 = ensureDebugMetadata(this.#en, t2), { dependencies: i3 } = e3;
      this.#Zi.forEach(i3.add, i3);
      this.#nn._savesStack.forEach(i3.add, i3);
      this.#nn._markedContentStack.forEach(i3.add, i3);
      i3.delete(t2);
      e3.isRenderingOperation = true;
    }
    const i2 = !e2 && t2 === this.#nn._pendingBBoxIdx;
    this.#nn.recordOperation(t2, e2, [this.#Zi, this.#nn._savesStack, this.#nn._markedContentStack]);
    i2 && this.#Zi.clear();
    return this;
  }
  recordShowTextOperation(t2, e2 = false) {
    const i2 = Array.from(this.#Zi);
    this.recordOperation(t2, e2);
    this.recordIncrementalData("sameLineText", t2);
    for (const t3 of i2) this.recordIncrementalData("sameLineText", t3);
    return this;
  }
  bboxToClipBoxDropOperation(t2, e2 = false) {
    const i2 = !e2 && t2 === this.#nn._pendingBBoxIdx;
    this.#nn.bboxToClipBoxDropOperation(t2);
    i2 && this.#Zi.clear();
    return this;
  }
  take() {
    this.#tn.clear();
    return this.#nn.take();
  }
  takeDebugMetadata() {
    return this.#en;
  }
}
class CanvasNestedDependencyTracker {
  #sn;
  #rn;
  #an;
  #on = 0;
  #ln = 0;
  constructor(t2, e2, i2) {
    if (t2 instanceof CanvasNestedDependencyTracker && t2.#an === !!i2) return t2;
    this.#sn = t2;
    this.#rn = e2;
    this.#an = !!i2;
  }
  get clipBox() {
    return this.#sn.clipBox;
  }
  growOperationsCount() {
    throw new Error("Unreachable");
  }
  save(t2) {
    this.#ln++;
    this.#sn.save(this.#rn);
    return this;
  }
  restore(t2) {
    if (this.#ln > 0) {
      this.#sn.restore(this.#rn);
      this.#ln--;
    }
    return this;
  }
  recordOpenMarker(t2) {
    this.#on++;
    return this;
  }
  getOpenMarker() {
    return this.#on > 0 ? this.#rn : this.#sn.getOpenMarker();
  }
  recordCloseMarker(t2) {
    this.#on--;
    return this;
  }
  beginMarkedContent(t2) {
    return this;
  }
  endMarkedContent(t2) {
    return this;
  }
  pushBaseTransform(t2) {
    this.#sn.pushBaseTransform(t2);
    return this;
  }
  popBaseTransform() {
    this.#sn.popBaseTransform();
    return this;
  }
  recordSimpleData(t2, e2) {
    this.#sn.recordSimpleData(t2, this.#rn);
    return this;
  }
  recordIncrementalData(t2, e2) {
    this.#sn.recordIncrementalData(t2, this.#rn);
    return this;
  }
  resetIncrementalData(t2, e2) {
    this.#sn.resetIncrementalData(t2, this.#rn);
    return this;
  }
  recordNamedData(t2, e2) {
    return this;
  }
  recordSimpleDataFromNamed(t2, e2, i2) {
    this.#sn.recordSimpleDataFromNamed(t2, e2, this.#rn);
    return this;
  }
  recordFutureForcedDependency(t2, e2) {
    this.#sn.recordFutureForcedDependency(t2, this.#rn);
    return this;
  }
  inheritSimpleDataAsFutureForcedDependencies(t2) {
    this.#sn.inheritSimpleDataAsFutureForcedDependencies(t2);
    return this;
  }
  inheritPendingDependenciesAsFutureForcedDependencies() {
    this.#sn.inheritPendingDependenciesAsFutureForcedDependencies();
    return this;
  }
  resetBBox(t2) {
    this.#an || this.#sn.resetBBox(this.#rn);
    return this;
  }
  recordClipBox(t2, e2, i2, n2, s2, r2) {
    this.#an || this.#sn.recordClipBox(this.#rn, e2, i2, n2, s2, r2);
    return this;
  }
  recordBBox(t2, e2, i2, n2, s2, r2) {
    this.#an || this.#sn.recordBBox(this.#rn, e2, i2, n2, s2, r2);
    return this;
  }
  recordCharacterBBox(t2, e2, i2, n2, s2, r2, a2) {
    this.#an || this.#sn.recordCharacterBBox(this.#rn, e2, i2, n2, s2, r2, a2);
    return this;
  }
  recordFullPageBBox(t2) {
    this.#an || this.#sn.recordFullPageBBox(this.#rn);
    return this;
  }
  getSimpleIndex(t2) {
    return this.#sn.getSimpleIndex(t2);
  }
  recordDependencies(t2, e2) {
    this.#sn.recordDependencies(this.#rn, e2);
    return this;
  }
  recordNamedDependency(t2, e2) {
    this.#sn.recordNamedDependency(this.#rn, e2);
    return this;
  }
  recordOperation(t2) {
    this.#sn.recordOperation(this.#rn, true);
    return this;
  }
  recordShowTextOperation(t2) {
    this.#sn.recordShowTextOperation(this.#rn, true);
    return this;
  }
  bboxToClipBoxDropOperation(t2) {
    this.#an || this.#sn.bboxToClipBoxDropOperation(this.#rn, true);
    return this;
  }
  take() {
    throw new Error("Unreachable");
  }
  takeDebugMetadata() {
    throw new Error("Unreachable");
  }
}
const st = ["path", "transform", "filter", "strokeColor", "strokeAlpha", "lineWidth", "lineCap", "lineJoin", "miterLimit", "dash"], rt = ["path", "transform", "filter", "fillColor", "fillAlpha", "globalCompositeOperation", "SMask"], at = ["transform", "SMask", "filter", "fillAlpha", "strokeAlpha", "globalCompositeOperation"], ot = ["filter", "fillColor", "fillAlpha"], lt = ["transform", "leading", "charSpacing", "wordSpacing", "hScale", "textRise", "moveText", "textMatrix", "font", "fontObj", "filter", "fillColor", "textRenderingMode", "SMask", "fillAlpha", "strokeAlpha", "globalCompositeOperation", "sameLineText"], ht = ["transform"], ct = ["transform", "filter", "fillColor"];
class CanvasImagesTracker {
  #ji;
  #Xi;
  #hn = 4;
  #cn = 0;
  #Gi = new CanvasImagesTracker.#dn(6 * this.#hn);
  static #dn = FeatureTest.isFloat16ArraySupported ? Float16Array : Float32Array;
  constructor(t2) {
    this.#ji = t2.width;
    this.#Xi = t2.height;
  }
  record(t2, i2, n2, s2) {
    if (this.#cn === this.#hn) {
      this.#hn *= 2;
      const t3 = new CanvasImagesTracker.#dn(6 * this.#hn);
      t3.set(this.#Gi);
      this.#Gi = t3;
    }
    const r2 = getCurrentTransform(t2);
    let a2;
    if (s2[0] !== 1 / 0) {
      const t3 = e.slice();
      Util.axialAlignedBoundingBox([0, -n2, i2, 0], r2, t3);
      const o2 = Util.intersect(s2, t3);
      if (!o2) return;
      const [l2, h2, c2, d2] = o2;
      if (l2 !== t3[0] || h2 !== t3[1] || c2 !== t3[2] || d2 !== t3[3]) {
        const t4 = Math.atan2(r2[1], r2[0]), e2 = Math.abs(Math.sin(t4)), i3 = Math.abs(Math.cos(t4));
        if (e2 < 1e-6 || i3 < 1e-6 || Math.abs(e2 - i3) < 1e-6) a2 = [l2, h2, l2, d2, c2, h2];
        else {
          const t5 = c2 - l2, n3 = d2 - h2, s3 = e2 * e2, r3 = i3 * i3, o3 = i3 * e2, u2 = r3 - s3, p2 = (n3 * r3 - t5 * o3) / u2;
          a2 = [l2 + (n3 * o3 - t5 * s3) / u2, h2, l2, h2 + p2, c2, d2 - p2];
        }
      }
    }
    if (!a2) {
      a2 = [0, -n2, 0, 0, i2, -n2];
      Util.applyTransform(a2, r2, 0);
      Util.applyTransform(a2, r2, 2);
      Util.applyTransform(a2, r2, 4);
    }
    a2[0] /= this.#ji;
    a2[1] /= this.#Xi;
    a2[2] /= this.#ji;
    a2[3] /= this.#Xi;
    a2[4] /= this.#ji;
    a2[5] /= this.#Xi;
    this.#Gi.set(a2, 6 * this.#cn);
    this.#cn++;
  }
  take() {
    return this.#Gi.subarray(0, 6 * this.#cn);
  }
}
const dt = /\p{Cc}/u;
function serializeFontFamily(t2) {
  if ((function isCSSString(t3) {
    const e2 = t3[0];
    if (t3.length < 2 || '"' !== e2 && "'" !== e2 || t3.at(-1) !== e2) return false;
    const i2 = t3.length - 1;
    for (let n2 = 1; n2 < i2; n2++) {
      const s2 = t3[n2];
      if (s2 === e2 || dt.test(s2)) return false;
      if ("\\" === s2 && (++n2 >= i2 || dt.test(t3[n2]))) return false;
    }
    return true;
  })(t2)) return t2;
  return `"${t2.replaceAll(/["\\\p{Cc}]/gu, (t3) => '"' === t3 || "\\" === t3 ? `\\${t3}` : `\\${t3.codePointAt(0).toString(16)} `)}"`;
}
class FontLoader {
  #un = /* @__PURE__ */ new Set();
  #pn = /* @__PURE__ */ new Set();
  #gn = null;
  constructor({ ownerDocument: t2 = globalThis.document, styleElement: e2 = null }) {
    this._document = t2;
    this.styleElement = null;
    this.loadingRequests = [];
    this.loadTestFontId = 0;
  }
  addNativeFontFace(t2) {
    this.#un.add(t2);
    this._document.fonts.add(t2);
  }
  removeNativeFontFace(t2) {
    this.#un.delete(t2);
    this._document.fonts.delete(t2);
  }
  insertRule(t2) {
    const e2 = this.#mn();
    e2.insertRule(t2, e2.cssRules.length);
  }
  #mn() {
    if (this.#gn) return this.#gn;
    const t2 = this._document.defaultView?.CSSStyleSheet || globalThis.CSSStyleSheet;
    if (!this.styleElement && t2) {
      const { adoptedStyleSheets: e2 } = this._document;
      if (e2) {
        const i2 = new t2();
        e2.push(i2);
        return this.#gn = i2;
      }
    }
    if (!this.styleElement) {
      this.styleElement = this._document.createElement("style");
      this._document.documentElement.getElementsByTagName("head")[0].append(this.styleElement);
    }
    return this.#gn = this.styleElement.sheet;
  }
  clear() {
    for (const t2 of this.#un) this._document.fonts.delete(t2);
    this.#un.clear();
    this.#pn.clear();
    if (this.#gn) {
      const { adoptedStyleSheets: t2 } = this._document;
      t2?.includes(this.#gn) && (this._document.adoptedStyleSheets = t2.filter((t3) => t3 !== this.#gn));
      this.#gn = null;
    }
    this.styleElement?.remove();
    this.styleElement = null;
  }
  async loadSystemFont({ systemFontInfo: t2, disableFontFace: e2, _inspectFont: i2 }) {
    if (t2 && !this.#pn.has(t2.loadedName)) {
      assert(!e2, "loadSystemFont shouldn't be called when `disableFontFace` is set.");
      if (this.isFontLoadingAPISupported) {
        const { loadedName: e3, src: n2, style: s2 } = t2, r2 = new FontFace(e3, n2, s2);
        this.addNativeFontFace(r2);
        try {
          await r2.load();
          this.#pn.add(e3);
          i2?.(t2);
        } catch {
          warn(`Cannot load system font: ${t2.baseFontName}, installing it could help to improve PDF rendering.`);
          this.removeNativeFontFace(r2);
        }
        return;
      }
      unreachable("Not implemented: loadSystemFont without the Font Loading API.");
    }
  }
  async bind(t2) {
    if (t2.attached || t2.missingFile && !t2.systemFontInfo) return;
    t2.attached = true;
    if (t2.systemFontInfo) {
      await this.loadSystemFont(t2);
      return;
    }
    if (this.isFontLoadingAPISupported) {
      const e3 = t2.createNativeFontFace();
      if (e3) {
        this.addNativeFontFace(e3);
        try {
          await e3.loaded;
        } catch (i2) {
          warn(`Failed to load font '${e3.family}': '${i2}'.`);
          t2.disableFontFace = true;
          throw i2;
        }
      }
      return;
    }
    const e2 = t2.createFontFaceRule();
    if (e2) {
      this.insertRule(e2);
      if (this.isSyncFontLoadingSupported) return;
      await this.#fn(t2);
    }
  }
  get isFontLoadingAPISupported() {
    return shadow(this, "isFontLoadingAPISupported", !!this._document?.fonts);
  }
  get isSyncFontLoadingSupported() {
    return shadow(this, "isSyncFontLoadingSupported", t || FeatureTest.platform.isFirefox);
  }
  #fn(t2) {
    const { loadingRequests: e2 } = this, { promise: i2, resolve: n2 } = Promise.withResolvers(), s2 = { done: false, resolve: n2 };
    e2.push(s2);
    this._loadTestFont ??= atob("T1RUTwALAIAAAwAwQ0ZGIDHtZg4AAAOYAAAAgUZGVE1lkzZwAAAEHAAAABxHREVGABQAFQAABDgAAAAeT1MvMlYNYwkAAAEgAAAAYGNtYXABDQLUAAACNAAAAUJoZWFk/xVFDQAAALwAAAA2aGhlYQdkA+oAAAD0AAAAJGhtdHgD6AAAAAAEWAAAAAZtYXhwAAJQAAAAARgAAAAGbmFtZVjmdH4AAAGAAAAAsXBvc3T/hgAzAAADeAAAACAAAQAAAAEAALZRFsRfDzz1AAsD6AAAAADOBOTLAAAAAM4KHDwAAAAAA+gDIQAAAAgAAgAAAAAAAAABAAADIQAAAFoD6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAAAQAAUAAAAgAAAAQD6AH0AAUAAAKKArwAAACMAooCvAAAAeAAMQECAAACAAYJAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAuAC4DIP84AFoDIQAAAAAAAQAAAAAAAAAAACAAIAABAAAADgCuAAEAAAAAAAAAAQAAAAEAAAAAAAEAAQAAAAEAAAAAAAIAAQAAAAEAAAAAAAMAAQAAAAEAAAAAAAQAAQAAAAEAAAAAAAUAAQAAAAEAAAAAAAYAAQAAAAMAAQQJAAAAAgABAAMAAQQJAAEAAgABAAMAAQQJAAIAAgABAAMAAQQJAAMAAgABAAMAAQQJAAQAAgABAAMAAQQJAAUAAgABAAMAAQQJAAYAAgABWABYAAAAAAAAAwAAAAMAAAAcAAEAAAAAADwAAwABAAAAHAAEACAAAAAEAAQAAQAAAC7//wAAAC7////TAAEAAAAAAAABBgAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAD/gwAyAAAAAQAAAAAAAAAAAAAAAAAAAAABAAQEAAEBAQJYAAEBASH4DwD4GwHEAvgcA/gXBIwMAYuL+nz5tQXkD5j3CBLnEQACAQEBIVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYAAABAQAADwACAQEEE/t3Dov6fAH6fAT+fPp8+nwHDosMCvm1Cvm1DAz6fBQAAAAAAAABAAAAAMmJbzEAAAAAzgTjFQAAAADOBOQpAAEAAAAAAAAADAAUAAQAAAABAAAAAgABAAAAAAAAAAAD6AAAAAAAAA==");
    function int32(t3, e3) {
      return t3.charCodeAt(e3) << 24 | t3.charCodeAt(e3 + 1) << 16 | t3.charCodeAt(e3 + 2) << 8 | 255 & t3.charCodeAt(e3 + 3);
    }
    function spliceString(t3, e3, i3, n3) {
      return t3.substring(0, e3) + n3 + t3.substring(e3 + i3);
    }
    let r2, a2;
    const o2 = this._document.createElement("canvas");
    o2.width = 1;
    o2.height = 1;
    const l2 = o2.getContext("2d");
    let h2 = 0;
    const c2 = `lt${Date.now()}${this.loadTestFontId++}`;
    let d2 = this._loadTestFont;
    d2 = spliceString(d2, 976, c2.length, c2);
    const u2 = 1482184792;
    let p2 = int32(d2, 16);
    for (r2 = 0, a2 = c2.length - 3; r2 < a2; r2 += 4) p2 = p2 - u2 + int32(c2, r2) | 0;
    r2 < c2.length && (p2 = p2 - u2 + int32(c2 + "XXX", r2) | 0);
    d2 = spliceString(d2, 16, 4, (function string32(t3) {
      return String.fromCharCode(t3 >> 24 & 255, t3 >> 16 & 255, t3 >> 8 & 255, 255 & t3);
    })(p2));
    const g2 = `@font-face {font-family:"${c2}";src:${`url(data:font/opentype;base64,${btoa(d2)});`}}`;
    this.insertRule(g2);
    const m2 = this._document.createElement("div");
    m2.style.visibility = "hidden";
    m2.style.width = m2.style.height = "10px";
    m2.style.position = "absolute";
    m2.style.top = m2.style.left = "0px";
    for (const e3 of [t2.loadedName, c2]) {
      const t3 = this._document.createElement("span");
      t3.textContent = "Hi";
      t3.style.fontFamily = e3;
      m2.append(t3);
    }
    this._document.body.append(m2);
    !(function isFontReady(t3, e3) {
      if (++h2 > 30) {
        warn("Load test font never loaded.");
        e3();
        return;
      }
      l2.font = "30px " + t3;
      l2.fillText(".", 0, 20);
      l2.getImageData(0, 0, 1, 1).data[3] > 0 ? e3() : setTimeout(isFontReady.bind(null, t3, e3));
    })(c2, () => {
      m2.remove();
      !(function completeRequest() {
        assert(!s2.done, "completeRequest() cannot be called twice.");
        s2.done = true;
        for (; e2.length > 0 && e2[0].done; ) {
          const t3 = e2.shift();
          setTimeout(t3.resolve, 0);
        }
      })();
    });
    return i2;
  }
}
class FontFaceObject {
  #bn = /* @__PURE__ */ new Map();
  #yn;
  constructor(t2, e2 = null, i2, n2) {
    this.#yn = t2;
    this._inspectFont = e2;
    i2 && (this.charProcOperatorList = i2);
    n2 && Object.assign(this, n2);
  }
  createNativeFontFace() {
    const { data: t2 } = this;
    if (!t2 || this.disableFontFace) return null;
    let e2;
    if (this.cssFontInfo) {
      const i2 = { weight: this.cssFontInfo.fontWeight };
      this.cssFontInfo.italicAngle && (i2.style = `oblique ${this.cssFontInfo.italicAngle}deg`);
      e2 = new FontFace(serializeFontFamily(this.cssFontInfo.fontFamily), t2, i2);
    } else e2 = new FontFace(this.loadedName, t2, {});
    this._inspectFont?.(this);
    return e2;
  }
  createFontFaceRule() {
    const { data: t2 } = this;
    if (!t2 || this.disableFontFace) return null;
    const e2 = `url(data:${this.mimetype};base64,${t2.toBase64()});`;
    let i2;
    if (this.cssFontInfo) {
      let t3 = `font-weight: ${this.cssFontInfo.fontWeight};`;
      this.cssFontInfo.italicAngle && (t3 += `font-style: oblique ${this.cssFontInfo.italicAngle}deg;`);
      i2 = `@font-face {font-family:${serializeFontFamily(this.cssFontInfo.fontFamily)};${t3}src:${e2}}`;
    } else i2 = `@font-face {font-family:"${this.loadedName}";src:${e2}}`;
    this._inspectFont?.(this, e2);
    return i2;
  }
  getPathGenerator(t2, e2) {
    let i2 = this.#bn.get(e2);
    if (i2) return i2;
    const n2 = `${this.loadedName}_path_${e2}`;
    let s2;
    try {
      s2 = t2.get(n2);
    } catch (t3) {
      warn(`getPathGenerator - ignoring character: "${t3}".`);
    }
    i2 = makePathFromDrawOPS(s2?.path);
    this.fontExtraProperties || t2.delete(n2);
    this.#bn.set(e2, i2);
    return i2;
  }
  get black() {
    return this.#yn.black;
  }
  get bold() {
    return this.#yn.bold;
  }
  get disableFontFace() {
    return this.#yn.disableFontFace;
  }
  set disableFontFace(t2) {
    shadow(this, "disableFontFace", !!t2);
  }
  get fontExtraProperties() {
    return this.#yn.fontExtraProperties;
  }
  get isInvalidPDFjsFont() {
    return this.#yn.isInvalidPDFjsFont;
  }
  get isType3Font() {
    return this.#yn.isType3Font;
  }
  get italic() {
    return this.#yn.italic;
  }
  get missingFile() {
    return this.#yn.missingFile;
  }
  get remeasure() {
    return this.#yn.remeasure;
  }
  get vertical() {
    return this.#yn.vertical;
  }
  get bbox() {
    return this.#yn.bbox;
  }
  get fontMatrix() {
    return this.#yn.fontMatrix;
  }
  get fallbackName() {
    return this.#yn.fallbackName;
  }
  get loadedName() {
    return this.#yn.loadedName;
  }
  get mimetype() {
    return this.missingFile ? null : "font/opentype";
  }
  get data() {
    return this.#yn.data;
  }
  clearData() {
    this.#yn.clearData();
  }
  get cssFontInfo() {
    return this.#yn.cssFontInfo;
  }
  get systemFontInfo() {
    return this.#yn.systemFontInfo;
  }
}
class CSS_FONT_INFO {
  static strings = ["fontFamily", "fontWeight", "italicAngle"];
}
class SYSTEM_FONT_INFO {
  static strings = ["css", "loadedName", "baseFontName", "src"];
}
class FONT_INFO {
  static bools = ["black", "bold", "disableFontFace", "fontExtraProperties", "isInvalidPDFjsFont", "isType3Font", "italic", "missingFile", "remeasure", "vertical"];
  static strings = ["fallbackName", "loadedName"];
  static OFFSET_BBOX = Math.ceil(2 * this.bools.length / 8);
  static OFFSET_FONT_MATRIX = this.OFFSET_BBOX + 1 + 8;
  static OFFSET_STRINGS = this.OFFSET_FONT_MATRIX + 1 + 48;
}
class PATTERN_INFO {
  static KIND = 0;
  static HAS_BBOX = 1;
  static HAS_BACKGROUND = 2;
  static SHADING_TYPE = 3;
  static N_COORD = 4;
  static N_COLOR = 8;
  static N_STOP = 12;
  static N_FIGURES = 16;
}
class InfoUtils {
  static get decoder() {
    return shadow(this, "decoder", new TextDecoder());
  }
  static get encoder() {
    return shadow(this, "encoder", new TextEncoder());
  }
}
function readString(t2, e2, i2, n2 = 0) {
  const { decoder: s2 } = InfoUtils;
  for (let t3 = 0; t3 < i2; t3++) n2 += e2.getUint32(n2) + 4;
  const r2 = e2.getUint32(n2);
  return s2.decode(new Uint8Array(t2, n2 + 4, r2));
}
class CssFontInfo {
  #vn;
  #wn;
  constructor(t2) {
    this.#vn = t2;
    this.#wn = new DataView(t2);
  }
  #An(t2) {
    assert(t2 < CSS_FONT_INFO.strings.length, "Invalid string index");
    return readString(this.#vn, this.#wn, t2);
  }
  get fontFamily() {
    return shadow(this, "fontFamily", this.#An(0));
  }
  get fontWeight() {
    return shadow(this, "fontWeight", this.#An(1));
  }
  get italicAngle() {
    return shadow(this, "italicAngle", this.#An(2));
  }
}
class SystemFontInfo {
  #vn;
  #wn;
  constructor(t2) {
    this.#vn = t2;
    this.#wn = new DataView(t2);
  }
  #An(t2) {
    assert(t2 < SYSTEM_FONT_INFO.strings.length, "Invalid string index");
    return readString(this.#vn, this.#wn, t2, 4);
  }
  get css() {
    return shadow(this, "css", this.#An(0));
  }
  get loadedName() {
    return shadow(this, "loadedName", this.#An(1));
  }
  get baseFontName() {
    return shadow(this, "baseFontName", this.#An(2));
  }
  get src() {
    return shadow(this, "src", this.#An(3));
  }
  get style() {
    let t2 = 0;
    t2 += 4 + this.#wn.getUint32(t2);
    return shadow(this, "style", { style: readString(this.#vn, this.#wn, 0, t2), weight: readString(this.#vn, this.#wn, 1, t2) });
  }
}
class FontInfo {
  #vn;
  #wn;
  constructor(t2) {
    this.#vn = t2;
    this.#wn = new DataView(t2);
  }
  #xn(t2) {
    assert(t2 < FONT_INFO.bools.length, "Invalid boolean index");
    const e2 = Math.floor(t2 / 4), i2 = 2 * t2 % 8, n2 = this.#wn.getUint8(e2) >> i2 & 3;
    return 0 === n2 ? void 0 : 2 === n2;
  }
  get black() {
    return shadow(this, "black", this.#xn(0));
  }
  get bold() {
    return shadow(this, "bold", this.#xn(1));
  }
  get disableFontFace() {
    return shadow(this, "disableFontFace", this.#xn(2));
  }
  get fontExtraProperties() {
    return shadow(this, "fontExtraProperties", this.#xn(3));
  }
  get isInvalidPDFjsFont() {
    return shadow(this, "isInvalidPDFjsFont", this.#xn(4));
  }
  get isType3Font() {
    return shadow(this, "isType3Font", this.#xn(5));
  }
  get italic() {
    return shadow(this, "italic", this.#xn(6));
  }
  get missingFile() {
    return shadow(this, "missingFile", this.#xn(7));
  }
  get remeasure() {
    return shadow(this, "remeasure", this.#xn(8));
  }
  get vertical() {
    return shadow(this, "vertical", this.#xn(9));
  }
  #Cn(t2, e2, i2, n2) {
    const s2 = this.#wn.getUint8(t2++);
    if (0 === s2) return;
    assert(s2 === e2, "Invalid array length.");
    const r2 = new Array(s2);
    for (let e3 = 0; e3 < s2; e3++) {
      r2[e3] = this.#wn[i2](t2, true);
      t2 += n2;
    }
    return r2;
  }
  get bbox() {
    return shadow(this, "bbox", this.#Cn(FONT_INFO.OFFSET_BBOX, 4, "getInt16", 2));
  }
  get fontMatrix() {
    return shadow(this, "fontMatrix", this.#Cn(FONT_INFO.OFFSET_FONT_MATRIX, 6, "getFloat64", 8));
  }
  #An(t2) {
    assert(t2 < FONT_INFO.strings.length, "Invalid string index");
    return readString(this.#vn, this.#wn, t2, FONT_INFO.OFFSET_STRINGS + 4);
  }
  get fallbackName() {
    return shadow(this, "fallbackName", this.#An(0));
  }
  get loadedName() {
    return shadow(this, "loadedName", this.#An(1));
  }
  #En(t2) {
    let e2 = FONT_INFO.OFFSET_STRINGS;
    for (let i2 = 0; i2 <= t2; i2++) e2 += 4 + this.#wn.getUint32(e2);
    return { offset: e2, length: this.#wn.getUint32(e2) };
  }
  get data() {
    const { offset: t2, length: e2 } = this.#En(2);
    return e2 ? new Uint8Array(this.#vn, t2 + 4, e2) : void 0;
  }
  clearData() {
    const { offset: t2, length: e2 } = this.#En(2);
    if (e2) {
      this.#wn.setUint32(t2, 0);
      this.#vn = new Uint8Array(this.#vn, 0, t2 + 4).slice().buffer;
      this.#wn = new DataView(this.#vn);
    }
  }
  get cssFontInfo() {
    const { offset: t2, length: e2 } = this.#En(1);
    let i2 = null;
    if (e2) {
      const n2 = new Uint8Array(this.#vn, t2 + 4, e2).slice();
      i2 = new CssFontInfo(n2.buffer);
    }
    return shadow(this, "cssFontInfo", i2);
  }
  get systemFontInfo() {
    const { offset: t2, length: e2 } = this.#En(0);
    let i2 = null;
    if (e2) {
      const n2 = new Uint8Array(this.#vn, t2 + 4, e2).slice();
      i2 = new SystemFontInfo(n2.buffer);
    }
    return shadow(this, "systemFontInfo", i2);
  }
}
class PatternInfo {
  constructor(t2) {
    this.buffer = t2;
    this.view = new DataView(t2);
    this.data = new Uint8Array(t2);
  }
  getIR() {
    const t2 = this.view, i2 = this.data[PATTERN_INFO.KIND], n2 = !!this.data[PATTERN_INFO.HAS_BBOX], s2 = !!this.data[PATTERN_INFO.HAS_BACKGROUND], r2 = t2.getUint32(PATTERN_INFO.N_COORD, true), a2 = t2.getUint32(PATTERN_INFO.N_COLOR, true), o2 = t2.getUint32(PATTERN_INFO.N_STOP, true);
    let l2 = 20;
    const h2 = new Float32Array(this.buffer, l2, 2 * r2);
    l2 += 8 * r2;
    const c2 = new Uint8Array(this.buffer, l2, 4 * a2);
    l2 += 4 * a2;
    const d2 = [];
    for (let e2 = 0; e2 < o2; ++e2) {
      const e3 = t2.getFloat32(l2, true);
      l2 += 4;
      const i3 = t2.getUint32(l2, true);
      l2 += 4;
      d2.push([e3, `#${i3.toString(16).padStart(6, "0")}`]);
    }
    let u2 = null;
    if (n2) {
      u2 = [];
      for (let e2 = 0; e2 < 4; ++e2) {
        u2.push(t2.getFloat32(l2, true));
        l2 += 4;
      }
    }
    let p2 = null;
    if (s2) {
      p2 = new Uint8Array(this.buffer, l2, 3);
      l2 += 3;
    }
    if (1 === i2) return ["RadialAxial", "axial", u2, d2, [h2[0], h2[1]], [h2[2], h2[3]], null, null];
    if (2 === i2) return ["RadialAxial", "radial", u2, d2, [h2[0], h2[1]], [h2[3], h2[4]], h2[2], h2[5]];
    if (3 === i2) {
      const t3 = this.data[PATTERN_INFO.SHADING_TYPE];
      let i3 = null;
      if (h2.length > 0) {
        i3 = e.slice();
        for (let t4 = 0, e2 = h2.length; t4 < e2; t4 += 2) Util.pointBoundingBox(h2[t4], h2[t4 + 1], i3);
      }
      return ["Mesh", t3, h2, c2, r2, i3, u2, p2];
    }
    throw new Error(`Unsupported pattern kind: ${i2}`);
  }
}
class FontPathInfo {
  #vn;
  constructor(t2) {
    this.#vn = t2;
  }
  get path() {
    return FeatureTest.isFloat16ArraySupported ? new Float16Array(this.#vn) : new Float32Array(this.#vn);
  }
}
function getFactoryUrlProp(t2) {
  if ("string" != typeof t2) return null;
  if (t2.endsWith("/")) return t2;
  throw new Error(`Invalid factory url: "${t2}" must include trailing slash.`);
}
const isRefProxy = (t2) => "object" == typeof t2 && Number.isInteger(t2?.num) && t2.num >= 0 && Number.isInteger(t2?.gen) && t2.gen >= 0, ut = function _isValidExplicitDest(t2, e2, i2) {
  if (!Array.isArray(i2) || i2.length < 2) return false;
  const [n2, s2, ...r2] = i2;
  if (!t2(n2) && !Number.isInteger(n2)) return false;
  if (!e2(s2)) return false;
  const a2 = r2.length;
  let o2 = true;
  switch (s2.name) {
    case "XYZ":
      if (a2 < 2 || a2 > 3) return false;
      break;
    case "Fit":
    case "FitB":
      return 0 === a2;
    case "FitH":
    case "FitBH":
    case "FitV":
    case "FitBV":
      if (a2 > 1) return false;
      break;
    case "FitR":
      if (4 !== a2) return false;
      o2 = false;
      break;
    default:
      return false;
  }
  for (const t3 of r2) if (!("number" == typeof t3 || o2 && null === t3)) return false;
  return true;
}.bind(null, isRefProxy, (t2) => "object" == typeof t2 && "string" == typeof t2?.name);
class LoopbackPort {
  #Sn = /* @__PURE__ */ new Map();
  #Tn = Promise.resolve();
  postMessage(t2, e2) {
    const i2 = { data: structuredClone(t2, e2 ? { transfer: e2 } : null) };
    this.#Tn.then(() => {
      for (const [t3] of this.#Sn) t3.call(this, i2);
    });
  }
  addEventListener(t2, e2, i2 = null) {
    let n2 = null;
    if (i2?.signal instanceof AbortSignal) {
      const { signal: s2 } = i2;
      if (s2.aborted) {
        warn("LoopbackPort - cannot use an `aborted` signal.");
        return;
      }
      const onAbort = () => this.removeEventListener(t2, e2);
      n2 = () => s2.removeEventListener("abort", onAbort);
      s2.addEventListener("abort", onAbort);
    }
    this.#Sn.set(e2, n2);
  }
  removeEventListener(t2, e2) {
    const i2 = this.#Sn.get(e2);
    i2?.();
    this.#Sn.delete(e2);
  }
  terminate() {
    for (const [, t2] of this.#Sn) t2?.();
    this.#Sn.clear();
  }
}
const pt = 1, gt = 2, mt = 1, ft = 2, bt = 3, yt = 4, vt = 5, wt = 6, At = 7, xt = 8;
function onFn() {
}
function wrapReason(t2) {
  if (t2 instanceof AbortException || t2 instanceof InvalidPDFException || t2 instanceof PasswordException || t2 instanceof ResponseException || t2 instanceof UnknownErrorException) return t2;
  t2 instanceof Error || "object" == typeof t2 && null !== t2 || unreachable('wrapReason: Expected "reason" to be a (possibly cloned) Error.');
  switch (t2.name) {
    case "AbortException":
      return new AbortException(t2.message);
    case "InvalidPDFException":
      return new InvalidPDFException(t2.message);
    case "PasswordException":
      return new PasswordException(t2.message, t2.code);
    case "ResponseException":
      return new ResponseException(t2.message, t2.status, t2.missing);
    case "UnknownErrorException":
      return new UnknownErrorException(t2.message, t2.details);
  }
  return new UnknownErrorException(t2.message, t2.toString());
}
class MessageHandler {
  #_n = /* @__PURE__ */ new Map();
  #kn = /* @__PURE__ */ new Map();
  #Dn = 1;
  #Pn;
  #Mn = new AbortController();
  #In;
  #Fn = /* @__PURE__ */ new Map();
  #Bn = 1;
  #On = /* @__PURE__ */ new Map();
  #Rn;
  constructor(t2, e2, i2) {
    this.#In = t2;
    this.#Rn = e2;
    this.#Pn = i2;
    i2.addEventListener("message", this.#Ln.bind(this), { signal: this.#Mn.signal });
  }
  #Ln({ data: t2 }) {
    if (t2.targetName !== this.#In) return;
    if (t2.stream) {
      this.#Nn(t2);
      return;
    }
    if (t2.callback) {
      const { callbackId: e3, callback: i2 } = t2, n2 = this.#kn.get(e3);
      if (!n2) throw new Error(`Cannot resolve callback ${e3}`);
      this.#kn.delete(e3);
      if (i2 === pt) n2.resolve(t2.data);
      else {
        if (i2 !== gt) throw new Error("Unexpected callback case");
        n2.reject(wrapReason(t2.reason));
      }
      return;
    }
    const e2 = this.#_n.get(t2.action);
    if (!e2) throw new Error(`Unknown action from worker: ${t2.action}`);
    if (t2.callbackId) {
      const i2 = this.#In, n2 = t2.sourceName, s2 = this.#Pn;
      Promise.try(e2, t2.data).then((e3) => {
        s2.postMessage({ sourceName: i2, targetName: n2, callback: pt, callbackId: t2.callbackId, data: e3 });
      }, (e3) => {
        s2.postMessage({ sourceName: i2, targetName: n2, callback: gt, callbackId: t2.callbackId, reason: wrapReason(e3) });
      });
      return;
    }
    t2.streamId ? this.#Un(t2) : e2(t2.data);
  }
  on(t2, e2) {
    const i2 = this.#_n;
    if (i2.has(t2)) throw new Error(`There is already a "${t2}" handler.`);
    i2.set(t2, e2);
  }
  send(t2, e2, i2) {
    this.#Pn.postMessage({ sourceName: this.#In, targetName: this.#Rn, action: t2, data: e2 }, i2);
  }
  sendWithPromise(t2, e2, i2) {
    const n2 = this.#Dn++, s2 = Promise.withResolvers();
    this.#kn.set(n2, s2);
    try {
      this.#Pn.postMessage({ sourceName: this.#In, targetName: this.#Rn, action: t2, callbackId: n2, data: e2 }, i2);
    } catch (t3) {
      s2.reject(t3);
    }
    return s2.promise;
  }
  sendWithStream(t2, e2, i2, n2) {
    const s2 = this.#Bn++, r2 = this.#In, a2 = this.#Rn, o2 = this.#Pn;
    return new ReadableStream({ start: (i3) => {
      const l2 = Promise.withResolvers();
      this.#Fn.set(s2, { controller: i3, startCall: l2, pullCall: null, cancelCall: null, isClosed: false });
      o2.postMessage({ sourceName: r2, targetName: a2, action: t2, streamId: s2, data: e2, desiredSize: i3.desiredSize }, n2);
      return l2.promise;
    }, pull: (t3) => {
      const e3 = Promise.withResolvers();
      this.#Fn.get(s2).pullCall = e3;
      o2.postMessage({ sourceName: r2, targetName: a2, stream: wt, streamId: s2, desiredSize: t3.desiredSize });
      return e3.promise;
    }, cancel: (t3) => {
      assert(t3 instanceof Error, "cancel must have a valid reason");
      const e3 = Promise.withResolvers();
      this.#Fn.get(s2).cancelCall = e3;
      this.#Fn.get(s2).isClosed = true;
      o2.postMessage({ sourceName: r2, targetName: a2, stream: mt, streamId: s2, reason: wrapReason(t3) });
      return e3.promise;
    } }, i2);
  }
  #Un(t2) {
    const e2 = t2.streamId, i2 = this.#In, n2 = t2.sourceName, s2 = this.#Pn, r2 = this.#On, a2 = this.#_n.get(t2.action), o2 = { enqueue(t3, r3 = 1, a3) {
      if (this.isCancelled) return;
      const o3 = this.desiredSize;
      this.desiredSize -= r3;
      if (o3 > 0 && this.desiredSize <= 0) {
        this.sinkCapability = Promise.withResolvers();
        this.ready = this.sinkCapability.promise;
      }
      s2.postMessage({ sourceName: i2, targetName: n2, stream: yt, streamId: e2, chunk: t3 }, a3);
    }, close() {
      if (!this.isCancelled) {
        this.isCancelled = true;
        s2.postMessage({ sourceName: i2, targetName: n2, stream: bt, streamId: e2 });
        r2.delete(e2);
      }
    }, error(t3) {
      assert(t3 instanceof Error, "error must have a valid reason");
      if (!this.isCancelled) {
        this.isCancelled = true;
        s2.postMessage({ sourceName: i2, targetName: n2, stream: vt, streamId: e2, reason: wrapReason(t3) });
      }
    }, sinkCapability: Promise.withResolvers(), onPull: null, onCancel: null, isCancelled: false, desiredSize: t2.desiredSize, ready: null };
    o2.sinkCapability.resolve();
    o2.ready = o2.sinkCapability.promise;
    r2.set(e2, o2);
    Promise.try(a2, t2.data, o2).then(() => {
      s2.postMessage({ sourceName: i2, targetName: n2, stream: xt, streamId: e2, success: true });
    }, (t3) => {
      s2.postMessage({ sourceName: i2, targetName: n2, stream: xt, streamId: e2, reason: wrapReason(t3) });
    });
  }
  #Nn(t2) {
    const e2 = t2.streamId, i2 = this.#In, n2 = t2.sourceName, s2 = this.#Pn, r2 = this.#Fn.get(e2), a2 = this.#On.get(e2);
    switch (t2.stream) {
      case xt:
        t2.success ? r2.startCall.resolve() : r2.startCall.reject(wrapReason(t2.reason));
        break;
      case At:
        t2.success ? r2.pullCall.resolve() : r2.pullCall.reject(wrapReason(t2.reason));
        break;
      case wt:
        if (!a2) {
          s2.postMessage({ sourceName: i2, targetName: n2, stream: At, streamId: e2, success: true });
          break;
        }
        a2.desiredSize <= 0 && t2.desiredSize > 0 && a2.sinkCapability.resolve();
        a2.desiredSize = t2.desiredSize;
        Promise.try(a2.onPull || onFn).then(() => {
          s2.postMessage({ sourceName: i2, targetName: n2, stream: At, streamId: e2, success: true });
        }, (t3) => {
          s2.postMessage({ sourceName: i2, targetName: n2, stream: At, streamId: e2, reason: wrapReason(t3) });
        });
        break;
      case yt:
        assert(r2, "enqueue should have stream controller");
        if (r2.isClosed) break;
        r2.controller.enqueue(t2.chunk);
        break;
      case bt:
        assert(r2, "close should have stream controller");
        if (r2.isClosed) break;
        r2.isClosed = true;
        r2.controller.close();
        this.#Hn(r2, e2);
        break;
      case vt:
        assert(r2, "error should have stream controller");
        r2.controller.error(wrapReason(t2.reason));
        this.#Hn(r2, e2);
        break;
      case ft:
        t2.success ? r2.cancelCall.resolve() : r2.cancelCall.reject(wrapReason(t2.reason));
        this.#Hn(r2, e2);
        break;
      case mt:
        if (!a2) break;
        const o2 = wrapReason(t2.reason);
        Promise.try(a2.onCancel || onFn, o2).then(() => {
          s2.postMessage({ sourceName: i2, targetName: n2, stream: ft, streamId: e2, success: true });
        }, (t3) => {
          s2.postMessage({ sourceName: i2, targetName: n2, stream: ft, streamId: e2, reason: wrapReason(t3) });
        });
        a2.sinkCapability.reject(o2);
        a2.isCancelled = true;
        this.#On.delete(e2);
        break;
      default:
        throw new Error("Unexpected stream case");
    }
  }
  async #Hn(t2, e2) {
    await Promise.allSettled([t2.startCall?.promise, t2.pullCall?.promise, t2.cancelCall?.promise]);
    this.#Fn.delete(e2);
  }
  destroy() {
    this.#Mn?.abort();
    this.#Mn = null;
  }
}
class BaseBinaryDataFactory {
  #zn = Object.freeze({ cMapUrl: "CMap", standardFontDataUrl: "font", wasmUrl: "wasm" });
  constructor({ cMapUrl: t2 = null, standardFontDataUrl: e2 = null, wasmUrl: i2 = null }) {
    this.cMapUrl = t2;
    this.standardFontDataUrl = e2;
    this.wasmUrl = i2;
  }
  async fetch({ kind: t2, filename: e2 }) {
    switch (t2) {
      case "cMapUrl":
      case "standardFontDataUrl":
      case "wasmUrl":
        break;
      default:
        unreachable(`Not implemented: ${t2}`);
    }
    const i2 = this[t2];
    if (!i2) throw new Error(`Ensure that the \`${t2}\` API parameter is provided.`);
    const n2 = `${i2}${e2}`;
    return this._fetch(n2, t2).catch((e3) => {
      throw new Error(`Unable to load ${this.#zn[t2]} data at: ${n2}`);
    });
  }
  async _fetch(t2, e2) {
    unreachable("Abstract method `_fetch` called.");
  }
}
class DOMBinaryDataFactory extends BaseBinaryDataFactory {
  async _fetch(t2, e2) {
    const i2 = "cMapUrl" !== e2 || t2.endsWith(".bcmap") ? "bytes" : "text", n2 = await fetchData(t2, i2);
    return n2 instanceof Uint8Array ? n2 : stringToBytes(n2);
  }
}
class BaseCanvasFactory {
  #Gn = false;
  constructor({ enableHWA: t2 = false }) {
    this.#Gn = t2;
  }
  create(t2, e2) {
    if (t2 <= 0 || e2 <= 0) throw new Error("Invalid canvas size");
    const i2 = this._createCanvas(t2, e2);
    return { canvas: i2, context: i2.getContext("2d", { willReadFrequently: !this.#Gn }) };
  }
  reset({ canvas: t2 }, e2, i2) {
    if (!t2) throw new Error("Canvas is not specified");
    if (e2 <= 0 || i2 <= 0) throw new Error("Invalid canvas size");
    t2.width = e2;
    t2.height = i2;
  }
  destroy(t2) {
    const { canvas: e2 } = t2;
    if (!e2) throw new Error("Canvas is not specified");
    e2.width = e2.height = 0;
    t2.canvas = null;
    t2.context = null;
  }
  _createCanvas(t2, e2) {
    unreachable("Abstract method `_createCanvas` called.");
  }
}
class DOMCanvasFactory extends BaseCanvasFactory {
  constructor({ ownerDocument: t2 = globalThis.document, enableHWA: e2 = false }) {
    super({ enableHWA: e2 });
    this._document = t2;
  }
  _createCanvas(t2, e2) {
    const i2 = this._document.createElement("canvas");
    i2.width = t2;
    i2.height = e2;
    return i2;
  }
}
class BaseFilterFactory {
  addFilter(t2) {
    return "none";
  }
  addHCMFilter(t2, e2) {
    return "none";
  }
  addAlphaFilter(t2) {
    return "none";
  }
  addLuminosityFilter(t2) {
    return "none";
  }
  addKnockoutFilter(t2 = 0) {
    return "none";
  }
  addHighlightHCMFilter(t2, e2, i2, n2, s2) {
    return "none";
  }
  addSelectionHCMFilter(t2, e2) {
    return "none";
  }
  addSelectionFilter() {
    return "none";
  }
  createSelectionStyle(t2 = null) {
    return null;
  }
  destroy(t2 = false) {
  }
}
class DOMFilterFactory extends BaseFilterFactory {
  #Vn;
  #Wn;
  #$n;
  #jn;
  #Xn;
  #Kn;
  #_ = 0;
  constructor({ docId: t2, ownerDocument: e2 = globalThis.document }) {
    super();
    this.#jn = t2;
    this.#Xn = e2;
  }
  get #D() {
    return this.#Wn ||= /* @__PURE__ */ new Map();
  }
  get #Yn() {
    return this.#Kn ||= /* @__PURE__ */ new Map();
  }
  get #qn() {
    if (!this.#$n) {
      const t2 = this.#Xn.createElement("div"), { style: e2 } = t2;
      e2.colorScheme = "only light";
      e2.visibility = "hidden";
      e2.contain = "strict";
      e2.width = e2.height = 0;
      e2.position = "absolute";
      e2.top = e2.left = 0;
      e2.zIndex = -1;
      const i2 = this.#Xn.createElementNS(s, "svg");
      i2.setAttribute("width", 0);
      i2.setAttribute("height", 0);
      this.#$n = this.#Xn.createElementNS(s, "defs");
      t2.append(i2);
      i2.append(this.#$n);
      this.#Xn.body.append(t2);
    }
    return this.#$n;
  }
  #Qn(t2) {
    const toTable = (t3) => t3 && Array.from(t3, (t4) => t4 / 255).join(",");
    if (1 === t2.length) {
      const e3 = toTable(t2[0]);
      return [e3, e3, e3];
    }
    const [e2, i2, n2] = t2;
    return [toTable(e2), toTable(i2), toTable(n2)];
  }
  #Jn(t2) {
    if (void 0 === this.#Vn) {
      this.#Vn = "";
      const t3 = this.#Xn.URL;
      t3 !== this.#Xn.baseURI && (isDataScheme(t3) ? warn('#createUrl: ignore "data:"-URL for performance reasons.') : this.#Vn = updateUrlHash(t3, ""));
    }
    return `url(${this.#Vn}#${t2})`;
  }
  addFilter(t2) {
    if (!t2) return "none";
    let e2 = this.#D.get(t2);
    if (e2) return e2;
    const [i2, n2, s2] = this.#Qn(t2), r2 = 1 === t2.length ? i2 : `${i2}${n2}${s2}`;
    e2 = this.#D.get(r2);
    if (e2) {
      this.#D.set(t2, e2);
      return e2;
    }
    const a2 = `g_${this.#jn}_transfer_map_${this.#_++}`, o2 = this.#Jn(a2);
    this.#D.set(t2, o2);
    this.#D.set(r2, o2);
    const l2 = this.#Zn(a2);
    this.#ts(i2, n2, s2, l2);
    return o2;
  }
  addHCMFilter(t2, e2) {
    const i2 = `${t2}-${e2}`, n2 = "base";
    let s2 = this.#Yn.get(n2);
    if (s2?.key === i2) return s2.url;
    if (s2) {
      s2.filter?.remove();
      s2.key = i2;
      s2.url = "none";
      s2.filter = null;
    } else {
      s2 = { key: i2, url: "none", filter: null };
      this.#Yn.set(n2, s2);
    }
    if (!t2 || !e2) return s2.url;
    const r2 = this.#es(t2);
    t2 = Util.makeHexColor(...r2);
    const a2 = this.#es(e2);
    e2 = Util.makeHexColor(...a2);
    this.#is();
    if ("#000000" === t2 && "#ffffff" === e2 || t2 === e2) return s2.url;
    const o2 = Array.from({ length: 256 }, (t3, e3) => computeLuminance(e3 / 255)).join(","), l2 = `g_${this.#jn}_hcm_filter`, h2 = s2.filter = this.#Zn(l2);
    this.#ts(o2, o2, o2, h2);
    this.#ns(h2);
    const getSteps = (t3, e3) => {
      const i3 = r2[t3] / 255, n3 = a2[t3] / 255, s3 = new Array(e3 + 1);
      for (let t4 = 0; t4 <= e3; t4++) s3[t4] = i3 + t4 / e3 * (n3 - i3);
      return s3.join(",");
    };
    this.#ts(getSteps(0, 5), getSteps(1, 5), getSteps(2, 5), h2);
    s2.url = this.#Jn(l2);
    return s2.url;
  }
  addSelectionHCMFilter(t2, e2) {
    return this.addHighlightHCMFilter("selection", t2, e2, "HighlightText", "Highlight");
  }
  addSelectionFilter() {
    return this.addHighlightHCMFilter("selection_default", "black", "white", "HighlightText", "Highlight");
  }
  createSelectionStyle(t2 = null) {
    const e2 = t2 ? this.addSelectionHCMFilter(t2.foreground, t2.background) : this.addSelectionFilter();
    return "none" !== e2 && FeatureTest.platform.isFirefox ? { "backdrop-filter": e2, "background-color": "transparent" } : null;
  }
  addAlphaFilter(t2) {
    let e2 = this.#D.get(t2);
    if (e2) return e2;
    const [i2] = this.#Qn([t2]), n2 = `alpha_${i2}`;
    e2 = this.#D.get(n2);
    if (e2) {
      this.#D.set(t2, e2);
      return e2;
    }
    const s2 = `g_${this.#jn}_alpha_map_${this.#_++}`, r2 = this.#Jn(s2);
    this.#D.set(t2, r2);
    this.#D.set(n2, r2);
    const a2 = this.#Zn(s2);
    this.#ss(i2, a2);
    return r2;
  }
  addLuminosityFilter(t2) {
    let e2, i2, n2 = this.#D.get(t2 || "luminosity");
    if (n2) return n2;
    if (t2) {
      [e2] = this.#Qn([t2]);
      i2 = `luminosity_${e2}`;
    } else i2 = "luminosity";
    n2 = this.#D.get(i2);
    if (n2) {
      this.#D.set(t2, n2);
      return n2;
    }
    const s2 = `g_${this.#jn}_luminosity_map_${this.#_++}`, r2 = this.#Jn(s2);
    this.#D.set(t2, r2);
    this.#D.set(i2, r2);
    const a2 = this.#Zn(s2);
    this.#rs(a2);
    t2 && this.#ss(e2, a2);
    return r2;
  }
  addKnockoutFilter(t2 = 0) {
    const e2 = t2 > 0 ? Math.min(1 / t2, 1e6) : 1e6, i2 = `knockout_${e2}`, n2 = this.#D.get(i2);
    if (n2) return n2;
    const r2 = `g_${this.#jn}_knockout_filter_${this.#_++}`, a2 = this.#Jn(r2);
    this.#D.set(i2, a2);
    const o2 = this.#Zn(r2), l2 = this.#Xn.createElementNS(s, "feComponentTransfer");
    o2.append(l2);
    const h2 = this.#Xn.createElementNS(s, "feFuncA");
    h2.setAttribute("type", "linear");
    h2.setAttribute("slope", `${e2}`);
    h2.setAttribute("intercept", "0");
    l2.append(h2);
    return a2;
  }
  addHighlightHCMFilter(t2, e2, i2, n2, s2) {
    const r2 = `${e2}-${i2}-${n2}-${s2}`;
    let a2 = this.#Yn.get(t2);
    if (a2?.key === r2) return a2.url;
    if (a2) {
      a2.filter?.remove();
      a2.key = r2;
      a2.url = "none";
      a2.filter = null;
    } else {
      a2 = { key: r2, url: "none", filter: null };
      this.#Yn.set(t2, a2);
    }
    if (!e2 || !i2) return a2.url;
    const [o2, l2] = [e2, i2].map(this.#es.bind(this));
    let h2 = Math.round(0.2126 * o2[0] + 0.7152 * o2[1] + 0.0722 * o2[2]), c2 = Math.round(0.2126 * l2[0] + 0.7152 * l2[1] + 0.0722 * l2[2]), [d2, u2] = [n2, s2].map(this.#as.bind(this));
    c2 < h2 && ([h2, c2, d2, u2] = [c2, h2, u2, d2]);
    this.#is();
    const getSteps = (t3, e3, i3) => {
      const n3 = new Array(256), s3 = (c2 - h2) / i3, r3 = t3 / 255, a3 = (e3 - t3) / (255 * i3);
      let o3 = 0;
      for (let t4 = 0; t4 <= i3; t4++) {
        const e4 = Math.round(h2 + t4 * s3), i4 = r3 + t4 * a3;
        for (let t5 = o3; t5 <= e4; t5++) n3[t5] = i4;
        o3 = e4 + 1;
      }
      for (let t4 = o3; t4 < 256; t4++) n3[t4] = n3[o3 - 1];
      return n3.join(",");
    }, p2 = `g_${this.#jn}_hcm_${t2}_filter`, g2 = a2.filter = this.#Zn(p2);
    this.#ns(g2);
    this.#ts(getSteps(d2[0], u2[0], 5), getSteps(d2[1], u2[1], 5), getSteps(d2[2], u2[2], 5), g2);
    a2.url = this.#Jn(p2);
    return a2.url;
  }
  destroy(t2 = false) {
    if (!t2 || !this.#Kn?.size) {
      this.#$n?.parentNode.parentNode.remove();
      this.#$n = null;
      this.#Wn?.clear();
      this.#Wn = null;
      this.#Kn?.clear();
      this.#Kn = null;
      this.#_ = 0;
    }
  }
  #rs(t2) {
    const e2 = this.#Xn.createElementNS(s, "feColorMatrix");
    e2.setAttribute("type", "matrix");
    e2.setAttribute("values", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0.59 0.11 0 0");
    t2.append(e2);
  }
  #ns(t2) {
    const e2 = this.#Xn.createElementNS(s, "feColorMatrix");
    e2.setAttribute("type", "matrix");
    e2.setAttribute("values", "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0");
    t2.append(e2);
  }
  #Zn(t2) {
    const e2 = this.#Xn.createElementNS(s, "filter");
    e2.setAttribute("color-interpolation-filters", "sRGB");
    e2.setAttribute("id", t2);
    this.#qn.append(e2);
    return e2;
  }
  #os(t2, e2, i2) {
    if (!i2) return;
    const n2 = this.#Xn.createElementNS(s, e2);
    n2.setAttribute("type", "discrete");
    n2.setAttribute("tableValues", i2);
    t2.append(n2);
  }
  #ts(t2, e2, i2, n2) {
    const r2 = this.#Xn.createElementNS(s, "feComponentTransfer");
    n2.append(r2);
    this.#os(r2, "feFuncR", t2);
    this.#os(r2, "feFuncG", e2);
    this.#os(r2, "feFuncB", i2);
  }
  #ss(t2, e2) {
    const i2 = this.#Xn.createElementNS(s, "feComponentTransfer");
    e2.append(i2);
    this.#os(i2, "feFuncA", t2);
  }
  #es(t2) {
    this.#qn.style.color = "CanvasText";
    this.#qn.style.backgroundColor = t2;
    return getRGB(getComputedStyle(this.#qn).getPropertyValue("background-color"));
  }
  #ls(t2) {
    this.#qn.style.color = "CanvasText";
    this.#qn.style.backgroundColor = t2;
    return getRGBA(getComputedStyle(this.#qn).getPropertyValue("background-color"));
  }
  #is() {
    this.#qn.style.color = "";
    this.#qn.style.backgroundColor = "";
  }
  #as(t2) {
    const [e2, i2, n2, s2] = this.#ls(t2);
    if (1 === s2) return [e2, i2, n2];
    const [r2, a2, o2] = this.#es("Canvas");
    return [blend(e2, r2, s2), blend(i2, a2, s2), blend(n2, o2, s2)];
  }
}
function blend(t2, e2, i2) {
  return Math.round(i2 * t2 + (1 - i2) * e2);
}
t && warn("Please use the `legacy` build in Node.js environments.");
class NodeFilterFactory extends BaseFilterFactory {
}
class NodeCanvasFactory extends BaseCanvasFactory {
  _createCanvas(t2, e2) {
    return process.getBuiltinModule("module").createRequire(import.meta.url)("@napi-rs/canvas").createCanvas(t2, e2);
  }
}
class NodeBinaryDataFactory extends BaseBinaryDataFactory {
  async _fetch(t2, e2) {
    return (async function node_utils_fetchData(t3) {
      const e3 = process.getBuiltinModule("fs/promises"), i2 = await e3.readFile(t3);
      return new Uint8Array(i2);
    })(t2);
  }
}
function convertBlackAndWhiteToRGBA({ src: t2, srcPos: e2 = 0, dest: i2, width: n2, height: s2, nonBlackColor: r2 = 4294967295, inverseDecode: a2 = false }) {
  const o2 = FeatureTest.isLittleEndian ? 4278190080 : 255, [l2, h2] = a2 ? [r2, o2] : [o2, r2], c2 = n2 >> 3, d2 = 7 & n2, u2 = l2 ^ h2, p2 = t2.length;
  i2 = new Uint32Array(i2.buffer);
  let g2 = 0;
  for (let n3 = 0; n3 < s2; ++n3) {
    for (const n5 = e2 + c2; e2 < n5; ++e2, g2 += 8) {
      const n6 = t2[e2];
      i2[g2] = l2 ^ -(n6 >> 7 & 1) & u2;
      i2[g2 + 1] = l2 ^ -(n6 >> 6 & 1) & u2;
      i2[g2 + 2] = l2 ^ -(n6 >> 5 & 1) & u2;
      i2[g2 + 3] = l2 ^ -(n6 >> 4 & 1) & u2;
      i2[g2 + 4] = l2 ^ -(n6 >> 3 & 1) & u2;
      i2[g2 + 5] = l2 ^ -(n6 >> 2 & 1) & u2;
      i2[g2 + 6] = l2 ^ -(n6 >> 1 & 1) & u2;
      i2[g2 + 7] = l2 ^ -(1 & n6) & u2;
    }
    if (0 === d2) continue;
    const n4 = e2 < p2 ? t2[e2++] : 255;
    for (let t3 = 0; t3 < d2; ++t3, ++g2) i2[g2] = l2 ^ -(n4 >> 7 - t3 & 1) & u2;
  }
  return { srcPos: e2, destPos: g2 };
}
function convertRGBToRGBA({ src: t2, srcPos: e2 = 0, dest: i2, destPos: n2 = 0, width: s2, height: r2 }) {
  let a2 = 0;
  const o2 = s2 * r2 * 3, l2 = o2 >> 2, h2 = new Uint32Array(t2.buffer, e2, l2), c2 = FeatureTest.isLittleEndian ? 4278190080 : 255;
  if (FeatureTest.isLittleEndian) {
    for (; a2 < l2 - 2; a2 += 3, n2 += 4) {
      const t3 = h2[a2], e3 = h2[a2 + 1], s3 = h2[a2 + 2];
      i2[n2] = t3 | c2;
      i2[n2 + 1] = t3 >>> 24 | e3 << 8 | c2;
      i2[n2 + 2] = e3 >>> 16 | s3 << 16 | c2;
      i2[n2 + 3] = s3 >>> 8 | c2;
    }
    for (let s3 = e2 + 4 * a2, r3 = e2 + o2; s3 < r3; s3 += 3) i2[n2++] = t2[s3] | t2[s3 + 1] << 8 | t2[s3 + 2] << 16 | c2;
  } else {
    for (; a2 < l2 - 2; a2 += 3, n2 += 4) {
      const t3 = h2[a2], e3 = h2[a2 + 1], s3 = h2[a2 + 2];
      i2[n2] = t3 | c2;
      i2[n2 + 1] = t3 << 24 | e3 >>> 8 | c2;
      i2[n2 + 2] = e3 << 16 | s3 >>> 16 | c2;
      i2[n2 + 3] = s3 << 8 | c2;
    }
    for (let s3 = e2 + 4 * a2, r3 = e2 + o2; s3 < r3; s3 += 3) i2[n2++] = t2[s3] << 24 | t2[s3 + 1] << 16 | t2[s3 + 2] << 8 | c2;
  }
  return { srcPos: e2 + o2, destPos: n2 };
}
const Ct = new class WebGPU {
  #hs = null;
  #cs = null;
  #ds = null;
  #us = null;
  async #ps() {
    if (!globalThis.navigator?.gpu) return false;
    try {
      const t2 = await navigator.gpu.requestAdapter();
      if (!t2) return false;
      this.#us = navigator.gpu.getPreferredCanvasFormat();
      this.#cs = await t2.requestDevice();
      return true;
    } catch {
      return false;
    }
  }
  init() {
    return this.#hs ||= this.#ps();
  }
  get isReady() {
    return null !== this.#cs;
  }
  loadMeshShader() {
    if (!this.#cs || this.#ds) return;
    const t2 = this.#cs.createShaderModule({ code: "\nstruct Uniforms {\n  offsetX      : f32,\n  offsetY      : f32,\n  scaleX       : f32,\n  scaleY       : f32,\n  paddedWidth  : f32,\n  paddedHeight : f32,\n  borderSize   : f32,\n  _pad         : f32,\n};\n\n@group(0) @binding(0) var<uniform> u : Uniforms;\n\nstruct VertexInput {\n  @location(0) position : vec2<f32>,\n  @location(1) color    : vec4<f32>,\n};\n\nstruct VertexOutput {\n  @builtin(position) position : vec4<f32>,\n  @location(0)       color    : vec3<f32>,\n};\n\n@vertex\nfn vs_main(in : VertexInput) -> VertexOutput {\n  var out : VertexOutput;\n  let cx = (in.position.x + u.offsetX) * u.scaleX;\n  let cy = (in.position.y + u.offsetY) * u.scaleY;\n  out.position = vec4<f32>(\n    ((cx + u.borderSize) / u.paddedWidth) * 2.0 - 1.0,\n    1.0 - ((cy + u.borderSize) / u.paddedHeight) * 2.0,\n    0.0,\n    1.0\n  );\n  out.color = in.color.rgb;\n  return out;\n}\n\n@fragment\nfn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {\n  return vec4<f32>(in.color, 1.0);\n}\n" });
    this.#ds = this.#cs.createRenderPipeline({ layout: "auto", vertex: { module: t2, entryPoint: "vs_main", buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }, { arrayStride: 4, attributes: [{ shaderLocation: 1, offset: 0, format: "unorm8x4" }] }] }, fragment: { module: t2, entryPoint: "fs_main", targets: [{ format: this.#us }] }, primitive: { topology: "triangle-list" } });
  }
  draw(t2, e2, i2, n2, s2, r2, a2, o2) {
    this.loadMeshShader();
    const l2 = this.#cs, { offsetX: h2, offsetY: c2, scaleX: d2, scaleY: u2 } = n2, p2 = l2.createBuffer({ size: Math.max(t2.byteLength, 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    t2.byteLength > 0 && l2.queue.writeBuffer(p2, 0, t2);
    const g2 = l2.createBuffer({ size: Math.max(e2.byteLength, 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    e2.byteLength > 0 && l2.queue.writeBuffer(g2, 0, e2);
    const m2 = l2.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    l2.queue.writeBuffer(m2, 0, new Float32Array([h2, c2, d2, u2, r2, a2, o2, 0]));
    const f2 = l2.createBindGroup({ layout: this.#ds.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: m2 } }] }), b2 = new OffscreenCanvas(r2, a2), y2 = b2.getContext("webgpu");
    y2.configure({ device: l2, format: this.#us, alphaMode: s2 ? "opaque" : "premultiplied" });
    const v2 = s2 ? { r: s2[0] / 255, g: s2[1] / 255, b: s2[2] / 255, a: 1 } : { r: 0, g: 0, b: 0, a: 0 }, w2 = l2.createCommandEncoder(), A2 = w2.beginRenderPass({ colorAttachments: [{ view: y2.getCurrentTexture().createView(), clearValue: v2, loadOp: "clear", storeOp: "store" }] });
    if (i2 > 0) {
      A2.setPipeline(this.#ds);
      A2.setBindGroup(0, f2);
      A2.setVertexBuffer(0, p2);
      A2.setVertexBuffer(1, g2);
      A2.draw(i2);
    }
    A2.end();
    l2.queue.submit([w2.finish()]);
    p2.destroy();
    g2.destroy();
    m2.destroy();
    return b2.transferToImageBitmap();
  }
}();
const Et = "Fill", St = "Stroke", Tt = "Shading";
function applyBoundingBox(t2, e2) {
  if (!e2) return;
  const i2 = e2[2] - e2[0], n2 = e2[3] - e2[1], s2 = new Path2D();
  s2.rect(e2[0], e2[1], i2, n2);
  t2.clip(s2);
}
class BaseShadingPattern {
  matrix = null;
  isModifyingCurrentTransform() {
    return false;
  }
  getPattern() {
    unreachable("Abstract method `getPattern` called.");
  }
}
class RadialAxialShadingPattern extends BaseShadingPattern {
  constructor(t2) {
    super();
    this._type = t2[1];
    this._bbox = t2[2];
    this._colorStops = t2[3];
    this._p0 = t2[4];
    this._p1 = t2[5];
    this._r0 = t2[6];
    this._r1 = t2[7];
  }
  isOriginBased() {
    return 0 === this._p0[0] && 0 === this._p0[1] && (!this.isRadial() || 0 === this._p1[0] && 0 === this._p1[1]);
  }
  isRadial() {
    return "radial" === this._type;
  }
  areConic() {
    if (!this.isRadial()) return false;
    const t2 = Math.hypot(this._p0[0] - this._p1[0], this._p0[1] - this._p1[1]);
    return t2 + this._r1 > this._r0 && t2 + this._r0 > this._r1;
  }
  _createGradient(t2, e2 = null) {
    let i2, n2 = this._p0, s2 = this._p1;
    if (e2) {
      n2 = n2.slice();
      s2 = s2.slice();
      Util.applyTransform(n2, e2);
      Util.applyTransform(s2, e2);
    }
    if ("axial" === this._type) i2 = t2.createLinearGradient(n2[0], n2[1], s2[0], s2[1]);
    else if ("radial" === this._type) {
      let r2 = this._r0, a2 = this._r1;
      if (e2) {
        const t3 = new Float32Array(2);
        Util.singularValueDecompose2dScale(e2, t3);
        r2 *= t3[0];
        a2 *= t3[0];
      }
      i2 = t2.createRadialGradient(n2[0], n2[1], r2, s2[0], s2[1], a2);
    }
    for (const t3 of this._colorStops) i2.addColorStop(t3[0], t3[1]);
    return i2;
  }
  _createReversedGradient(t2, e2 = null) {
    let i2 = this._p1, n2 = this._p0;
    if (e2) {
      i2 = i2.slice();
      n2 = n2.slice();
      Util.applyTransform(i2, e2);
      Util.applyTransform(n2, e2);
    }
    let s2 = this._r1, r2 = this._r0;
    if (e2) {
      const t3 = new Float32Array(2);
      Util.singularValueDecompose2dScale(e2, t3);
      s2 *= t3[0];
      r2 *= t3[0];
    }
    const a2 = t2.createRadialGradient(i2[0], i2[1], s2, n2[0], n2[1], r2), o2 = this._colorStops.map(([t3, e3]) => [1 - t3, e3]).reverse();
    for (const [t3, e3] of o2) a2.addColorStop(t3, e3);
    return a2;
  }
  _createRasterPattern(t2, e2, i2, n2, s2, r2) {
    const a2 = Math.ceil(n2[2] - n2[0]) || 1, o2 = Math.ceil(n2[3] - n2[1]) || 1, l2 = e2.canvasFactory.create(a2, o2), h2 = l2.context;
    h2.clearRect(0, 0, a2, o2);
    h2.beginPath();
    h2.rect(0, 0, a2, o2);
    h2.translate(-n2[0], -n2[1]);
    i2 = Util.transform(i2, [1, 0, 0, 1, n2[0], n2[1]]);
    h2.transform(...s2);
    applyBoundingBox(h2, this._bbox);
    if (this.areConic()) {
      h2.fillStyle = this._createReversedGradient(h2);
      h2.fill();
    }
    h2.fillStyle = this._createGradient(h2);
    h2.fill();
    r2?.applyToCanvas(h2);
    const c2 = t2.createPattern(l2.canvas, "no-repeat");
    e2.canvasFactory.destroy(l2);
    c2.setTransform(new DOMMatrix(i2));
    return c2;
  }
  getPattern(t2, e2, i2, n2) {
    const s2 = e2.current.transferMapsFallback;
    if (n2 === St || n2 === Et) {
      if (this.isOriginBased() && !s2) {
        let n3 = Util.transform(i2, e2.baseTransform);
        this.matrix && (n3 = Util.transform(n3, this.matrix));
        const s3 = 1e-3, r3 = Math.hypot(n3[0], n3[1]), a3 = Math.hypot(n3[2], n3[3]), o2 = (n3[0] * n3[2] + n3[1] * n3[3]) / (r3 * a3);
        if (Math.abs(o2) < s3) {
          if (!this.isRadial()) return this._createGradient(t2, n3);
          if (Math.abs(r3 - a3) < s3) return this._createGradient(t2, n3);
        }
      }
      const r2 = e2.current.getClippedPathBoundingBox(n2, getCurrentTransform(t2)) || [0, 0, 0, 0], a2 = this.matrix ? Util.transform(e2.baseTransform, this.matrix) : e2.baseTransform;
      return this._createRasterPattern(t2, e2, i2, r2, a2, s2);
    }
    if (s2 && i2) return this._createRasterPattern(t2, e2, i2, e2.current.clipBox, getCurrentTransform(t2), s2);
    if (this.areConic()) {
      t2.save();
      applyBoundingBox(t2, this._bbox);
      t2.fillStyle = this._createReversedGradient(t2);
      t2.fillRect(-1e10, -1e10, 2e10, 2e10);
      t2.restore();
    }
    applyBoundingBox(t2, this._bbox);
    return this._createGradient(t2);
  }
}
function drawTriangle(t2, e2, i2, n2, s2, r2, a2, o2) {
  const l2 = e2.coords, h2 = e2.colors, c2 = t2.data, d2 = 4 * t2.width;
  let u2;
  if (l2[2 * i2 + 1] > l2[2 * n2 + 1]) {
    u2 = i2;
    i2 = n2;
    n2 = u2;
    u2 = r2;
    r2 = a2;
    a2 = u2;
  }
  if (l2[2 * n2 + 1] > l2[2 * s2 + 1]) {
    u2 = n2;
    n2 = s2;
    s2 = u2;
    u2 = a2;
    a2 = o2;
    o2 = u2;
  }
  if (l2[2 * i2 + 1] > l2[2 * n2 + 1]) {
    u2 = i2;
    i2 = n2;
    n2 = u2;
    u2 = r2;
    r2 = a2;
    a2 = u2;
  }
  const p2 = (l2[2 * i2] + e2.offsetX) * e2.scaleX, g2 = (l2[2 * i2 + 1] + e2.offsetY) * e2.scaleY, m2 = (l2[2 * n2] + e2.offsetX) * e2.scaleX, f2 = (l2[2 * n2 + 1] + e2.offsetY) * e2.scaleY, b2 = (l2[2 * s2] + e2.offsetX) * e2.scaleX, y2 = (l2[2 * s2 + 1] + e2.offsetY) * e2.scaleY;
  if (g2 >= y2) return;
  const v2 = h2[4 * r2], w2 = h2[4 * r2 + 1], A2 = h2[4 * r2 + 2], x2 = h2[4 * a2], C2 = h2[4 * a2 + 1], E2 = h2[4 * a2 + 2], S2 = h2[4 * o2], T2 = h2[4 * o2 + 1], _2 = h2[4 * o2 + 2], k2 = Math.round(g2), D2 = Math.round(y2);
  let P2, M2, I2, F2, B2, O2, R2, L2;
  for (let t3 = k2; t3 <= D2; t3++) {
    if (t3 < f2) {
      const e4 = t3 < g2 ? 0 : (g2 - t3) / (g2 - f2);
      P2 = p2 - (p2 - m2) * e4;
      M2 = v2 - (v2 - x2) * e4;
      I2 = w2 - (w2 - C2) * e4;
      F2 = A2 - (A2 - E2) * e4;
    } else {
      let e4;
      e4 = t3 > y2 ? 1 : f2 === y2 ? 0 : (f2 - t3) / (f2 - y2);
      P2 = m2 - (m2 - b2) * e4;
      M2 = x2 - (x2 - S2) * e4;
      I2 = C2 - (C2 - T2) * e4;
      F2 = E2 - (E2 - _2) * e4;
    }
    let e3;
    e3 = t3 < g2 ? 0 : t3 > y2 ? 1 : (g2 - t3) / (g2 - y2);
    B2 = p2 - (p2 - b2) * e3;
    O2 = v2 - (v2 - S2) * e3;
    R2 = w2 - (w2 - T2) * e3;
    L2 = A2 - (A2 - _2) * e3;
    const i3 = Math.round(Math.min(P2, B2)), n3 = Math.round(Math.max(P2, B2));
    let s3 = d2 * t3 + 4 * i3;
    for (let t4 = i3; t4 <= n3; t4++) {
      e3 = (P2 - t4) / (P2 - B2);
      e3 < 0 ? e3 = 0 : e3 > 1 && (e3 = 1);
      c2[s3++] = M2 - (M2 - O2) * e3 | 0;
      c2[s3++] = I2 - (I2 - R2) * e3 | 0;
      c2[s3++] = F2 - (F2 - L2) * e3 | 0;
      c2[s3++] = 255;
    }
  }
}
class MeshShadingPattern extends BaseShadingPattern {
  constructor(t2) {
    super();
    this._posData = t2[2];
    this._colData = t2[3];
    this._vertexCount = t2[4];
    this._bounds = t2[5];
    this._bbox = t2[6];
    this._background = t2[7];
    !(function loadMeshShader() {
      Ct.loadMeshShader();
    })();
  }
  _createMeshCanvas(t2, e2, i2, n2 = null) {
    const s2 = Math.floor(this._bounds[0]), r2 = Math.floor(this._bounds[1]), a2 = Math.ceil(this._bounds[2]) - s2, o2 = Math.ceil(this._bounds[3]) - r2, l2 = Math.min(Math.ceil(Math.abs(a2 * t2[0] * 1.1)), 3e3) || 1, h2 = Math.min(Math.ceil(Math.abs(o2 * t2[1] * 1.1)), 3e3) || 1, c2 = a2 ? a2 / l2 : 1, d2 = o2 ? o2 / h2 : 1, u2 = { coords: this._posData, colors: this._colData, offsetX: -s2, offsetY: -r2, scaleX: 1 / c2, scaleY: 1 / d2 }, p2 = l2 + 4, g2 = h2 + 4, m2 = i2.create(p2, g2);
    if ((function isGPUReady() {
      return Ct.isReady;
    })() && this._vertexCount > 48) m2.context.drawImage((function drawMeshWithGPU(t3, e3, i3, n3, s3, r3, a3, o3) {
      return Ct.draw(t3, e3, i3, n3, s3, r3, a3, o3);
    })(this._posData, this._colData, this._vertexCount, u2, e2, p2, g2, 2), 0, 0);
    else {
      const t3 = m2.context.createImageData(l2, h2);
      if (e2) {
        const i3 = t3.data;
        for (let t4 = 0, n3 = i3.length; t4 < n3; t4 += 4) {
          i3[t4] = e2[0];
          i3[t4 + 1] = e2[1];
          i3[t4 + 2] = e2[2];
          i3[t4 + 3] = 255;
        }
      }
      for (let e3 = 0, i3 = this._vertexCount; e3 < i3; e3 += 3) drawTriangle(t3, u2, e3, e3 + 1, e3 + 2, e3, e3 + 1, e3 + 2);
      m2.context.putImageData(t3, 2, 2);
    }
    n2?.applyToCanvas(m2.context);
    return { canvas: m2.canvas, offsetX: s2 - 2 * c2, offsetY: r2 - 2 * d2, scaleX: c2, scaleY: d2 };
  }
  isModifyingCurrentTransform() {
    return true;
  }
  getPattern(t2, e2, i2, n2) {
    applyBoundingBox(t2, this._bbox);
    const s2 = new Float32Array(2);
    if (n2 === Tt) Util.singularValueDecompose2dScale(getCurrentTransform(t2), s2);
    else if (this.matrix) {
      Util.singularValueDecompose2dScale(this.matrix, s2);
      const [t3, i3] = s2;
      Util.singularValueDecompose2dScale(e2.baseTransform, s2);
      s2[0] *= t3;
      s2[1] *= i3;
    } else Util.singularValueDecompose2dScale(e2.baseTransform, s2);
    const r2 = this._createMeshCanvas(s2, n2 === Tt ? null : this._background, e2.canvasFactory, e2.current.transferMapsFallback);
    if (n2 !== Tt) {
      t2.setTransform(...e2.baseTransform);
      this.matrix && t2.transform(...this.matrix);
    }
    t2.translate(r2.offsetX, r2.offsetY);
    t2.scale(r2.scaleX, r2.scaleY);
    const a2 = t2.createPattern(r2.canvas, "no-repeat");
    e2.canvasFactory.destroy(r2);
    return a2;
  }
}
class DummyShadingPattern extends BaseShadingPattern {
  getPattern() {
    return "hotpink";
  }
}
const _t = 1, kt = 2;
class TilingPattern {
  static MAX_PATTERN_SIZE = 3e3;
  constructor(t2, e2, i2, n2) {
    this.color = t2[1];
    this.operatorList = t2[2];
    this.matrix = t2[3];
    this.bbox = t2[4];
    this.xstep = t2[5];
    this.ystep = t2[6];
    this.paintType = t2[7];
    this.tilingType = t2[8];
    this.needsIsolation = t2[9] ?? true;
    this.ctx = e2;
    this.canvasGraphicsFactory = i2;
    this.baseTransform = n2;
    this.patternBaseMatrix = this.matrix ? Util.transform(n2, this.matrix) : n2;
  }
  canSkipPatternCanvas([t2, e2, i2, n2]) {
    const [s2, r2, a2, o2] = this.bbox, l2 = Math.abs(this.xstep), h2 = Math.abs(this.ystep);
    if (t2 > l2 + 1e-6 || e2 > h2 + 1e-6) return null;
    const c2 = Math.floor((i2 - a2) / l2) + 1, d2 = Math.ceil((i2 + t2 - s2) / l2) - 1, u2 = Math.floor((n2 - o2) / h2) + 1, p2 = Math.ceil((n2 + e2 - r2) / h2) - 1;
    return d2 <= c2 && p2 <= u2 ? [c2, u2] : null;
  }
  updatePatternDims(t2, i2) {
    const n2 = e.slice();
    Util.axialAlignedBoundingBox(t2, Util.inverseTransform(this.patternBaseMatrix), n2);
    i2[0] = n2[2] - n2[0];
    i2[1] = n2[3] - n2[1];
    i2[2] = n2[0];
    i2[3] = n2[1];
  }
  _renderTileCanvas(t2, e2, i2, n2) {
    const [s2, r2, a2, o2] = this.bbox, l2 = t2.canvasFactory.create(i2.size, n2.size), h2 = l2.context, c2 = this.canvasGraphicsFactory.createCanvasGraphics(h2, e2);
    c2.groupLevel = t2.groupLevel;
    c2.current.transferMapsFallback = t2.current.transferMapsFallback;
    this.setFillAndStrokeStyleToContext(c2, this.paintType, this.color);
    h2.translate(-i2.scale * s2, -n2.scale * r2);
    c2.transform(0, i2.scale, 0, 0, n2.scale, 0, 0);
    h2.save();
    c2.dependencyTracker?.save();
    this.clipBbox(c2, s2, r2, a2, o2);
    c2.baseTransform = getCurrentTransform(c2.ctx);
    c2.executeOperatorList(this.operatorList);
    c2.endDrawing();
    c2.dependencyTracker?.restore();
    h2.restore();
    return l2;
  }
  _getCombinedScales() {
    const t2 = new Float32Array(2);
    Util.singularValueDecompose2dScale(this.matrix, t2);
    const [e2, i2] = t2;
    Util.singularValueDecompose2dScale(this.baseTransform, t2);
    return [e2 * t2[0], i2 * t2[1]];
  }
  drawPattern(t2, e2, i2 = false, [n2, s2], r2) {
    const [a2, o2, l2, h2] = this.bbox, c2 = t2.dependencyTracker;
    c2 && (t2.dependencyTracker = new CanvasNestedDependencyTracker(c2, r2));
    t2.save();
    i2 ? t2.ctx.clip(e2, "evenodd") : t2.ctx.clip(e2);
    t2.ctx.setTransform(...this.patternBaseMatrix);
    t2.ctx.translate(n2 * this.xstep, s2 * this.ystep);
    if (this.needsIsolation || 1 !== t2.ctx.globalAlpha || "source-over" !== t2.ctx.globalCompositeOperation || t2.inSMaskMode) {
      const e3 = l2 - a2, i3 = h2 - o2, [n3, s3] = this._getCombinedScales(), c3 = this.getSizeAndScale(e3, this.ctx.canvas.width, n3), d2 = this.getSizeAndScale(i3, this.ctx.canvas.height, s3), u2 = this._renderTileCanvas(t2, r2, c3, d2);
      t2.ctx.drawImage(u2.canvas, a2, o2, e3, i3);
      t2.canvasFactory.destroy(u2);
    } else {
      this.setFillAndStrokeStyleToContext(t2, this.paintType, this.color);
      this.clipBbox(t2, a2, o2, l2, h2);
      t2.baseTransformStack.push(t2.baseTransform);
      t2.baseTransform = getCurrentTransform(t2.ctx);
      t2.executeOperatorList(this.operatorList);
      t2.baseTransform = t2.baseTransformStack.pop();
    }
    t2.restore();
    c2 && (t2.dependencyTracker = c2);
  }
  createPatternCanvas(t2, e2) {
    const [i2, n2, s2, r2] = this.bbox, a2 = s2 - i2, o2 = r2 - n2;
    let { xstep: l2, ystep: h2 } = this;
    l2 = Math.abs(l2);
    h2 = Math.abs(h2);
    info("TilingType: " + this.tilingType);
    const [c2, d2] = this._getCombinedScales();
    let u2 = a2, p2 = o2, g2 = false, m2 = false;
    Math.ceil(l2 * c2) >= Math.ceil(a2 * c2) ? u2 = l2 : g2 = true;
    Math.ceil(h2 * d2) >= Math.ceil(o2 * d2) ? p2 = h2 : m2 = true;
    const f2 = this.getSizeAndScale(u2, this.ctx.canvas.width, c2), b2 = this.getSizeAndScale(p2, this.ctx.canvas.height, d2), y2 = this._renderTileCanvas(t2, e2, f2, b2);
    if (g2 || m2) {
      const e3 = y2.canvas;
      g2 && (u2 = l2);
      m2 && (p2 = h2);
      const s3 = this.getSizeAndScale(u2, this.ctx.canvas.width, c2), r3 = this.getSizeAndScale(p2, this.ctx.canvas.height, d2), f3 = s3.size, b3 = r3.size, v2 = t2.canvasFactory.create(f3, b3), w2 = v2.context, A2 = g2 ? Math.min(Math.floor(a2 / l2), Math.ceil(e3.width / f3)) : 0, x2 = m2 ? Math.min(Math.floor(o2 / h2), Math.ceil(e3.height / b3)) : 0;
      let C2 = e3, E2 = null;
      if (m2) {
        E2 = t2.canvasFactory.create(e3.width, b3);
        const i3 = E2.context;
        for (let t3 = x2; t3 >= 0; t3--) i3.drawImage(e3, 0, b3 * t3, e3.width, b3, 0, 0, e3.width, b3);
        C2 = E2.canvas;
      }
      for (let t3 = A2; t3 >= 0; t3--) w2.drawImage(C2, f3 * t3, 0, f3, b3, 0, 0, f3, b3);
      E2 && t2.canvasFactory.destroy(E2);
      t2.canvasFactory.destroy(y2);
      return { canvas: v2.canvas, canvasEntry: v2, scaleX: s3.scale, scaleY: r3.scale, offsetX: i2, offsetY: n2 };
    }
    return { canvas: y2.canvas, canvasEntry: y2, scaleX: f2.scale, scaleY: b2.scale, offsetX: i2, offsetY: n2 };
  }
  getSizeAndScale(t2, e2, i2) {
    const n2 = Math.max(TilingPattern.MAX_PATTERN_SIZE, e2);
    let s2 = Math.ceil(t2 * i2);
    s2 >= n2 ? s2 = n2 : i2 = s2 / t2;
    return { scale: i2, size: s2 };
  }
  clipBbox(t2, e2, i2, n2, s2) {
    const r2 = n2 - e2, a2 = s2 - i2, o2 = new Path2D();
    o2.rect(e2, i2, r2, a2);
    Util.axialAlignedBoundingBox([e2, i2, n2, s2], getCurrentTransform(t2.ctx), t2.current.minMax);
    t2.ctx.clip(o2);
    t2.current.updateClipFromPath();
  }
  setFillAndStrokeStyleToContext(t2, e2, i2) {
    switch (e2) {
      case _t:
        i2 = "#000000";
        break;
      case kt:
        break;
      default:
        throw new FormatError(`Unsupported paint type: ${e2}`);
    }
    const { ctx: n2, current: s2 } = t2;
    s2.patternFill = s2.patternStroke = false;
    n2.fillStyle = n2.strokeStyle = s2.transferMapsFallback?.applyToColor(i2) ?? i2;
    s2.fillColor = s2.strokeColor = i2;
  }
  isModifyingCurrentTransform() {
    return false;
  }
  getPattern(t2, e2, i2, n2, s2) {
    const r2 = n2 !== Tt ? Util.transform(i2, this.patternBaseMatrix) : i2, a2 = this.createPatternCanvas(e2, s2);
    let o2 = new DOMMatrix(r2);
    o2 = o2.translate(a2.offsetX, a2.offsetY);
    o2 = o2.scale(1 / a2.scaleX, 1 / a2.scaleY);
    const l2 = t2.createPattern(a2.canvas, "repeat");
    e2.canvasFactory.destroy(a2.canvasEntry);
    l2.setTransform(o2);
    return l2;
  }
}
const Dt = 16, Pt = new Float32Array(2);
function mirrorContextOperations(t2, e2) {
  if (t2._removeMirroring) throw new Error("Context is already forwarding operations.");
  const i2 = /* @__PURE__ */ new Map();
  for (const n2 of ["save", "restore", "rotate", "scale", "translate", "transform", "setTransform", "resetTransform", "clip", "moveTo", "lineTo", "bezierCurveTo", "quadraticCurveTo", "arc", "arcTo", "ellipse", "rect", "roundRect", "closePath", "beginPath"]) {
    const s2 = t2[n2];
    if ("function" == typeof s2 && "function" == typeof e2[n2]) {
      i2.set(n2, s2);
      t2[n2] = function(...t3) {
        e2[n2](...t3);
        return s2.apply(this, t3);
      };
    }
  }
  t2._removeMirroring = () => {
    for (const [e3, n2] of i2) t2[e3] = n2;
    delete t2._removeMirroring;
  };
}
function drawImageAtIntegerCoords(t2, e2, i2, n2, s2, r2, a2, o2, l2, h2) {
  const [c2, d2, u2, p2, g2, m2] = getCurrentTransform(t2);
  if (0 === d2 && 0 === u2) {
    const f2 = a2 * c2 + g2, b2 = Math.round(f2), y2 = o2 * p2 + m2, v2 = Math.round(y2), w2 = (a2 + l2) * c2 + g2, A2 = Math.abs(Math.round(w2) - b2) || 1, x2 = (o2 + h2) * p2 + m2, C2 = Math.abs(Math.round(x2) - v2) || 1;
    t2.setTransform(Math.sign(c2), 0, 0, Math.sign(p2), b2, v2);
    t2.drawImage(e2, i2, n2, s2, r2, 0, 0, A2, C2);
    t2.setTransform(c2, d2, u2, p2, g2, m2);
    return [A2, C2];
  }
  if (0 === c2 && 0 === p2) {
    const f2 = o2 * u2 + g2, b2 = Math.round(f2), y2 = a2 * d2 + m2, v2 = Math.round(y2), w2 = (o2 + h2) * u2 + g2, A2 = Math.abs(Math.round(w2) - b2) || 1, x2 = (a2 + l2) * d2 + m2, C2 = Math.abs(Math.round(x2) - v2) || 1;
    t2.setTransform(0, Math.sign(d2), Math.sign(u2), 0, b2, v2);
    t2.drawImage(e2, i2, n2, s2, r2, 0, 0, C2, A2);
    t2.setTransform(c2, d2, u2, p2, g2, m2);
    return [C2, A2];
  }
  t2.drawImage(e2, i2, n2, s2, r2, a2, o2, l2, h2);
  return [Math.hypot(c2, d2) * l2, Math.hypot(u2, p2) * h2];
}
class CanvasExtraState {
  alphaIsShape = false;
  fontSize = 0;
  fontSizeScale = 1;
  textMatrix = null;
  textMatrixScale = 1;
  fontMatrix = n;
  leading = 0;
  x = 0;
  y = 0;
  lineX = 0;
  lineY = 0;
  charSpacing = 0;
  wordSpacing = 0;
  textHScale = 1;
  textRenderingMode = v;
  textRise = 0;
  fillColor = "#000000";
  strokeColor = "#000000";
  tilingPatternDims = null;
  patternFill = false;
  patternStroke = false;
  fillAlpha = 1;
  strokeAlpha = 1;
  lineWidth = 1;
  activeSMask = null;
  transferMaps = "none";
  transferMapsFallback = null;
  minMax = i.slice();
  constructor(t2, e2) {
    this.clipBox = new Float32Array([0, 0, t2, e2]);
  }
  clone() {
    const t2 = Object.create(this);
    t2.clipBox = this.clipBox.slice();
    t2.minMax = this.minMax.slice();
    t2.tilingPatternDims = this.tilingPatternDims?.slice();
    return t2;
  }
  getPathBoundingBox(t2 = Et, e2 = null) {
    const i2 = this.minMax.slice();
    if (t2 === St) {
      e2 || unreachable("Stroke bounding box must include transform.");
      Util.singularValueDecompose2dScale(e2, Pt);
      const t3 = Pt[0] * this.lineWidth / 2, n2 = Pt[1] * this.lineWidth / 2;
      i2[0] -= t3;
      i2[1] -= n2;
      i2[2] += t3;
      i2[3] += n2;
    }
    return i2;
  }
  updateClipFromPath() {
    const t2 = Util.intersect(this.clipBox, this.getPathBoundingBox());
    this.startNewPathAndClipBox(t2 || [0, 0, 0, 0]);
  }
  isEmptyClip() {
    return this.minMax[0] === 1 / 0;
  }
  startNewPathAndClipBox(t2) {
    this.clipBox.set(t2, 0);
    this.minMax.set(i, 0);
  }
  getClippedPathBoundingBox(t2 = Et, e2 = null) {
    return Util.intersect(this.clipBox, this.getPathBoundingBox(t2, e2));
  }
}
function putBinaryImageData(t2, e2) {
  const { width: i2, height: n2, kind: s2 } = e2, r2 = n2 % Dt, a2 = (n2 - r2) / Dt, o2 = 0 === r2 ? a2 : a2 + 1, l2 = t2.createImageData(i2, Dt);
  let h2 = 0;
  const c2 = e2.data, d2 = l2.data;
  let u2;
  if (s2 === S.GRAYSCALE_1BPP) for (u2 = 0; u2 < o2; u2++) {
    ({ srcPos: h2 } = convertBlackAndWhiteToRGBA({ src: c2, srcPos: h2, dest: d2, width: i2, height: u2 < a2 ? Dt : r2 }));
    t2.putImageData(l2, 0, u2 * Dt);
  }
  else if (s2 === S.RGBA_32BPP) {
    let e3 = 0, n3 = i2 * Dt * 4;
    for (u2 = 0; u2 < a2; u2++) {
      d2.set(c2.subarray(h2, h2 + n3));
      h2 += n3;
      t2.putImageData(l2, 0, e3);
      e3 += Dt;
    }
    if (u2 < o2) {
      n3 = i2 * r2 * 4;
      d2.set(c2.subarray(h2, h2 + n3));
      t2.putImageData(l2, 0, e3);
    }
  } else {
    if (s2 !== S.RGB_24BPP) throw new Error(`bad image kind: ${s2}`);
    for (u2 = 0; u2 < o2; u2++) {
      ({ srcPos: h2 } = convertRGBToRGBA({ src: c2, srcPos: h2, dest: new Uint32Array(d2.buffer), width: i2, height: u2 < a2 ? Dt : r2 }));
      t2.putImageData(l2, 0, u2 * Dt);
    }
  }
}
function putBinaryImageMask(t2, e2) {
  if (e2.bitmap) {
    t2.drawImage(e2.bitmap, 0, 0);
    return;
  }
  const { width: i2, height: n2 } = e2, s2 = n2 % Dt, r2 = (n2 - s2) / Dt, a2 = 0 === s2 ? r2 : r2 + 1, o2 = t2.createImageData(i2, Dt);
  let l2 = 0;
  const h2 = e2.data, c2 = o2.data;
  for (let e3 = 0; e3 < a2; e3++) {
    ({ srcPos: l2 } = convertBlackAndWhiteToRGBA({ src: h2, srcPos: l2, dest: c2, width: i2, height: e3 < r2 ? Dt : s2, nonBlackColor: 0 }));
    t2.putImageData(o2, 0, e3 * Dt);
  }
}
function copyCtxState(t2, e2) {
  const i2 = ["strokeStyle", "fillStyle", "fillRule", "globalAlpha", "lineWidth", "lineCap", "lineJoin", "miterLimit", "globalCompositeOperation", "font", "filter"];
  for (const n2 of i2) void 0 !== t2[n2] && (e2[n2] = t2[n2]);
  if (void 0 !== t2.setLineDash) {
    e2.setLineDash(t2.getLineDash());
    e2.lineDashOffset = t2.lineDashOffset;
  }
}
function resetCtxToDefault(t2) {
  t2.strokeStyle = t2.fillStyle = "#000000";
  t2.fillRule = "nonzero";
  t2.globalAlpha = 1;
  t2.lineWidth = 1;
  t2.lineCap = "butt";
  t2.lineJoin = "miter";
  t2.miterLimit = 10;
  t2.globalCompositeOperation = "source-over";
  t2.font = "10px sans-serif";
  if (void 0 !== t2.setLineDash) {
    t2.setLineDash([]);
    t2.lineDashOffset = 0;
  }
  const { filter: e2 } = t2;
  "none" !== e2 && "" !== e2 && (t2.filter = "none");
}
class TransferMapsFallback {
  #gs;
  constructor(t2) {
    const [e2, i2 = e2, n2 = e2] = t2, { identityMap: s2 } = TransferMapsFallback;
    this.#gs = [e2 || s2, i2 || s2, n2 || s2];
  }
  static get identityMap() {
    return shadow(this, "identityMap", Uint8Array.from({ length: 256 }, (t2, e2) => e2));
  }
  applyToColor(t2) {
    if ("string" != typeof t2 || !t2.startsWith("#")) return t2;
    const [e2, i2, n2] = getRGBA(t2), [s2, r2, a2] = this.#gs;
    return Util.makeHexColor(s2[e2], r2[i2], a2[n2]);
  }
  applyToImageData({ data: t2 }) {
    const [e2, i2, n2] = this.#gs;
    for (let s2 = 0, r2 = t2.length; s2 < r2; s2 += 4) {
      t2[s2] = e2[t2[s2]];
      t2[s2 + 1] = i2[t2[s2 + 1]];
      t2[s2 + 2] = n2[t2[s2 + 2]];
    }
  }
  applyToCanvas(t2) {
    const { width: e2, height: i2 } = t2.canvas, n2 = t2.getImageData(0, 0, e2, i2);
    this.applyToImageData(n2);
    t2.putImageData(n2, 0, 0);
  }
}
function getImageSmoothingEnabled(t2, e2) {
  if (e2) return true;
  Util.singularValueDecompose2dScale(t2, Pt);
  const i2 = Math.fround(OutputScale.pixelRatio * PixelsPerInch.PDF_TO_CSS_UNITS);
  return Pt[0] <= i2 && Pt[1] <= i2;
}
const Mt = ["butt", "round", "square"], It = ["miter", "round", "bevel"], Ft = {}, Bt = {};
class CanvasGraphics {
  static #ms = null;
  #fs = 0;
  #bs = 0;
  #ys = null;
  #vs = null;
  #ws = null;
  #As = null;
  #xs = 1;
  #Cs;
  #Es = null;
  #Ss = [];
  constructor(t2, e2, i2, n2, s2, { optionalContentConfig: r2, markedContentStack: a2 = null }, o2, l2, h2, c2) {
    this.ctx = t2;
    this.current = new CanvasExtraState(this.ctx.canvas.width, this.ctx.canvas.height);
    this.stateStack = [];
    this.pendingClip = null;
    this.pendingEOFill = false;
    this.commonObjs = e2;
    this.objs = i2;
    this.canvasFactory = n2;
    this.filterFactory = s2;
    this.groupStack = [];
    this.baseTransform = null;
    this.baseTransformStack = [];
    this.groupLevel = 0;
    this.smaskStack = [];
    this.tempSMask = null;
    this.smaskGroupCanvases = [];
    this.smaskPreparedEntry = null;
    this.smaskPreparedFor = null;
    this.smaskPreparedOffsetX = 0;
    this.smaskPreparedOffsetY = 0;
    this.smaskPreparedOOBAlpha = null;
    this.suspendedCtx = null;
    this.contentVisible = true;
    this.markedContentStack = a2 || [];
    this.optionalContentConfig = r2;
    this.cachedPatterns = /* @__PURE__ */ new Map();
    this.annotationCanvasMap = o2;
    this.viewportScale = 1;
    this.outputScaleX = 1;
    this.outputScaleY = 1;
    this.pageColors = l2;
    this._cachedScaleForStroking = [-1, 0];
    this._cachedBitmapsMap = /* @__PURE__ */ new Map();
    this.dependencyTracker = h2 ?? null;
    this.imagesTracker = c2 ?? null;
  }
  getObject(t2, e2, i2 = null) {
    if ("string" == typeof e2) {
      this.dependencyTracker?.recordNamedDependency(t2, e2);
      return e2.startsWith("g_") ? this.commonObjs.get(e2) : this.objs.get(e2);
    }
    return i2;
  }
  beginDrawing({ transform: t2, viewport: e2, transparency: i2 = false, background: n2 = null }) {
    const s2 = this.ctx.canvas.width, r2 = this.ctx.canvas.height, a2 = this.ctx.fillStyle;
    this.ctx.fillStyle = n2 || "#ffffff";
    this.ctx.fillRect(0, 0, s2, r2);
    this.ctx.fillStyle = a2;
    if (i2) {
      const t3 = this.transparentCanvasEntry = this.canvasFactory.create(s2, r2);
      this.compositeCtx = this.ctx;
      ({ canvas: this.transparentCanvas, context: this.ctx } = t3);
      this.ctx.save();
      this.ctx.transform(...getCurrentTransform(this.compositeCtx));
    }
    this.ctx.save();
    resetCtxToDefault(this.ctx);
    if (t2) {
      this.ctx.transform(...t2);
      this.outputScaleX = t2[0];
      this.outputScaleY = t2[3];
    }
    this.ctx.transform(...e2.transform);
    this.viewportScale = e2.scale;
    this.baseTransform = getCurrentTransform(this.ctx);
  }
  executeOperatorList(t2, e2, i2, n2, s2) {
    const r2 = t2.argsArray, a2 = t2.fnArray;
    let o2 = e2 || 0;
    const l2 = r2.length;
    if (l2 === o2) return o2;
    const h2 = l2 - o2 > 10 && "function" == typeof i2, c2 = h2 ? Date.now() + 15 : 0;
    let d2 = 0;
    const u2 = this.commonObjs, p2 = this.objs;
    let g2, m2;
    for (; ; ) {
      if (void 0 !== n2) {
        if (o2 === n2.nextBreakPoint) {
          n2.breakIt(o2, i2);
          return o2;
        }
        if (n2.shouldSkip(o2)) {
          if (++o2 === l2) return o2;
          continue;
        }
      }
      if (!s2 || s2(o2, t2)) {
        g2 = a2[o2];
        m2 = r2[o2] ?? null;
        if (g2 !== F.dependency) null === m2 ? this[g2](o2) : this[g2](o2, ...m2);
        else for (const t3 of m2) {
          this.dependencyTracker?.recordNamedData(t3, o2);
          const e3 = t3.startsWith("g_") ? u2 : p2;
          if (!e3.has(t3)) {
            e3.get(t3, i2);
            return o2;
          }
        }
      }
      o2++;
      if (o2 === l2) return o2;
      if (h2 && ++d2 > 10) {
        if (Date.now() > c2) {
          i2();
          return o2;
        }
        d2 = 0;
      }
    }
  }
  #Ts() {
    for (; this.stateStack.length || this.inSMaskMode; ) this.restore();
    this.current.activeSMask = null;
    this.ctx.restore();
    if (this.transparentCanvas) {
      this.ctx = this.compositeCtx;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(this.transparentCanvas, 0, 0);
      this.ctx.restore();
      this.canvasFactory.destroy(this.transparentCanvasEntry);
      this.transparentCanvas = null;
      this.transparentCanvasEntry = null;
    }
  }
  endDrawing() {
    this.#Ts();
    for (const t2 of this.smaskGroupCanvases) this.canvasFactory.destroy(t2);
    this.smaskGroupCanvases.length = 0;
    this._clearPreparedSMask();
    this.tempSMask = null;
    this.smaskStack.length = 0;
    for (const t2 of this.#Ss) this.#_s(t2);
    this.#Ss.length = 0;
    this.#ys = null;
    this.#vs = null;
    this.#ws = null;
    this.#As = null;
    this.#xs = 1;
    this.#Es = null;
    this.#bs = 0;
    this.#fs = 0;
    this.cachedPatterns.clear();
    for (const t2 of this._cachedBitmapsMap.values()) {
      for (const e2 of t2.values()) "undefined" != typeof HTMLCanvasElement && e2 instanceof HTMLCanvasElement && (e2.width = e2.height = 0);
      t2.clear();
    }
    this._cachedBitmapsMap.clear();
    this.#ks();
  }
  #ks() {
    if (this.pageColors) {
      const t2 = this.filterFactory.addHCMFilter(this.pageColors.foreground, this.pageColors.background);
      if ("none" !== t2) {
        const e2 = this.ctx.filter;
        this.ctx.filter = t2;
        this.ctx.drawImage(this.ctx.canvas, 0, 0);
        this.ctx.filter = e2;
      }
    }
  }
  _scaleImage(t2, e2) {
    const i2 = t2.width ?? t2.displayWidth, n2 = t2.height ?? t2.displayHeight, s2 = [];
    let r2 = Math.max(Math.hypot(e2[0], e2[1]), 1), a2 = Math.max(Math.hypot(e2[2], e2[3]), 1), o2 = i2, l2 = n2;
    for (; r2 > 2 && o2 > 1 || a2 > 2 && l2 > 1; ) {
      let t3 = o2, e3 = l2;
      if (r2 > 2 && o2 > 1) {
        t3 = Math.ceil(o2 / 2);
        r2 /= o2 / t3;
      }
      if (a2 > 2 && l2 > 1) {
        e3 = Math.ceil(l2 / 2);
        a2 /= l2 / e3;
      }
      s2.push({ newWidth: t3, newHeight: e3 });
      o2 = t3;
      l2 = e3;
    }
    if (0 === s2.length) return { img: t2, paintWidth: i2, paintHeight: n2, tmpCanvas: null };
    if (1 === s2.length) {
      const { newWidth: e3, newHeight: r3 } = s2[0], a3 = this.canvasFactory.create(e3, r3);
      a3.context.drawImage(t2, 0, 0, i2, n2, 0, 0, e3, r3);
      return { img: a3.canvas, paintWidth: e3, paintHeight: r3, tmpCanvas: a3 };
    }
    let h2 = this.canvasFactory.create(1, 1), c2 = this.canvasFactory.create(1, 1), d2 = i2, u2 = n2, p2 = t2;
    for (const { newWidth: t3, newHeight: e3 } of s2) {
      this.canvasFactory.reset(c2, t3, e3);
      c2.context.drawImage(p2, 0, 0, d2, u2, 0, 0, t3, e3);
      [h2, c2] = [c2, h2];
      p2 = h2.canvas;
      d2 = t3;
      u2 = e3;
    }
    this.canvasFactory.destroy(c2);
    return { img: h2.canvas, paintWidth: d2, paintHeight: u2, tmpCanvas: h2 };
  }
  _createMaskCanvas(t2, e2) {
    const n2 = this.ctx, { width: s2, height: r2 } = e2, a2 = this.current.patternFill, o2 = a2 ? this.current.fillColor : n2.fillStyle, l2 = getCurrentTransform(n2);
    let h2, c2, d2, u2;
    if ((e2.bitmap || e2.data) && e2.count > 1) {
      const i2 = e2.bitmap || e2.data.buffer;
      c2 = JSON.stringify(a2 ? l2 : [l2.slice(0, 4), o2]);
      h2 = this._cachedBitmapsMap.getOrInsertComputed(i2, makeMap);
      const n3 = h2.get(c2);
      if (n3 && !a2) {
        const e3 = Math.round(Math.min(l2[0], l2[2]) + l2[4]), i3 = Math.round(Math.min(l2[1], l2[3]) + l2[5]);
        this.dependencyTracker?.recordDependencies(t2, ct);
        return { canvas: n3, offsetX: e3, offsetY: i3 };
      }
      d2 = n3;
    }
    if (!d2) {
      u2 = this.canvasFactory.create(s2, r2);
      putBinaryImageMask(u2.context, e2);
    }
    let p2 = Util.transform(l2, [1 / s2, 0, 0, -1 / r2, 0, 0]);
    p2 = Util.transform(p2, [1, 0, 0, 1, 0, -r2]);
    const g2 = i.slice();
    Util.axialAlignedBoundingBox([0, 0, s2, r2], p2, g2);
    const [m2, f2, b2, y2] = g2, v2 = Math.round(b2 - m2) || 1, w2 = Math.round(y2 - f2) || 1, A2 = this.canvasFactory.create(v2, w2), x2 = A2.context, C2 = m2, E2 = f2;
    x2.translate(-C2, -E2);
    x2.transform(...p2);
    let S2 = null;
    if (!d2) {
      const t3 = this._scaleImage(u2.canvas, getCurrentTransformInverse(x2));
      d2 = t3.img;
      S2 = t3.tmpCanvas;
      if (d2 !== u2.canvas) {
        this.canvasFactory.destroy(u2);
        u2 = null;
      }
      if (h2 && a2) {
        h2.set(c2, d2);
        S2 = null;
        u2 = null;
      }
    }
    x2.imageSmoothingEnabled = getImageSmoothingEnabled(getCurrentTransform(x2), e2.interpolate);
    drawImageAtIntegerCoords(x2, d2, 0, 0, d2.width, d2.height, 0, 0, s2, r2);
    S2 && this.canvasFactory.destroy(S2);
    u2 && this.canvasFactory.destroy(u2);
    x2.globalCompositeOperation = "source-in";
    const T2 = Util.transform(getCurrentTransformInverse(x2), [1, 0, 0, 1, -C2, -E2]);
    x2.fillStyle = a2 ? o2.getPattern(n2, this, T2, Et, t2) : o2;
    x2.fillRect(0, 0, s2, r2);
    h2 && !a2 && h2.set(c2, A2.canvas);
    this.dependencyTracker?.recordDependencies(t2, ct);
    return { canvas: A2.canvas, canvasEntry: h2 && !a2 ? null : A2, offsetX: Math.round(C2), offsetY: Math.round(E2) };
  }
  setLineWidth(t2, e2) {
    this.dependencyTracker?.recordSimpleData("lineWidth", t2);
    e2 !== this.current.lineWidth && (this._cachedScaleForStroking[0] = -1);
    this.current.lineWidth = e2;
    this.ctx.lineWidth = e2;
  }
  setLineCap(t2, e2) {
    this.dependencyTracker?.recordSimpleData("lineCap", t2);
    this.ctx.lineCap = Mt[e2];
  }
  setLineJoin(t2, e2) {
    this.dependencyTracker?.recordSimpleData("lineJoin", t2);
    this.ctx.lineJoin = It[e2];
  }
  setMiterLimit(t2, e2) {
    this.dependencyTracker?.recordSimpleData("miterLimit", t2);
    this.ctx.miterLimit = e2;
  }
  setDash(t2, e2, i2) {
    this.dependencyTracker?.recordSimpleData("dash", t2);
    const n2 = this.ctx;
    if (void 0 !== n2.setLineDash) {
      n2.setLineDash(e2);
      n2.lineDashOffset = i2;
    }
  }
  setRenderingIntent(t2, e2) {
  }
  setFlatness(t2, e2) {
  }
  setGState(t2, e2) {
    for (const [i2, n2] of e2) switch (i2) {
      case "LW":
        this.setLineWidth(t2, n2);
        break;
      case "LC":
        this.setLineCap(t2, n2);
        break;
      case "LJ":
        this.setLineJoin(t2, n2);
        break;
      case "ML":
        this.setMiterLimit(t2, n2);
        break;
      case "D":
        this.setDash(t2, n2[0], n2[1]);
        break;
      case "RI":
        this.setRenderingIntent(t2, n2);
        break;
      case "FL":
        this.setFlatness(t2, n2);
        break;
      case "Font":
        this.setFont(t2, n2[0], n2[1]);
        break;
      case "CA":
        this.dependencyTracker?.recordSimpleData("strokeAlpha", t2);
        this.current.strokeAlpha = n2;
        break;
      case "ca":
        this.dependencyTracker?.recordSimpleData("fillAlpha", t2);
        this.ctx.globalAlpha = this.current.fillAlpha = n2;
        break;
      case "BM":
        this.dependencyTracker?.recordSimpleData("globalCompositeOperation", t2);
        this.ctx.globalCompositeOperation = n2;
        break;
      case "SMask":
        this.dependencyTracker?.recordSimpleData("SMask", t2);
        this.current.activeSMask = n2 ? this.tempSMask : null;
        this.current.activeSMask && (this.current.activeSMask.blendMode = this.ctx.globalCompositeOperation);
        this.tempSMask = null;
        this.checkSMaskState(t2);
        break;
      case "TR": {
        this.dependencyTracker?.recordSimpleData("filter", t2);
        let e3 = this.filterFactory.addFilter(n2);
        this.ctx.filter = e3;
        let i3 = null;
        if (n2 && ("none" === e3 || !FeatureTest.isCanvasFilterSupported || "none" === this.ctx.filter || "" === this.ctx.filter)) {
          this.ctx.filter = e3 = "none";
          i3 = new TransferMapsFallback(n2);
        }
        this.current.transferMaps = e3;
        if (i3 || this.current.transferMapsFallback) {
          this.current.transferMapsFallback = i3;
          this.current.patternFill || (this.ctx.fillStyle = this.#Ds(this.current.fillColor));
          this.current.patternStroke || (this.ctx.strokeStyle = this.#Ds(this.current.strokeColor));
        }
        break;
      }
    }
  }
  get inSMaskMode() {
    return !!this.suspendedCtx;
  }
  _clearPreparedSMask() {
    if (this.smaskPreparedEntry) {
      this.canvasFactory.destroy(this.smaskPreparedEntry);
      this.smaskPreparedEntry = null;
    }
    this.smaskPreparedFor = null;
    this.smaskPreparedOffsetX = 0;
    this.smaskPreparedOffsetY = 0;
    this.smaskPreparedOOBAlpha = null;
  }
  _ensurePreparedSMask(t2) {
    if (t2 !== this.smaskPreparedFor) {
      this._clearPreparedSMask();
      this._prepareSMaskCanvas(t2);
    }
  }
  checkSMaskState(t2) {
    const e2 = this.inSMaskMode;
    this.current.activeSMask && !e2 ? this.beginSMaskMode(t2) : !this.current.activeSMask && e2 ? this.endSMaskMode() : this.current.activeSMask && e2 && this._ensurePreparedSMask(this.current.activeSMask);
  }
  _prepareSMaskCanvas(t2) {
    const { canvas: e2, subtype: i2, backdrop: n2, transferMap: s2 } = t2, r2 = "Luminosity" === i2 || "Alpha" === i2 && s2;
    if (!(r2 || "Luminosity" === i2 && n2)) {
      this.smaskPreparedFor = t2;
      return;
    }
    let a2;
    if ("Luminosity" === i2 && n2) {
      const [t3, e3, i3] = getRGBA(n2), r3 = Math.round(0.3 * t3 + 0.59 * e3 + 0.11 * i3);
      a2 = s2?.[r3] ?? r3;
    } else a2 = s2?.[0] ?? 0;
    const { width: o2, height: l2 } = this.ctx.canvas, h2 = o2 * l2 < 4 * (e2.width * e2.height), c2 = r2 ? { url: "Alpha" === i2 ? this.filterFactory.addAlphaFilter(s2) : this.filterFactory.addLuminosityFilter(s2), subtype: i2, transferMap: s2 } : null, d2 = "Luminosity" === i2 ? n2 : null;
    let u2, p2, g2;
    if (h2) {
      u2 = this._bakeSMaskCanvas(e2, t2.offsetX, t2.offsetY, o2, l2, d2, c2);
      p2 = 0;
      g2 = 0;
    } else {
      u2 = this._bakeSMaskCanvas(e2, 0, 0, e2.width, e2.height, d2, c2);
      p2 = t2.offsetX;
      g2 = t2.offsetY;
    }
    this.smaskPreparedEntry = u2;
    this.smaskPreparedFor = t2;
    this.smaskPreparedOffsetX = p2;
    this.smaskPreparedOffsetY = g2;
    this.smaskPreparedOOBAlpha = h2 || 0 === a2 ? null : a2;
  }
  _bakeSMaskCanvas(t2, e2, i2, n2, s2, r2, a2) {
    r2 || a2 || unreachable("_bakeSMaskCanvas with neither backdrop nor filter");
    const o2 = this.canvasFactory.create(n2, s2), l2 = o2.context;
    l2.drawImage(t2, e2, i2);
    if (r2) {
      l2.globalCompositeOperation = "destination-atop";
      l2.fillStyle = r2;
      l2.fillRect(0, 0, n2, s2);
    }
    if (!a2) return o2;
    const h2 = this.canvasFactory.create(n2, s2), c2 = h2.context;
    c2.filter = a2.url;
    const d2 = FeatureTest.isCanvasFilterSupported && "none" !== c2.filter && "" !== c2.filter;
    c2.drawImage(o2.canvas, 0, 0);
    FeatureTest.isCanvasFilterSupported && (c2.filter = "none");
    if (!d2) {
      const t3 = c2.getImageData(0, 0, n2, s2), { data: e3 } = t3, { transferMap: i3 } = a2;
      if ("Luminosity" === a2.subtype) for (let t4 = 0, n3 = e3.length; t4 < n3; t4 += 4) {
        const n4 = 0.3 * e3[t4] + 0.59 * e3[t4 + 1] + 0.11 * e3[t4 + 2] + 0.5 | 0;
        e3[t4] = e3[t4 + 1] = e3[t4 + 2] = 0;
        e3[t4 + 3] = i3?.[n4] ?? n4;
      }
      else for (let t4 = 3, n3 = e3.length; t4 < n3; t4 += 4) e3[t4] = i3[e3[t4]];
      c2.putImageData(t3, 0, 0);
    }
    this.canvasFactory.destroy(o2);
    return h2;
  }
  beginSMaskMode(t2) {
    if (this.inSMaskMode) throw new Error("beginSMaskMode called while already in smask mode");
    const { width: e2, height: i2 } = this.ctx.canvas, n2 = this.canvasFactory.create(e2, i2);
    this.smaskScratchCanvas = n2;
    this.suspendedCtx = this.ctx;
    const s2 = this.ctx = n2.context;
    s2.setTransform(this.suspendedCtx.getTransform());
    copyCtxState(this.suspendedCtx, s2);
    mirrorContextOperations(s2, this.suspendedCtx);
    this._ensurePreparedSMask(this.current.activeSMask);
    this.setGState(t2, [["BM", "source-over"]]);
  }
  endSMaskMode() {
    if (!this.inSMaskMode) throw new Error("endSMaskMode called while not in smask mode");
    this.ctx._removeMirroring();
    copyCtxState(this.ctx, this.suspendedCtx);
    this.ctx = this.suspendedCtx;
    this.suspendedCtx = null;
    this.canvasFactory.destroy(this.smaskScratchCanvas);
    this.smaskScratchCanvas = null;
    this._clearPreparedSMask();
  }
  #Ps(t2, e2 = null, i2 = 1) {
    const { width: n2, height: s2 } = t2, r2 = e2 ?? this.canvasFactory.create(n2, s2), a2 = r2.context, o2 = (i2 = Math.round(255 * i2) / 255) < 1;
    o2 && void 0 === this.#Cs && (this.#Cs = FeatureTest.isCanvasFilterSupported ? /* @__PURE__ */ new Map() : "none");
    let l2 = "none";
    o2 && this.#Cs instanceof Map && (l2 = this.#Cs.getOrInsertComputed(i2, () => this.filterFactory.addKnockoutFilter(i2)));
    if (!o2 || "none" !== l2) {
      if (e2) {
        a2.save();
        a2.setTransform(1, 0, 0, 1, 0, 0);
        a2.clearRect(0, 0, n2, s2);
        a2.restore();
      }
      a2.filter = l2;
      a2.drawImage(t2, 0, 0);
      a2.filter = "none";
      return r2;
    }
    const h2 = t2.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, n2, s2), c2 = a2.createImageData(n2, s2), d2 = h2.data, u2 = c2.data, p2 = i2 > 0 ? 1 / i2 : 1e6;
    for (let t3 = 3, e3 = d2.length; t3 < e3; t3 += 4) u2[t3] = Math.min(Math.round(d2[t3] * p2), 255);
    a2.putImageData(c2, 0, 0);
    return r2;
  }
  #Ms(t2, e2, i2, n2) {
    let s2 = t2?.[e2] ?? null;
    if (s2 && (s2.canvas.width !== i2 || s2.canvas.height !== n2)) {
      this.canvasFactory.destroy(s2);
      s2 = null;
    }
    if (!s2) {
      s2 = this.canvasFactory.create(i2, n2);
      t2 && (t2[e2] = s2);
      return s2;
    }
    const r2 = s2.context;
    r2.save();
    r2.setTransform(1, 0, 0, 1, 0, 0);
    r2.clearRect(0, 0, i2, n2);
    r2.restore();
    return s2;
  }
  #Is(t2, e2, i2 = {}) {
    const { backdropCanvas: n2 = null, destTransform: s2 = [1, 0, 0, 1, 0, 0], backdropOffset: r2 = [0, 0], reuseMaskEntry: a2 = null, poolMeta: o2 = null, sourceAlpha: l2 = 1, sourceFilter: h2 = "none", knockoutAlpha: c2 = 1 } = i2, { width: d2, height: u2 } = e2, p2 = this.#Ps(e2, a2, c2), g2 = t2.globalCompositeOperation;
    t2.save();
    t2.setTransform(...s2);
    t2.globalAlpha = 1;
    FeatureTest.isCanvasFilterSupported && (t2.filter = "none");
    t2.globalCompositeOperation = "destination-out";
    t2.drawImage(p2.canvas, 0, 0);
    if (n2) {
      const [e3, i3] = r2, s3 = this.#Ms(o2, "knockoutBackdropEntry", d2, u2), a3 = s3.context;
      a3.drawImage(n2, e3, i3, d2, u2, 0, 0, d2, u2);
      a3.globalCompositeOperation = "destination-in";
      a3.drawImage(p2.canvas, 0, 0);
      a3.globalCompositeOperation = "source-over";
      t2.globalCompositeOperation = "destination-over";
      t2.drawImage(s3.canvas, 0, 0);
      o2 || this.canvasFactory.destroy(s3);
    }
    t2.globalCompositeOperation = g2;
    t2.globalAlpha = l2;
    FeatureTest.isCanvasFilterSupported && (t2.filter = h2 ?? "none");
    t2.drawImage(e2, 0, 0);
    t2.restore();
    a2 || this.canvasFactory.destroy(p2);
  }
  #Fs(t2 = 1) {
    if (0 === this.#fs || this.#bs > 0 || !this.contentVisible) return false;
    this.#bs++;
    this.#xs = t2;
    const e2 = this.#Ss.at(-1), { canvas: i2 } = this.ctx, n2 = this.#Ms(e2, "knockoutTempEntry", i2.width, i2.height);
    this.#ys = n2;
    const s2 = n2.context;
    s2.save();
    s2.setTransform(this.ctx.getTransform());
    copyCtxState(this.ctx, s2);
    this.#As = s2.globalCompositeOperation;
    s2.globalCompositeOperation = "source-over";
    mirrorContextOperations(s2, this.ctx);
    this.#Es = e2;
    this.#vs = this.ctx;
    this.#ws = this.suspendedCtx;
    this.ctx = s2;
    this.inSMaskMode && (this.suspendedCtx = s2);
    return true;
  }
  #Bs(t2) {
    if (!t2) return;
    const e2 = this.#ys, i2 = this.#vs, n2 = this.#ws, s2 = e2.context;
    this.#ys = null;
    this.#vs = null;
    this.#ws = null;
    this.inSMaskMode && this.suspendedCtx === s2 && this.ctx !== s2 && this.endSMaskMode();
    this.inSMaskMode && (this.suspendedCtx = n2);
    this.ctx._removeMirroring();
    this.ctx.globalCompositeOperation = this.#As;
    this.#As = null;
    copyCtxState(this.ctx, i2);
    this.ctx = i2;
    const r2 = this.#Es;
    this.#Es = null;
    const a2 = this.#xs;
    this.#xs = 1;
    try {
      this.#Is(n2 ?? i2, e2.canvas, { backdropCanvas: r2?.backdropCtx?.canvas ?? null, backdropOffset: r2?.backdropCtx ? [r2.offsetX, r2.offsetY] : [0, 0], reuseMaskEntry: r2?.knockoutMaskEntry ?? null, poolMeta: r2, knockoutAlpha: a2 });
    } finally {
      s2.restore();
      this.#bs--;
      r2 || this.canvasFactory.destroy(e2);
    }
  }
  compose(t2) {
    if (!this.current.activeSMask) return;
    t2 = t2 ? [Math.floor(t2[0]), Math.floor(t2[1]), Math.ceil(t2[2]), Math.ceil(t2[3])] : [0, 0, this.ctx.canvas.width, this.ctx.canvas.height];
    const e2 = this.current.activeSMask, i2 = this.suspendedCtx, n2 = this.#bs > 0 && i2 === this.ctx;
    this.composeSMask(n2 ? null : i2, e2, this.ctx, t2);
    if (!n2) {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      this.ctx.restore();
    }
  }
  composeSMask(t2, e2, i2, n2) {
    const s2 = n2[0], r2 = n2[1], a2 = n2[2] - s2, o2 = n2[3] - r2;
    if (0 === a2 || 0 === o2) return;
    const l2 = this.smaskPreparedEntry;
    if (l2) {
      let t3 = s2, n3 = r2, h2 = a2, c2 = o2;
      const d2 = this.smaskPreparedOOBAlpha, u2 = null !== d2;
      if (u2) {
        t3 = Math.max(s2, e2.offsetX);
        n3 = Math.max(r2, e2.offsetY);
        h2 = Math.min(s2 + a2, e2.offsetX + e2.canvas.width) - t3;
        c2 = Math.min(r2 + o2, e2.offsetY + e2.canvas.height) - n3;
      }
      if (h2 > 0 && c2 > 0) {
        const e3 = t3 - this.smaskPreparedOffsetX, s3 = n3 - this.smaskPreparedOffsetY;
        i2.save();
        i2.globalAlpha = 1;
        i2.setTransform(1, 0, 0, 1, 0, 0);
        const r3 = new Path2D();
        r3.rect(t3, n3, h2, c2);
        i2.clip(r3);
        i2.globalCompositeOperation = "destination-in";
        i2.drawImage(l2.canvas, e3, s3, h2, c2, t3, n3, h2, c2);
        i2.restore();
      }
      u2 && d2 < 255 && this._applySMaskOOBAlpha(i2, s2, r2, a2, o2, t3, n3, t3 + h2, n3 + c2, d2);
    } else this.genericComposeSMask(e2, i2, a2, o2, s2, r2);
    if (t2) {
      t2.save();
      t2.globalAlpha = 1;
      t2.globalCompositeOperation = e2.blendMode || "source-over";
      t2.setTransform(1, 0, 0, 1, 0, 0);
      t2.drawImage(i2.canvas, s2, r2, a2, o2, s2, r2, a2, o2);
      t2.restore();
    }
  }
  _applySMaskOOBAlpha(t2, e2, i2, n2, s2, r2, a2, o2, l2, h2) {
    const c2 = r2 < o2 && a2 < l2;
    if (c2 && r2 === e2 && a2 === i2 && o2 === e2 + n2 && l2 === i2 + s2) return;
    const d2 = new Path2D();
    d2.rect(e2, i2, n2, s2);
    c2 && d2.rect(r2, a2, o2 - r2, l2 - a2);
    t2.save();
    t2.globalAlpha = h2 / 255;
    t2.setTransform(1, 0, 0, 1, 0, 0);
    t2.clip(d2, "evenodd");
    t2.globalCompositeOperation = "destination-in";
    t2.fillStyle = "#000000";
    t2.fillRect(e2, i2, n2, s2);
    t2.restore();
  }
  genericComposeSMask(t2, e2, i2, n2, s2, r2) {
    const { context: a2, offsetX: o2, offsetY: l2 } = t2;
    e2.save();
    e2.globalAlpha = 1;
    e2.setTransform(1, 0, 0, 1, 0, 0);
    const h2 = new Path2D();
    h2.rect(s2, r2, i2, n2);
    e2.clip(h2);
    e2.globalCompositeOperation = "destination-in";
    e2.drawImage(a2.canvas, s2 - o2, r2 - l2, i2, n2, s2, r2, i2, n2);
    e2.restore();
  }
  save(t2) {
    this.inSMaskMode && copyCtxState(this.ctx, this.suspendedCtx);
    this.ctx.save();
    const e2 = this.current;
    this.stateStack.push(e2);
    this.current = e2.clone();
    this.dependencyTracker?.save(t2);
  }
  restore(t2) {
    this.dependencyTracker?.restore(t2);
    if (0 !== this.stateStack.length) {
      this.current = this.stateStack.pop();
      this.ctx.restore();
      if (this.inSMaskMode) {
        copyCtxState(this.suspendedCtx, this.ctx);
        this.ctx.setTransform(this.suspendedCtx.getTransform());
      }
      this.checkSMaskState(t2);
      this.pendingClip = null;
      this._cachedScaleForStroking[0] = -1;
    } else this.inSMaskMode && this.endSMaskMode();
  }
  transform(t2, e2, i2, n2, s2, r2, a2) {
    this.dependencyTracker?.recordIncrementalData("transform", t2);
    this.ctx.transform(e2, i2, n2, s2, r2, a2);
    this._cachedScaleForStroking[0] = -1;
  }
  constructPath(t2, e2, i2, n2) {
    let [s2] = i2;
    if (!n2) {
      s2 ||= i2[0] = new Path2D();
      e2 !== F.stroke && e2 !== F.closeStroke && (this.current.tilingPatternDims = null);
      this[e2](t2, s2);
      return;
    }
    if (null !== this.dependencyTracker) {
      const i3 = e2 === F.stroke ? this.current.lineWidth / 2 : 0;
      this.dependencyTracker.resetBBox(t2).recordBBox(t2, this.ctx, n2[0] - i3, n2[2] + i3, n2[1] - i3, n2[3] + i3).recordDependencies(t2, ["transform"]);
    }
    s2 instanceof Path2D || (s2 = i2[0] = makePathFromDrawOPS(s2));
    Util.axialAlignedBoundingBox(n2, getCurrentTransform(this.ctx), this.current.minMax);
    const r2 = this.current.tilingPatternDims;
    if (r2 && e2 !== F.stroke && e2 !== F.closeStroke && this.current.fillColor instanceof TilingPattern) {
      const t3 = Util.intersect(this.current.clipBox, this.current.minMax);
      t3 ? this.current.fillColor.updatePatternDims(t3, r2) : this.current.tilingPatternDims = null;
    }
    this[e2](t2, s2);
    this._pathStartIdx = t2;
  }
  closePath(t2) {
    this.ctx.closePath();
  }
  stroke(t2, e2, i2 = true) {
    const n2 = i2 && this.#Fs(this.current.strokeAlpha), s2 = this.ctx, r2 = this.current.strokeColor;
    s2.globalAlpha = this.current.strokeAlpha;
    if (this.contentVisible) if ("object" == typeof r2 && r2?.getPattern) {
      const i3 = r2.isModifyingCurrentTransform() ? s2.getTransform() : null;
      s2.save();
      s2.strokeStyle = r2.getPattern(s2, this, getCurrentTransformInverse(s2), St, t2);
      if (i3) {
        const t3 = new Path2D();
        t3.addPath(e2, s2.getTransform().invertSelf().multiplySelf(i3));
        e2 = t3;
      }
      this.rescaleAndStroke(e2, false);
      s2.restore();
    } else this.rescaleAndStroke(e2, true);
    this.dependencyTracker?.recordDependencies(t2, st);
    i2 && this.consumePath(t2, e2, this.current.getClippedPathBoundingBox(St, getCurrentTransform(this.ctx)));
    s2.globalAlpha = this.current.fillAlpha;
    this.#Bs(n2);
  }
  closeStroke(t2, e2) {
    this.stroke(t2, e2);
  }
  fill(t2, e2, i2 = true) {
    const n2 = i2 && this.#Fs(this.current.fillAlpha), s2 = this.ctx, r2 = this.current.fillColor, a2 = this.current.patternFill;
    let o2 = false;
    const l2 = this.current.getClippedPathBoundingBox();
    this.dependencyTracker?.recordDependencies(t2, rt);
    if (a2) {
      const a3 = this.current.tilingPatternDims, h2 = a3 && r2.canSkipPatternCanvas(a3);
      if (h2) {
        r2.drawPattern(this, e2, this.pendingEOFill, h2, t2);
        this.pendingEOFill = false;
        i2 && this.consumePath(t2, e2, l2);
        this.current.tilingPatternDims = null;
        this.#Bs(n2);
        return;
      }
      const c2 = r2.isModifyingCurrentTransform() ? s2.getTransform() : null;
      this.dependencyTracker?.save(t2);
      s2.save();
      s2.fillStyle = r2.getPattern(s2, this, getCurrentTransformInverse(s2), Et, t2);
      if (c2) {
        const t3 = new Path2D();
        t3.addPath(e2, s2.getTransform().invertSelf().multiplySelf(c2));
        e2 = t3;
      }
      o2 = true;
    }
    if (this.contentVisible && null !== l2) if (this.pendingEOFill) {
      s2.fill(e2, "evenodd");
      this.pendingEOFill = false;
    } else s2.fill(e2);
    if (o2) {
      s2.restore();
      this.dependencyTracker?.restore(t2);
    }
    i2 && this.consumePath(t2, e2, l2);
    this.#Bs(n2);
  }
  eoFill(t2, e2) {
    this.pendingEOFill = true;
    this.fill(t2, e2);
  }
  fillStroke(t2, e2) {
    const i2 = this.#Fs(Math.min(this.current.fillAlpha, this.current.strokeAlpha));
    this.fill(t2, e2, false);
    this.stroke(t2, e2, false);
    this.consumePath(t2, e2);
    this.#Bs(i2);
  }
  eoFillStroke(t2, e2) {
    this.pendingEOFill = true;
    this.fillStroke(t2, e2);
  }
  closeFillStroke(t2, e2) {
    this.fillStroke(t2, e2);
  }
  closeEOFillStroke(t2, e2) {
    this.pendingEOFill = true;
    this.fillStroke(t2, e2);
  }
  endPath(t2, e2) {
    this.consumePath(t2, e2);
  }
  rawFillPath(t2, e2) {
    const i2 = this.#Fs(this.current.fillAlpha);
    this.ctx.fill(e2);
    this.dependencyTracker?.recordDependencies(t2, ot).recordOperation(t2);
    this.#Bs(i2);
  }
  clip(t2) {
    this.dependencyTracker?.recordFutureForcedDependency("clipMode", t2);
    this.pendingClip = Ft;
  }
  eoClip(t2) {
    this.dependencyTracker?.recordFutureForcedDependency("clipMode", t2);
    this.pendingClip = Bt;
  }
  beginText(t2) {
    this.current.textMatrix = null;
    this.current.textMatrixScale = 1;
    this.current.x = this.current.lineX = 0;
    this.current.y = this.current.lineY = 0;
    this.dependencyTracker?.recordOpenMarker(t2).resetIncrementalData("sameLineText").resetIncrementalData("moveText", t2);
  }
  endText(t2) {
    const e2 = this.pendingTextPaths, i2 = this.ctx;
    if (this.dependencyTracker) {
      const { dependencyTracker: i3 } = this;
      void 0 !== e2 && i3.recordFutureForcedDependency("textClip", i3.getOpenMarker()).recordFutureForcedDependency("textClip", t2);
      i3.recordCloseMarker(t2);
    }
    if (void 0 !== e2) {
      const t3 = new Path2D(), n2 = i2.getTransform().invertSelf();
      for (const { transform: i3, x: s2, y: r2, fontSize: a2, path: o2 } of e2) o2 && t3.addPath(o2, new DOMMatrix(i3).preMultiplySelf(n2).translate(s2, r2).scale(a2, -a2));
      i2.clip(t3);
    }
    delete this.pendingTextPaths;
  }
  setCharSpacing(t2, e2) {
    this.dependencyTracker?.recordSimpleData("charSpacing", t2);
    this.current.charSpacing = e2;
  }
  setWordSpacing(t2, e2) {
    this.dependencyTracker?.recordSimpleData("wordSpacing", t2);
    this.current.wordSpacing = e2;
  }
  setHScale(t2, e2) {
    this.dependencyTracker?.recordSimpleData("hScale", t2);
    this.current.textHScale = e2 / 100;
  }
  setLeading(t2, e2) {
    this.dependencyTracker?.recordSimpleData("leading", t2);
    this.current.leading = -e2;
  }
  setFont(t2, e2, i2) {
    this.dependencyTracker?.recordSimpleData("font", t2).recordSimpleDataFromNamed("fontObj", e2, t2);
    const s2 = this.commonObjs.get(e2), r2 = this.current;
    if (!s2) throw new Error(`Can't find font for ${e2}`);
    r2.fontMatrix = s2.fontMatrix || n;
    0 !== r2.fontMatrix[0] && 0 !== r2.fontMatrix[3] || warn("Invalid font matrix for font " + e2);
    if (i2 < 0) {
      i2 = -i2;
      r2.fontDirection = -1;
    } else r2.fontDirection = 1;
    this.current.font = s2;
    this.current.fontSize = i2;
    if (s2.isType3Font) return;
    const a2 = s2.loadedName || "sans-serif", o2 = s2.systemFontInfo?.css || `"${a2}", ${s2.fallbackName}`;
    let l2 = "normal";
    s2.black ? l2 = "900" : s2.bold && (l2 = "bold");
    const h2 = s2.italic ? "italic" : "normal", c2 = MathClamp(i2, 16, 100);
    this.current.fontSizeScale = i2 / c2;
    this.ctx.font = `${h2} ${l2} ${c2}px ${o2}`;
  }
  setTextRenderingMode(t2, e2) {
    this.dependencyTracker?.recordSimpleData("textRenderingMode", t2);
    this.current.textRenderingMode = e2;
  }
  setTextRise(t2, e2) {
    this.dependencyTracker?.recordSimpleData("textRise", t2);
    this.current.textRise = e2;
  }
  moveText(t2, e2, i2) {
    this.dependencyTracker?.resetIncrementalData("sameLineText").recordIncrementalData("moveText", t2);
    this.current.x = this.current.lineX += e2;
    this.current.y = this.current.lineY += i2;
  }
  setLeadingMoveText(t2, e2, i2) {
    this.setLeading(t2, -i2);
    this.moveText(t2, e2, i2);
  }
  setTextMatrix(t2, e2) {
    this.dependencyTracker?.resetIncrementalData("sameLineText").recordSimpleData("textMatrix", t2);
    const { current: i2 } = this;
    i2.textMatrix = e2;
    i2.textMatrixScale = Math.hypot(e2[0], e2[1]);
    i2.x = i2.lineX = 0;
    i2.y = i2.lineY = 0;
  }
  nextLine(t2) {
    this.moveText(t2, 0, this.current.leading);
    this.dependencyTracker?.recordIncrementalData("moveText", this.dependencyTracker.getSimpleIndex("leading") ?? t2);
  }
  #Os(t2, e2, i2) {
    const n2 = new Path2D();
    n2.addPath(t2, new DOMMatrix(i2).invertSelf().multiplySelf(e2));
    return n2;
  }
  paintChar(t2, e2, i2, n2, s2, r2) {
    const a2 = this.ctx, o2 = this.current, l2 = o2.font, h2 = o2.textRenderingMode, c2 = o2.fontSize / o2.fontSizeScale, d2 = h2 & C, u2 = !!(h2 & E), p2 = o2.patternFill && !l2.missingFile, g2 = o2.patternStroke && !l2.missingFile;
    let m2;
    (l2.disableFontFace || u2 || p2 || g2) && !l2.missingFile && (m2 = l2.getPathGenerator(this.commonObjs, e2));
    if (m2 && (l2.disableFontFace || p2 || g2)) {
      a2.save();
      a2.translate(i2, n2);
      a2.scale(c2, -c2);
      this.dependencyTracker?.recordCharacterBBox(t2, a2, l2);
      let e3;
      if (d2 === v || d2 === A) if (s2) {
        e3 = a2.getTransform();
        a2.setTransform(...s2);
        const t3 = this.#Os(m2, e3, s2);
        a2.fill(t3);
      } else a2.fill(m2);
      if (d2 === w || d2 === A) if (r2) {
        e3 ||= a2.getTransform();
        a2.setTransform(...r2);
        const { a: t3, b: i3, c: n3, d: s3 } = e3, o3 = Util.inverseTransform(r2), l3 = Util.transform([t3, i3, n3, s3, 0, 0], o3);
        Util.singularValueDecompose2dScale(l3, Pt);
        a2.lineWidth *= Math.max(Pt[0], Pt[1]) / c2;
        a2.stroke(this.#Os(m2, e3, r2));
      } else {
        a2.lineWidth /= c2;
        a2.stroke(m2);
      }
      a2.restore();
    } else {
      if (d2 === v || d2 === A) {
        a2.fillText(e2, i2, n2);
        this.dependencyTracker?.recordCharacterBBox(t2, a2, l2, c2, i2, n2, () => a2.measureText(e2));
      }
      if (d2 === w || d2 === A) {
        this.dependencyTracker && this.dependencyTracker?.recordCharacterBBox(t2, a2, l2, c2, i2, n2, () => a2.measureText(e2)).recordDependencies(t2, st);
        a2.strokeText(e2, i2, n2);
      }
    }
    if (u2) {
      (this.pendingTextPaths ||= []).push({ transform: getCurrentTransform(a2), x: i2, y: n2, fontSize: c2, path: m2 });
      this.dependencyTracker?.recordCharacterBBox(t2, a2, l2, c2, i2, n2);
    }
  }
  get isFontSubpixelAAEnabled() {
    const t2 = this.canvasFactory.create(10, 10), e2 = t2.context;
    e2.scale(1.5, 1);
    e2.fillText("I", 0, 10);
    const i2 = e2.getImageData(0, 0, 10, 10).data;
    this.canvasFactory.destroy(t2);
    let n2 = false;
    for (let t3 = 3; t3 < i2.length; t3 += 4) if (i2[t3] > 0 && i2[t3] < 255) {
      n2 = true;
      break;
    }
    return shadow(this, "isFontSubpixelAAEnabled", n2);
  }
  showText(t2, e2) {
    if (this.dependencyTracker) {
      this.dependencyTracker.recordDependencies(t2, lt).resetBBox(t2);
      this.current.textRenderingMode & E && this.dependencyTracker.recordFutureForcedDependency("textClip", t2).inheritPendingDependenciesAsFutureForcedDependencies();
    }
    const i2 = this.current, n2 = i2.font;
    if (n2.isType3Font) {
      const n3 = this.#Fs(i2.fillAlpha);
      this.showType3Text(t2, e2);
      this.dependencyTracker?.recordShowTextOperation(t2);
      this.#Bs(n3);
      return;
    }
    const s2 = i2.fontSize;
    if (0 === s2) {
      this.dependencyTracker?.recordOperation(t2);
      return;
    }
    const r2 = this.#Fs(i2.fillAlpha), a2 = this.ctx, o2 = i2.fontSizeScale, l2 = i2.charSpacing, h2 = i2.wordSpacing, c2 = i2.fontDirection, d2 = i2.textHScale * c2, u2 = e2.length, p2 = n2.vertical, g2 = p2 ? 1 : -1, m2 = s2 * i2.fontMatrix[0], f2 = i2.textRenderingMode === v && !n2.disableFontFace && !i2.patternFill;
    a2.save();
    i2.textMatrix && a2.transform(...i2.textMatrix);
    a2.translate(i2.x, i2.y + i2.textRise);
    c2 > 0 ? a2.scale(d2, -1) : a2.scale(d2, 1);
    let b2, y2;
    const x2 = i2.textRenderingMode & C, S2 = x2 === v || x2 === A, T2 = x2 === w || x2 === A;
    let _2 = i2.lineWidth;
    const k2 = i2.textMatrixScale;
    0 === k2 || 0 === _2 ? T2 && (_2 = this.getSinglePixelWidth()) : _2 /= k2;
    if (1 !== o2) {
      a2.scale(o2, o2);
      _2 /= o2;
    }
    a2.lineWidth = _2;
    if (S2 && i2.patternFill) {
      a2.save();
      const e3 = i2.fillColor.getPattern(a2, this, getCurrentTransformInverse(a2), Et, t2);
      b2 = getCurrentTransform(a2);
      a2.restore();
      a2.fillStyle = e3;
    }
    if (T2 && i2.patternStroke) {
      a2.save();
      const e3 = i2.strokeColor.getPattern(a2, this, getCurrentTransformInverse(a2), St, t2);
      y2 = getCurrentTransform(a2);
      a2.restore();
      a2.strokeStyle = e3;
    }
    if (n2.isInvalidPDFjsFont) {
      const n3 = [];
      let s3 = 0;
      for (const t3 of e2) {
        n3.push(t3.unicode);
        s3 += t3.width;
      }
      const o3 = n3.join("");
      a2.fillText(o3, 0, 0);
      if (null !== this.dependencyTracker) {
        const e3 = a2.measureText(o3);
        this.dependencyTracker.recordBBox(t2, this.ctx, -e3.actualBoundingBoxLeft, e3.actualBoundingBoxRight, -e3.actualBoundingBoxAscent, e3.actualBoundingBoxDescent).recordShowTextOperation(t2);
      }
      i2.x += s3 * m2 * d2;
      a2.restore();
      this.compose();
      this.#Bs(r2);
      return;
    }
    let D2, P2 = 0;
    for (D2 = 0; D2 < u2; ++D2) {
      const i3 = e2[D2];
      if ("number" == typeof i3) {
        P2 += g2 * i3 * s2 / 1e3;
        continue;
      }
      let r3 = false;
      const d3 = (i3.isSpace ? h2 : 0) + l2, u3 = i3.fontChar, v2 = i3.accent;
      let w2, A2, x3, C2 = i3.width;
      if (p2) {
        const t3 = i3.vmetric, e3 = -t3[1] * m2, n3 = t3[2] * m2;
        C2 = -t3[0];
        w2 = e3 / o2;
        A2 = (P2 + n3) / o2;
      } else {
        w2 = P2 / o2;
        A2 = 0;
      }
      if (n2.remeasure && C2 > 0) {
        x3 = a2.measureText(u3);
        const t3 = 1e3 * x3.width / s2 * o2;
        if (C2 < t3 && this.isFontSubpixelAAEnabled) {
          const e3 = C2 / t3;
          r3 = true;
          a2.save();
          a2.scale(e3, 1);
          w2 /= e3;
        } else C2 !== t3 && (w2 += (C2 - t3) / 2e3 * s2 / o2);
      }
      if (this.contentVisible && (i3.isInFont || n2.missingFile)) if (f2 && !v2) {
        a2.fillText(u3, w2, A2);
        this.dependencyTracker?.recordCharacterBBox(t2, a2, x3 ? { bbox: null } : n2, s2 / o2, w2, A2, () => x3 ?? a2.measureText(u3));
      } else {
        this.paintChar(t2, u3, w2, A2, b2, y2);
        if (v2) {
          const e3 = w2 + s2 * v2.offset.x / o2, i4 = A2 - s2 * v2.offset.y / o2;
          this.paintChar(t2, v2.fontChar, e3, i4, b2, y2);
        }
      }
      P2 += p2 ? C2 * m2 - d3 * c2 : C2 * m2 + d3 * c2;
      r3 && a2.restore();
    }
    p2 ? i2.y -= P2 : i2.x += P2 * d2;
    a2.restore();
    this.compose();
    this.dependencyTracker?.recordShowTextOperation(t2);
    this.#Bs(r2);
  }
  showType3Text(t2, e2) {
    const i2 = this.ctx, s2 = this.current, r2 = s2.font, a2 = s2.fontSize, o2 = s2.fontDirection, l2 = r2.vertical ? 1 : -1, h2 = s2.charSpacing, c2 = s2.wordSpacing, d2 = s2.textHScale * o2, u2 = s2.fontMatrix || n, p2 = e2.length;
    let g2, m2, f2, b2;
    if (s2.textRenderingMode === x || 0 === a2) return;
    this._cachedScaleForStroking[0] = -1;
    i2.save();
    s2.textMatrix && i2.transform(...s2.textMatrix);
    i2.translate(s2.x, s2.y + s2.textRise);
    i2.scale(d2, o2);
    const y2 = this.dependencyTracker;
    this.dependencyTracker = y2 ? new CanvasNestedDependencyTracker(y2, t2) : null;
    for (g2 = 0; g2 < p2; ++g2) {
      m2 = e2[g2];
      if ("number" == typeof m2) {
        b2 = l2 * m2 * a2 / 1e3;
        this.ctx.translate(b2, 0);
        s2.x += b2 * d2;
        continue;
      }
      const t3 = (m2.isSpace ? c2 : 0) + h2, n2 = r2.charProcOperatorList.get(m2.operatorListId);
      if (n2) {
        if (this.contentVisible) {
          this.save();
          if (n2.fnArray[0] === F.setCharWidth) {
            s2.fillAlpha = s2.strokeAlpha = 1;
            i2.globalAlpha = 1;
          }
          i2.scale(a2, a2);
          i2.transform(...u2);
          this.executeOperatorList(n2);
          this.restore();
        }
      } else warn(`Type3 character "${m2.operatorListId}" is not available.`);
      const o3 = [m2.width, 0];
      Util.applyTransform(o3, u2);
      f2 = o3[0] * a2 + t3;
      i2.translate(f2, 0);
      s2.x += f2 * d2;
    }
    i2.restore();
    y2 && (this.dependencyTracker = y2);
  }
  setCharWidth(t2, e2, i2) {
  }
  setCharWidthAndBounds(t2, e2, i2, n2, s2, r2, a2) {
    const o2 = new Path2D();
    o2.rect(n2, s2, r2 - n2, a2 - s2);
    this.ctx.clip(o2);
    this.dependencyTracker?.recordBBox(t2, this.ctx, n2, r2, s2, a2).recordClipBox(t2, this.ctx, n2, r2, s2, a2);
    this.endPath(t2);
  }
  getColorN_Pattern(t2, e2) {
    let i2;
    if ("TilingPattern" === e2[0]) {
      const t3 = this.baseTransform || getCurrentTransform(this.ctx), n2 = { createCanvasGraphics: (t4, e3) => new CanvasGraphics(t4, this.commonObjs, this.objs, this.canvasFactory, this.filterFactory, { optionalContentConfig: this.optionalContentConfig, markedContentStack: this.markedContentStack }, void 0, void 0, this.dependencyTracker ? new CanvasNestedDependencyTracker(this.dependencyTracker, e3, true) : null) };
      i2 = new TilingPattern(e2, this.ctx, n2, t3);
    } else i2 = this._getPattern(t2, e2[1], e2[2]);
    return i2;
  }
  setStrokeColorN(t2, ...e2) {
    this.dependencyTracker?.recordSimpleData("strokeColor", t2);
    this.current.strokeColor = this.getColorN_Pattern(t2, e2);
    this.current.patternStroke = true;
  }
  setFillColorN(t2, ...e2) {
    this.dependencyTracker?.recordSimpleData("fillColor", t2);
    const i2 = this.current.fillColor = this.getColorN_Pattern(t2, e2);
    this.current.patternFill = true;
    this.current.tilingPatternDims = i2 instanceof TilingPattern ? [0, 0, 0, 0] : null;
  }
  #Ds(t2) {
    return this.current.transferMapsFallback?.applyToColor(t2) ?? t2;
  }
  setStrokeRGBColor(t2, e2) {
    this.dependencyTracker?.recordSimpleData("strokeColor", t2);
    this.current.strokeColor = e2;
    this.ctx.strokeStyle = this.#Ds(e2);
    this.current.patternStroke = false;
  }
  setStrokeTransparent(t2) {
    this.dependencyTracker?.recordSimpleData("strokeColor", t2);
    this.ctx.strokeStyle = this.current.strokeColor = "transparent";
    this.current.patternStroke = false;
  }
  setFillRGBColor(t2, e2) {
    this.dependencyTracker?.recordSimpleData("fillColor", t2);
    this.current.fillColor = e2;
    this.ctx.fillStyle = this.#Ds(e2);
    this.current.patternFill = false;
    this.current.tilingPatternDims = null;
  }
  setFillTransparent(t2) {
    this.dependencyTracker?.recordSimpleData("fillColor", t2);
    this.ctx.fillStyle = this.current.fillColor = "transparent";
    this.current.patternFill = false;
    this.current.tilingPatternDims = null;
  }
  _getPattern(t2, e2, i2 = null) {
    const n2 = this.cachedPatterns.getOrInsertComputed(e2, () => (function getShadingPattern(t3) {
      switch (t3[0]) {
        case "RadialAxial":
          return new RadialAxialShadingPattern(t3);
        case "Mesh":
          return new MeshShadingPattern(t3);
        case "Dummy":
          return new DummyShadingPattern();
      }
      throw new Error(`Unknown IR type: ${t3[0]}`);
    })(this.getObject(t2, e2)));
    i2 && (n2.matrix = i2);
    return n2;
  }
  shadingFill(t2, e2) {
    if (!this.contentVisible) return;
    const n2 = this.#Fs(this.current.fillAlpha), s2 = this.ctx;
    this.save(t2);
    const r2 = this._getPattern(t2, e2);
    s2.fillStyle = r2.getPattern(s2, this, getCurrentTransformInverse(s2), Tt, t2);
    const a2 = getCurrentTransformInverse(s2);
    if (a2) {
      const { width: t3, height: e3 } = s2.canvas, n3 = i.slice();
      Util.axialAlignedBoundingBox([0, 0, t3, e3], a2, n3);
      const [r3, o2, l2, h2] = n3;
      this.ctx.fillRect(r3, o2, l2 - r3, h2 - o2);
    } else this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
    this.dependencyTracker?.resetBBox(t2).recordFullPageBBox(t2).recordDependencies(t2, ht).recordDependencies(t2, rt).recordOperation(t2);
    this.compose(this.current.getClippedPathBoundingBox());
    this.restore(t2);
    this.#Bs(n2);
  }
  beginInlineImage() {
    unreachable("Should not call beginInlineImage");
  }
  beginImageData() {
    unreachable("Should not call beginImageData");
  }
  paintFormXObjectBegin(t2, e2, i2) {
    if (this.contentVisible) {
      this.save(t2);
      this.baseTransformStack.push(this.baseTransform);
      e2 && this.transform(t2, ...e2);
      this.baseTransform = getCurrentTransform(this.ctx);
      if (i2) {
        Util.axialAlignedBoundingBox(i2, this.baseTransform, this.current.minMax);
        const [e3, n2, s2, r2] = i2, a2 = new Path2D();
        a2.rect(e3, n2, s2 - e3, r2 - n2);
        this.ctx.clip(a2);
        this.dependencyTracker?.recordClipBox(t2, this.ctx, e3, s2, n2, r2);
        this.endPath(t2);
      }
    }
  }
  paintFormXObjectEnd(t2) {
    if (this.contentVisible) {
      this.restore(t2);
      this.baseTransform = this.baseTransformStack.pop();
    }
  }
  beginGroup(t2, e2) {
    if (!this.contentVisible) return;
    this.save(t2);
    const { inSMaskMode: n2 } = this;
    if (n2) {
      this.endSMaskMode();
      this.current.activeSMask = null;
    }
    const s2 = this.ctx;
    if (!(e2.needsIsolation && (e2.isolated || e2.hasSoftMask) || e2.knockout || e2.isGray || 0 !== this.#fs || 1 !== s2.globalAlpha || "source-over" !== s2.globalCompositeOperation || n2)) {
      if (e2.bbox) {
        let t3 = new Path2D();
        const [i2, n3, r3, a3] = e2.bbox;
        t3.rect(i2, n3, r3 - i2, a3 - n3);
        if (e2.matrix) {
          const i3 = new Path2D();
          i3.addPath(t3, new DOMMatrix(e2.matrix));
          t3 = i3;
        }
        s2.clip(t3);
      }
      this.groupStack.push(null);
      this.#Ss.push(null);
      this.groupLevel++;
      return;
    }
    e2.isolated || e2.knockout || 0 !== this.#fs || info("TODO: Fully support non-isolated non-knockout groups.");
    const r2 = getCurrentTransform(s2);
    e2.matrix && s2.transform(...e2.matrix);
    const a2 = [0, 0, s2.canvas.width, s2.canvas.height];
    let o2;
    if (e2.bbox) {
      o2 = i.slice();
      Util.axialAlignedBoundingBox(e2.bbox, getCurrentTransform(s2), o2);
      o2 = Util.intersect(o2, a2) || [0, 0, 0, 0];
    } else o2 = a2;
    const l2 = Math.floor(o2[0]), h2 = Math.floor(o2[1]), c2 = Math.max(Math.ceil(o2[2]) - l2, 1), d2 = Math.max(Math.ceil(o2[3]) - h2, 1);
    this.current.startNewPathAndClipBox([0, 0, c2, d2]);
    const u2 = this.canvasFactory.create(c2, d2);
    e2.smask && this.smaskGroupCanvases.push(u2);
    const p2 = u2.context, g2 = e2.knockout && !e2.isolated ? s2 : null, m2 = !e2.isolated && !e2.knockout && !e2.smask && e2.needsIsolation && this.#fs > 0, f2 = e2.knockout ? this.canvasFactory.create(c2, d2) : null, b2 = this.#fs;
    e2.knockout ? this.#fs++ : this.#fs = 0;
    p2.translate(-l2, -h2);
    p2.transform(...r2);
    const y2 = !e2.isolated && !e2.smask && e2.needsIsolation, v2 = y2 && !n2 && 0 === b2 && !e2.knockout && !e2.isGray && e2.hasSoftMask && 1 === s2.globalAlpha && "source-over" === s2.globalCompositeOperation && "none" === this.current.transferMaps && !this.current.transferMapsFallback;
    if (y2 && (n2 || v2)) {
      p2.save();
      p2.setTransform(1, 0, 0, 1, 0, 0);
      p2.drawImage(s2.canvas, -l2, -h2);
      p2.restore();
    }
    if (e2.bbox) {
      let t3 = new Path2D();
      const [i2, n3, s3, r3] = e2.bbox;
      t3.rect(i2, n3, s3 - i2, r3 - n3);
      if (e2.matrix) {
        const i3 = new Path2D();
        i3.addPath(t3, new DOMMatrix(e2.matrix));
        t3 = i3;
      }
      p2.clip(t3);
    }
    e2.smask && this.smaskStack.push({ canvas: u2.canvas, context: p2, offsetX: l2, offsetY: h2, subtype: e2.smask.subtype, backdrop: e2.smask.backdrop, transferMap: e2.smask.transferMap || null });
    if (!e2.smask || this.dependencyTracker) {
      s2.setTransform(1, 0, 0, 1, 0, 0);
      s2.translate(l2, h2);
      s2.save();
    }
    copyCtxState(s2, p2);
    this.ctx = p2;
    this.dependencyTracker?.inheritSimpleDataAsFutureForcedDependencies(["fillAlpha", "strokeAlpha", "globalCompositeOperation"]).pushBaseTransform(s2);
    this.setGState(t2, [["BM", "source-over"], ["ca", 1], ["CA", 1], ["TR", null]]);
    this.groupStack.push(s2);
    this.#Ss.push({ backdropCtx: g2, savedKnockoutLevel: b2, offsetX: l2, offsetY: h2, hasInnerBackdrop: m2, replaceBackdrop: v2, knockoutMaskEntry: f2, knockoutTempEntry: null, knockoutBackdropEntry: null });
    this.groupLevel++;
  }
  endGroup(t2, e2) {
    if (!this.contentVisible) return;
    this.groupLevel--;
    const n2 = this.ctx, s2 = this.groupStack.pop(), r2 = this.#Ss.pop();
    r2 && (this.#fs = r2.savedKnockoutLevel);
    if (null !== s2) {
      e2.isGray && this.#Rs(n2);
      this.ctx = s2;
      this.ctx.imageSmoothingEnabled = false;
      this.dependencyTracker?.popBaseTransform();
      if (e2.smask) {
        this.tempSMask = this.smaskStack.pop();
        this.restore(t2);
        if (this.dependencyTracker) {
          this.ctx.restore();
          this.inSMaskMode && this.ctx.setTransform(this.suspendedCtx.getTransform());
        }
        this.#_s(r2);
      } else {
        this.ctx.restore();
        const e3 = getCurrentTransform(this.ctx);
        this.restore(t2);
        this.current.transferMapsFallback?.applyToCanvas(n2);
        this.ctx.save();
        this.ctx.setTransform(...e3);
        const a2 = i.slice();
        Util.axialAlignedBoundingBox([0, 0, n2.canvas.width, n2.canvas.height], e3, a2);
        const o2 = this.#Ss.at(-1);
        if (this.#fs > 0) if (r2.hasInnerBackdrop) {
          const { width: t3, height: i2 } = n2.canvas, a3 = this.canvasFactory.create(t3, i2), o3 = a3.context;
          o3.drawImage(s2.canvas, r2.offsetX, r2.offsetY, t3, i2, 0, 0, t3, i2);
          o3.globalCompositeOperation = "source-over";
          o3.drawImage(n2.canvas, 0, 0);
          const l2 = this.#Ps(n2.canvas);
          o3.globalCompositeOperation = "destination-in";
          o3.drawImage(l2.canvas, 0, 0);
          const h2 = this.ctx.globalCompositeOperation, c2 = this.ctx.globalAlpha, d2 = this.ctx.filter;
          this.ctx.save();
          this.ctx.setTransform(...e3);
          this.ctx.globalAlpha = 1;
          FeatureTest.isCanvasFilterSupported && (this.ctx.filter = "none");
          this.ctx.globalCompositeOperation = "destination-out";
          this.ctx.drawImage(l2.canvas, 0, 0);
          this.ctx.globalCompositeOperation = h2;
          this.ctx.globalAlpha = c2;
          FeatureTest.isCanvasFilterSupported && (this.ctx.filter = d2 ?? "none");
          this.ctx.drawImage(a3.canvas, 0, 0);
          this.ctx.restore();
          this.canvasFactory.destroy(l2);
          this.canvasFactory.destroy(a3);
        } else {
          const t3 = o2?.backdropCtx ?? null;
          this.#Is(this.ctx, n2.canvas, { backdropCanvas: t3?.canvas ?? null, destTransform: e3, backdropOffset: t3 ? [o2.offsetX + r2.offsetX, o2.offsetY + r2.offsetY] : [0, 0], sourceAlpha: this.ctx.globalAlpha, sourceFilter: this.ctx.filter });
        }
        else {
          if (r2.replaceBackdrop) {
            const t3 = new Path2D();
            t3.rect(0, 0, n2.canvas.width, n2.canvas.height);
            this.ctx.clip(t3);
            this.ctx.globalCompositeOperation = "copy";
          }
          this.ctx.drawImage(n2.canvas, 0, 0);
        }
        this.ctx.restore();
        this.canvasFactory.destroy({ canvas: n2.canvas, context: n2 });
        this.#_s(r2);
        this.compose(a2);
      }
    } else this.restore(t2);
  }
  #Rs(t2) {
    const { canvas: e2 } = t2, { width: i2, height: n2 } = e2;
    if (FeatureTest.isCanvasFilterSupported) {
      t2.save();
      t2.setTransform(1, 0, 0, 1, 0, 0);
      t2.filter = "grayscale(1)";
      t2.globalAlpha = 1;
      t2.globalCompositeOperation = "copy";
      t2.drawImage(e2, 0, 0);
      t2.restore();
      return;
    }
    const s2 = t2.getImageData(0, 0, i2, n2), { data: r2 } = s2;
    for (let t3 = 0, e3 = r2.length; t3 < e3; t3 += 4) {
      const e4 = 0.2126 * r2[t3] + 0.7152 * r2[t3 + 1] + 0.0722 * r2[t3 + 2] + 0.5 | 0;
      r2[t3] = r2[t3 + 1] = r2[t3 + 2] = e4;
    }
    t2.putImageData(s2, 0, 0);
  }
  #_s(t2) {
    if (t2) {
      if (t2.knockoutMaskEntry) {
        this.canvasFactory.destroy(t2.knockoutMaskEntry);
        t2.knockoutMaskEntry = null;
      }
      if (t2.knockoutTempEntry) {
        this.canvasFactory.destroy(t2.knockoutTempEntry);
        t2.knockoutTempEntry = null;
      }
      if (t2.knockoutBackdropEntry) {
        this.canvasFactory.destroy(t2.knockoutBackdropEntry);
        t2.knockoutBackdropEntry = null;
      }
    }
  }
  beginAnnotation(t2, e2, i2, n2, s2, r2, a2) {
    this.#Ts();
    resetCtxToDefault(this.ctx);
    this.ctx.save();
    this.save(t2);
    this.baseTransform && this.ctx.setTransform(...this.baseTransform);
    if (i2) {
      const s3 = i2[2] - i2[0], o2 = i2[3] - i2[1];
      if (r2 && this.annotationCanvasMap) {
        (n2 = n2.slice())[4] -= i2[0];
        n2[5] -= i2[1];
        Util.singularValueDecompose2dScale(getCurrentTransform(this.ctx), Pt);
        const { viewportScale: t3 } = this, r3 = Math.ceil(s3 * this.outputScaleX * t3), l2 = Math.ceil(o2 * this.outputScaleY * t3);
        this.annotationCanvas = this.canvasFactory.create(r3, l2);
        const { canvas: h2, context: c2 } = this.annotationCanvas;
        if (a2) {
          const t4 = this.annotationCanvasMap.getOrInsertComputed(e2, makeArr);
          h2.setAttribute("data-canvas-name", a2);
          const i3 = t4.findIndex((t5) => t5.getAttribute("data-canvas-name") === a2);
          -1 === i3 ? t4.push(h2) : t4[i3] = h2;
        } else this.annotationCanvasMap.set(e2, h2);
        this.annotationCanvas.savedCtx = this.ctx;
        this.ctx = c2;
        this.ctx.save();
        this.ctx.setTransform(Pt[0], 0, 0, -Pt[1], 0, o2 * Pt[1]);
        resetCtxToDefault(this.ctx);
      } else {
        resetCtxToDefault(this.ctx);
        this.endPath(t2);
        const e3 = new Path2D();
        e3.rect(i2[0], i2[1], s3, o2);
        this.ctx.clip(e3);
      }
    }
    this.current = new CanvasExtraState(this.ctx.canvas.width, this.ctx.canvas.height);
    this.baseTransformStack.push(this.baseTransform);
    this.transform(t2, ...n2);
    this.transform(t2, ...s2);
    this.baseTransform = getCurrentTransform(this.ctx);
  }
  endAnnotation(t2) {
    if (this.annotationCanvas) {
      this.ctx.restore();
      this.#ks();
      this.ctx = this.annotationCanvas.savedCtx;
      delete this.annotationCanvas.savedCtx;
      delete this.annotationCanvas;
    }
    this.baseTransform = this.baseTransformStack.pop();
  }
  paintImageMaskXObject(t2, e2) {
    if (!this.contentVisible) return;
    const i2 = e2.count;
    (e2 = this.getObject(t2, e2.data, e2)).count = i2;
    const n2 = this.#Fs(this.current.fillAlpha), s2 = this.ctx, r2 = this._createMaskCanvas(t2, e2), a2 = r2.canvas;
    s2.save();
    s2.setTransform(1, 0, 0, 1, 0, 0);
    s2.drawImage(a2, r2.offsetX, r2.offsetY);
    this.dependencyTracker?.resetBBox(t2).recordBBox(t2, this.ctx, r2.offsetX, r2.offsetX + a2.width, r2.offsetY, r2.offsetY + a2.height).recordOperation(t2);
    s2.restore();
    r2.canvasEntry && this.canvasFactory.destroy(r2.canvasEntry);
    this.compose();
    this.#Bs(n2);
  }
  paintImageMaskXObjectRepeat(t2, e2, i2, n2 = 0, s2 = 0, r2, a2) {
    if (!this.contentVisible) return;
    e2 = this.getObject(t2, e2.data, e2);
    const o2 = this.#Fs(this.current.fillAlpha), l2 = this.ctx;
    l2.save();
    const h2 = getCurrentTransform(l2);
    l2.transform(i2, n2, s2, r2, 0, 0);
    const c2 = this._createMaskCanvas(t2, e2);
    l2.setTransform(1, 0, 0, 1, c2.offsetX - h2[4], c2.offsetY - h2[5]);
    this.dependencyTracker?.resetBBox(t2);
    for (let e3 = 0, o3 = a2.length; e3 < o3; e3 += 2) {
      const o4 = Util.transform(h2, [i2, n2, s2, r2, a2[e3], a2[e3 + 1]]);
      l2.drawImage(c2.canvas, o4[4], o4[5]);
      this.dependencyTracker?.recordBBox(t2, this.ctx, o4[4], o4[4] + c2.canvas.width, o4[5], o4[5] + c2.canvas.height);
    }
    l2.restore();
    c2.canvasEntry && this.canvasFactory.destroy(c2.canvasEntry);
    this.compose();
    this.dependencyTracker?.recordOperation(t2);
    this.#Bs(o2);
  }
  paintImageMaskXObjectGroup(t2, e2) {
    if (!this.contentVisible) return;
    const i2 = this.#Fs(this.current.fillAlpha), n2 = this.ctx, s2 = this.current.patternFill, r2 = s2 ? this.current.fillColor : n2.fillStyle;
    this.dependencyTracker?.resetBBox(t2).recordDependencies(t2, ct);
    for (const i3 of e2) {
      const { data: e3, width: a2, height: o2, transform: l2 } = i3, h2 = this.canvasFactory.create(a2, o2), c2 = h2.context;
      c2.save();
      putBinaryImageMask(c2, this.getObject(t2, e3, i3));
      c2.globalCompositeOperation = "source-in";
      c2.fillStyle = s2 ? r2.getPattern(c2, this, getCurrentTransformInverse(n2), Et, t2) : r2;
      c2.fillRect(0, 0, a2, o2);
      c2.restore();
      n2.save();
      n2.transform(...l2);
      n2.scale(1, -1);
      drawImageAtIntegerCoords(n2, h2.canvas, 0, 0, a2, o2, 0, -1, 1, 1);
      this.canvasFactory.destroy(h2);
      this.dependencyTracker?.recordBBox(t2, n2, 0, a2, 0, o2);
      n2.restore();
    }
    this.compose();
    this.dependencyTracker?.recordOperation(t2);
    this.#Bs(i2);
  }
  paintImageXObject(t2, e2) {
    if (!this.contentVisible) return;
    const i2 = this.getObject(t2, e2);
    i2 ? this.paintInlineImageXObject(t2, i2) : warn("Dependent image isn't ready yet");
  }
  paintImageXObjectRepeat(t2, e2, i2, n2, s2) {
    if (!this.contentVisible) return;
    const r2 = this.getObject(t2, e2);
    if (!r2) {
      warn("Dependent image isn't ready yet");
      return;
    }
    const a2 = r2.width, o2 = r2.height, l2 = [];
    for (let t3 = 0, e3 = s2.length; t3 < e3; t3 += 2) l2.push({ transform: [i2, 0, 0, n2, s2[t3], s2[t3 + 1]], x: 0, y: 0, w: a2, h: o2 });
    this.paintInlineImageXObjectGroup(t2, r2, l2);
  }
  applyTransferMapsToCanvas(t2) {
    if ("none" !== this.current.transferMaps) {
      t2.filter = this.current.transferMaps;
      t2.drawImage(t2.canvas, 0, 0);
      t2.filter = "none";
    } else this.current.transferMapsFallback?.applyToCanvas(t2);
    return t2.canvas;
  }
  applyTransferMapsToBitmap(t2) {
    const { transferMaps: e2, transferMapsFallback: i2 } = this.current;
    if ("none" === e2 && !i2) return { img: t2.bitmap, canvasEntry: null };
    const { bitmap: n2, width: s2, height: r2 } = t2, a2 = this.canvasFactory.create(s2, r2), o2 = a2.context;
    o2.filter = e2;
    o2.drawImage(n2, 0, 0);
    o2.filter = "none";
    i2?.applyToCanvas(o2);
    return { img: a2.canvas, canvasEntry: a2 };
  }
  paintInlineImageXObject(t2, e2) {
    if (!this.contentVisible) return;
    const i2 = e2.width, n2 = e2.height, s2 = this.#Fs(this.current.fillAlpha), r2 = this.ctx;
    this.save(t2);
    const { filter: a2 } = r2;
    "none" !== a2 && "" !== a2 && (r2.filter = "none");
    r2.scale(1 / i2, -1 / n2);
    let o2, l2 = null;
    if (e2.bitmap) {
      const t3 = this.applyTransferMapsToBitmap(e2);
      o2 = t3.img;
      l2 = t3.canvasEntry;
    } else {
      const t3 = this.canvasFactory.create(i2, n2);
      putBinaryImageData(t3.context, e2);
      o2 = this.applyTransferMapsToCanvas(t3.context);
      l2 = t3;
    }
    const h2 = this._scaleImage(o2, getCurrentTransformInverse(r2));
    r2.imageSmoothingEnabled = getImageSmoothingEnabled(getCurrentTransform(r2), e2.interpolate);
    if (this.dependencyTracker) {
      this.dependencyTracker.resetBBox(t2).recordBBox(t2, r2, 0, i2, -n2, 0).recordDependencies(t2, at).recordOperation(t2);
      this.imagesTracker?.record(r2, i2, n2, this.dependencyTracker.clipBox);
    }
    drawImageAtIntegerCoords(r2, h2.img, 0, 0, h2.paintWidth, h2.paintHeight, 0, -n2, i2, n2);
    h2.tmpCanvas && this.canvasFactory.destroy(h2.tmpCanvas);
    l2 && this.canvasFactory.destroy(l2);
    this.compose();
    this.restore(t2);
    this.#Bs(s2);
  }
  paintInlineImageXObjectGroup(t2, e2, i2) {
    if (!this.contentVisible) return;
    const n2 = this.#Fs(this.current.fillAlpha), s2 = this.ctx;
    let r2, a2 = null;
    if (e2.bitmap && !this.current.transferMapsFallback) r2 = e2.bitmap;
    else if (e2.bitmap) ({ img: r2, canvasEntry: a2 } = this.applyTransferMapsToBitmap(e2));
    else {
      const t3 = e2.width, i3 = e2.height, n3 = this.canvasFactory.create(t3, i3);
      putBinaryImageData(n3.context, e2);
      r2 = this.applyTransferMapsToCanvas(n3.context);
      a2 = n3;
    }
    this.dependencyTracker?.resetBBox(t2);
    for (const e3 of i2) {
      s2.save();
      s2.transform(...e3.transform);
      s2.scale(1, -1);
      drawImageAtIntegerCoords(s2, r2, e3.x, e3.y, e3.w, e3.h, 0, -1, 1, 1);
      this.dependencyTracker?.recordBBox(t2, s2, 0, 1, -1, 0);
      s2.restore();
    }
    a2 && this.canvasFactory.destroy(a2);
    this.dependencyTracker?.recordOperation(t2);
    this.compose();
    this.#Bs(n2);
  }
  paintSolidColorImageMask(t2) {
    if (!this.contentVisible) return;
    const e2 = this.#Fs(this.current.fillAlpha);
    this.dependencyTracker?.resetBBox(t2).recordBBox(t2, this.ctx, 0, 1, 0, 1).recordDependencies(t2, rt).recordOperation(t2);
    this.ctx.fillRect(0, 0, 1, 1);
    this.compose();
    this.#Bs(e2);
  }
  markPoint(t2, e2) {
  }
  markPointProps(t2, e2, i2) {
  }
  beginMarkedContent(t2, e2) {
    this.dependencyTracker?.beginMarkedContent(t2);
    this.markedContentStack.push({ visible: true });
  }
  beginMarkedContentProps(t2, e2, i2) {
    this.dependencyTracker?.beginMarkedContent(t2);
    "OC" === e2 ? this.markedContentStack.push({ visible: this.optionalContentConfig.isVisible(i2) }) : this.markedContentStack.push({ visible: true });
    this.contentVisible = this.isContentVisible();
  }
  endMarkedContent(t2) {
    this.dependencyTracker?.endMarkedContent(t2);
    this.markedContentStack.pop();
    this.contentVisible = this.isContentVisible();
  }
  beginCompat(t2) {
  }
  endCompat(t2) {
  }
  consumePath(t2, e2, i2) {
    const n2 = this.current.isEmptyClip();
    this.pendingClip && this.current.updateClipFromPath();
    this.pendingClip || this.compose(i2);
    const s2 = this.ctx;
    if (this.pendingClip) {
      n2 || (this.pendingClip === Bt ? s2.clip(e2, "evenodd") : s2.clip(e2));
      this.pendingClip = null;
      this.dependencyTracker?.bboxToClipBoxDropOperation(t2).recordFutureForcedDependency("clipPath", t2);
    } else this.dependencyTracker?.recordOperation(t2);
    this.current.startNewPathAndClipBox(this.current.clipBox);
  }
  getSinglePixelWidth() {
    const t2 = getCurrentTransform(this.ctx);
    if (0 === t2[1] && 0 === t2[2]) return 1 / Math.min(Math.abs(t2[0]), Math.abs(t2[3]));
    const e2 = Math.abs(t2[0] * t2[3] - t2[2] * t2[1]), i2 = Math.hypot(t2[0], t2[2]), n2 = Math.hypot(t2[1], t2[3]);
    return Math.max(i2, n2) / e2;
  }
  getScaleForStroking() {
    if (-1 === this._cachedScaleForStroking[0]) {
      const { lineWidth: t2 } = this.current, { a: e2, b: i2, c: n2, d: s2 } = this.ctx.getTransform();
      let r2, a2;
      if (0 === i2 && 0 === n2) {
        const i3 = Math.abs(e2), n3 = Math.abs(s2);
        if (i3 === n3) if (0 === t2) r2 = a2 = 1 / i3;
        else {
          const e3 = i3 * t2;
          r2 = a2 = e3 < 1 ? 1 / e3 : 1;
        }
        else if (0 === t2) {
          r2 = 1 / i3;
          a2 = 1 / n3;
        } else {
          const e3 = i3 * t2, s3 = n3 * t2;
          r2 = e3 < 1 ? 1 / e3 : 1;
          a2 = s3 < 1 ? 1 / s3 : 1;
        }
      } else {
        const o2 = Math.abs(e2 * s2 - i2 * n2), l2 = Math.hypot(e2, i2), h2 = Math.hypot(n2, s2);
        if (0 === t2) {
          r2 = h2 / o2;
          a2 = l2 / o2;
        } else {
          const e3 = t2 * o2;
          r2 = h2 > e3 ? h2 / e3 : 1;
          a2 = l2 > e3 ? l2 / e3 : 1;
        }
      }
      this._cachedScaleForStroking[0] = r2;
      this._cachedScaleForStroking[1] = a2;
    }
    return this._cachedScaleForStroking;
  }
  rescaleAndStroke(t2, e2) {
    const { ctx: i2, current: { lineWidth: n2 } } = this, [s2, r2] = this.getScaleForStroking();
    if (s2 === r2) {
      i2.lineWidth = (n2 || 1) * s2;
      i2.stroke(t2);
      return;
    }
    const a2 = CanvasGraphics.#ms ??= new DOMMatrix(), o2 = i2.getLineDash();
    e2 && i2.save();
    i2.scale(s2, r2);
    a2.a = 1 / s2;
    a2.d = 1 / r2;
    const l2 = new Path2D();
    l2.addPath(t2, a2);
    if (o2.length > 0) {
      const t3 = Math.max(s2, r2);
      i2.setLineDash(o2.map((e3) => e3 / t3));
      i2.lineDashOffset /= t3;
    }
    i2.lineWidth = n2 || 1;
    i2.stroke(l2);
    e2 && i2.restore();
  }
  isContentVisible() {
    for (let t2 = this.markedContentStack.length - 1; t2 >= 0; t2--) if (!this.markedContentStack[t2].visible) return false;
    return true;
  }
}
for (const t2 in F) void 0 !== CanvasGraphics.prototype[t2] && (CanvasGraphics.prototype[F[t2]] = CanvasGraphics.prototype[t2]);
class BasePDFStream {
  #Ls = null;
  #Ns = null;
  _fullReader = null;
  _rangeReaders = /* @__PURE__ */ new Set();
  _source = null;
  constructor(t2, e2, i2) {
    this._source = t2;
    this.#Ls = e2;
    this.#Ns = i2;
  }
  get _progressiveDataLength() {
    return this._fullReader?._loaded ?? 0;
  }
  getFullReader() {
    assert(!this._fullReader, "BasePDFStream.getFullReader can only be called once.");
    return this._fullReader = new this.#Ls(this);
  }
  getRangeReader(t2, e2) {
    if (e2 <= this._progressiveDataLength) return null;
    const i2 = new this.#Ns(this, t2, e2);
    this._rangeReaders.add(i2);
    return i2;
  }
  cancelAllRequests(t2) {
    this._fullReader?.cancel(t2);
    for (const e2 of new Set(this._rangeReaders)) e2.cancel(t2);
  }
}
class BasePDFStreamReader {
  onProgress = null;
  _contentLength = 0;
  _filename = null;
  _headersCapability = Promise.withResolvers();
  _isRangeSupported = false;
  _isStreamingSupported = false;
  _loaded = 0;
  _stream = null;
  constructor(t2) {
    this._stream = t2;
  }
  _callOnProgress() {
    this.onProgress?.({ loaded: this._loaded, total: this._contentLength });
  }
  get headersReady() {
    return this._headersCapability.promise;
  }
  get filename() {
    return this._filename;
  }
  get contentLength() {
    return this._contentLength;
  }
  get isRangeSupported() {
    return this._isRangeSupported;
  }
  get isStreamingSupported() {
    return this._isStreamingSupported;
  }
  async read() {
    unreachable("Abstract method `read` called");
  }
  cancel(t2) {
    unreachable("Abstract method `cancel` called");
  }
}
class BasePDFStreamRangeReader {
  _stream = null;
  constructor(t2, e2, i2) {
    this._stream = t2;
  }
  async read() {
    unreachable("Abstract method `read` called");
  }
  cancel(t2) {
    unreachable("Abstract method `cancel` called");
  }
}
function createHeaders(t2, e2) {
  const i2 = new Headers();
  if (!t2 || !e2 || "object" != typeof e2) return i2;
  for (const t3 in e2) {
    const n2 = e2[t3];
    void 0 !== n2 && i2.append(t3, n2);
  }
  return i2;
}
function getResponseOrigin(t2) {
  return URL.parse(t2)?.origin ?? null;
}
function validateRangeRequestCapabilities({ responseHeaders: t2, isHttp: e2, rangeChunkSize: i2, disableRange: n2 }) {
  const s2 = { contentLength: 0, isRangeSupported: false }, r2 = parseInt(t2.get("Content-Length"), 10);
  if (!Number.isInteger(r2)) return s2;
  s2.contentLength = r2;
  if (r2 <= 2 * i2) return s2;
  if (n2 || !e2 || "bytes" !== t2.get("Accept-Ranges")) return s2;
  "identity" === (t2.get("Content-Encoding") || "identity") && (s2.isRangeSupported = true);
  return s2;
}
function extractFilenameFromHeader(t2) {
  const e2 = t2.get("Content-Disposition");
  if (e2) {
    let t3 = (function getFilenameFromContentDispositionHeader(t4) {
      let e3 = true, i2 = toParamRegExp("filename\\*", "i").exec(t4);
      if (i2) {
        i2 = i2[1];
        let t5 = rfc2616unquote(i2);
        t5 = unescape(t5);
        t5 = rfc5987decode(t5);
        t5 = rfc2047decode(t5);
        return fixupEncoding(t5);
      }
      i2 = (function rfc2231getparam(t5) {
        const e4 = [];
        let i3;
        const n2 = toParamRegExp("filename\\*((?!0\\d)\\d+)(\\*?)", "ig");
        for (; null !== (i3 = n2.exec(t5)); ) {
          let [, t6, n3, s3] = i3;
          t6 = parseInt(t6, 10);
          if (t6 in e4) {
            if (0 === t6) break;
          } else e4[t6] = [n3, s3];
        }
        const s2 = [];
        for (let t6 = 0; t6 < e4.length && t6 in e4; ++t6) {
          let [i4, n3] = e4[t6];
          n3 = rfc2616unquote(n3);
          if (i4) {
            n3 = unescape(n3);
            0 === t6 && (n3 = rfc5987decode(n3));
          }
          s2.push(n3);
        }
        return s2.join("");
      })(t4);
      if (i2) return fixupEncoding(rfc2047decode(i2));
      i2 = toParamRegExp("filename", "i").exec(t4);
      if (i2) {
        i2 = i2[1];
        let t5 = rfc2616unquote(i2);
        t5 = rfc2047decode(t5);
        return fixupEncoding(t5);
      }
      function toParamRegExp(t5, e4) {
        return new RegExp("(?:^|;)\\s*" + t5 + '\\s*=\\s*([^";\\s][^;\\s]*|"(?:[^"\\\\]|\\\\"?)+"?)', e4);
      }
      function textdecode(t5, i3) {
        if (t5) {
          if (!/^[\x00-\xFF]+$/.test(i3)) return i3;
          try {
            const n2 = new TextDecoder(t5, { fatal: true }), s2 = stringToBytes(i3);
            i3 = n2.decode(s2);
            e3 = false;
          } catch {
          }
        }
        return i3;
      }
      function fixupEncoding(t5) {
        if (e3 && /[\x80-\xff]/.test(t5)) {
          t5 = textdecode("utf-8", t5);
          e3 && (t5 = textdecode("iso-8859-1", t5));
        }
        return t5;
      }
      function rfc2616unquote(t5) {
        if (t5.startsWith('"')) {
          const e4 = t5.slice(1).split('\\"');
          for (let t6 = 0; t6 < e4.length; ++t6) {
            const i3 = e4[t6].indexOf('"');
            if (-1 !== i3) {
              e4[t6] = e4[t6].slice(0, i3);
              e4.length = t6 + 1;
            }
            e4[t6] = e4[t6].replaceAll(/\\(.)/g, "$1");
          }
          t5 = e4.join('"');
        }
        return t5;
      }
      function rfc5987decode(t5) {
        const e4 = t5.indexOf("'");
        return -1 === e4 ? t5 : textdecode(t5.slice(0, e4), t5.slice(e4 + 1).replace(/^[^']*'/, ""));
      }
      function rfc2047decode(t5) {
        return !t5.startsWith("=?") || /[\x00-\x19\x80-\xff]/.test(t5) ? t5 : t5.replaceAll(/=\?([\w-]*)\?([QB])\?((?:[^?]|\?(?!=))*)\?=/gi, function(t6, e4, i3, n2) {
          if ("q" === i3 || "Q" === i3) return textdecode(e4, n2 = n2.replaceAll("_", " ").replaceAll(/=([0-9a-f]{2})/gi, (t7, e5) => String.fromCharCode(parseInt(e5, 16))));
          try {
            n2 = atob(n2);
          } catch {
          }
          return textdecode(e4, n2);
        });
      }
      return "";
    })(e2);
    if (t3.includes("%")) try {
      t3 = decodeURIComponent(t3);
    } catch {
    }
    if (isPdfFile(t3)) return t3;
  }
  return null;
}
function createResponseError(t2, e2) {
  return new ResponseException(`Unexpected server response (${t2}) while retrieving PDF "${e2.href}".`, t2, 404 === t2 || 0 === t2 && "file:" === e2.protocol);
}
function ensureResponseOrigin(t2, e2) {
  if (t2 !== e2) throw new Error(`Expected range response-origin "${t2}" to match "${e2}".`);
}
function fetchUrl(t2, e2, i2, n2) {
  return fetch(t2, { method: "GET", headers: e2, signal: n2.signal, mode: "cors", credentials: i2 ? "include" : "same-origin", redirect: "follow" });
}
function ensureResponseStatus(t2, e2) {
  if (200 !== t2 && 206 !== t2) throw createResponseError(t2, e2);
}
function getArrayBuffer(t2) {
  if (t2 instanceof Uint8Array) return t2.buffer;
  if (t2 instanceof ArrayBuffer) return t2;
  throw new Error(`getArrayBuffer - unexpected data: ${t2}`);
}
class PDFFetchStream extends BasePDFStream {
  _responseOrigin = null;
  constructor(t2) {
    super(t2, PDFFetchStreamReader, PDFFetchStreamRangeReader);
    const { httpHeaders: e2, url: i2 } = t2;
    assert(/https?:/.test(i2.protocol), "PDFFetchStream only supports http(s):// URLs.");
    this.headers = createHeaders(true, e2);
  }
}
class PDFFetchStreamReader extends BasePDFStreamReader {
  _abortController = new AbortController();
  _reader = null;
  constructor(t2) {
    super(t2);
    const { disableRange: e2, disableStream: i2, rangeChunkSize: n2, url: s2, withCredentials: r2 } = t2._source;
    this._isStreamingSupported = !i2;
    const a2 = new Headers(t2.headers);
    fetchUrl(s2, a2, r2, this._abortController).then((i3) => {
      t2._responseOrigin = getResponseOrigin(i3.url);
      ensureResponseStatus(i3.status, s2);
      this._reader = i3.body.getReader();
      const r3 = i3.headers, { contentLength: a3, isRangeSupported: o2 } = validateRangeRequestCapabilities({ responseHeaders: r3, isHttp: true, rangeChunkSize: n2, disableRange: e2 });
      this._contentLength = a3;
      this._isRangeSupported = o2;
      this._filename = extractFilenameFromHeader(r3);
      !this._isStreamingSupported && this._isRangeSupported && this.cancel(new AbortException("Streaming is disabled."));
      this._headersCapability.resolve();
    }).catch(this._headersCapability.reject);
  }
  async read() {
    await this._headersCapability.promise;
    const { value: t2, done: e2 } = await this._reader.read();
    if (e2) return { value: t2, done: e2 };
    this._loaded += t2.byteLength;
    this._callOnProgress();
    return { value: getArrayBuffer(t2), done: false };
  }
  cancel(t2) {
    this._reader?.cancel(t2);
    this._abortController.abort();
  }
}
class PDFFetchStreamRangeReader extends BasePDFStreamRangeReader {
  _abortController = new AbortController();
  _readCapability = Promise.withResolvers();
  _reader = null;
  constructor(t2, e2, i2) {
    super(t2, e2, i2);
    const { url: n2, withCredentials: s2 } = t2._source, r2 = new Headers(t2.headers);
    r2.append("Range", `bytes=${e2}-${i2 - 1}`);
    fetchUrl(n2, r2, s2, this._abortController).then((e3) => {
      ensureResponseOrigin(getResponseOrigin(e3.url), t2._responseOrigin);
      ensureResponseStatus(e3.status, n2);
      this._reader = e3.body.getReader();
      this._readCapability.resolve();
    }).catch(this._readCapability.reject);
  }
  async read() {
    await this._readCapability.promise;
    const { value: t2, done: e2 } = await this._reader.read();
    return e2 ? { value: t2, done: e2 } : { value: getArrayBuffer(t2), done: false };
  }
  cancel(t2) {
    this._reader?.cancel(t2);
    this._abortController.abort();
  }
}
function transport_stream_getArrayBuffer(t2) {
  return t2 instanceof Uint8Array && t2.byteLength === t2.buffer.byteLength ? t2.buffer : new Uint8Array(t2).buffer;
}
function endRequests() {
  for (const t2 of this._requests) t2.resolve({ value: void 0, done: true });
  this._requests.length = 0;
}
class PDFDataTransportStream extends BasePDFStream {
  _progressiveDone = false;
  _queuedChunks = [];
  constructor(t2) {
    super(t2, PDFDataTransportStreamReader, PDFDataTransportStreamRangeReader);
    const { pdfDataRangeTransport: e2 } = t2, { initialData: i2, progressiveDone: n2 } = e2;
    if (i2?.length > 0) {
      const t3 = transport_stream_getArrayBuffer(i2);
      this._queuedChunks.push(t3);
    }
    this._progressiveDone = n2;
    e2.transportReady((t3) => {
      switch (t3.type) {
        case "range":
        case "progressiveRead":
          this.#Us(t3.begin, t3.chunk);
          break;
        case "progressiveDone":
          this._fullReader?.progressiveDone();
          this._progressiveDone = true;
      }
    });
  }
  #Us(t2, e2) {
    const i2 = transport_stream_getArrayBuffer(e2);
    if (void 0 === t2) this._fullReader ? this._fullReader._enqueue(i2) : this._queuedChunks.push(i2);
    else {
      const e3 = this._rangeReaders.keys().find((e4) => e4._begin === t2);
      assert(e3, "#onReceiveData - no `PDFDataTransportStreamRangeReader` instance found.");
      e3._enqueue(i2);
    }
  }
  getFullReader() {
    const t2 = super.getFullReader();
    this._queuedChunks = null;
    return t2;
  }
  getRangeReader(t2, e2) {
    const i2 = super.getRangeReader(t2, e2);
    if (i2) {
      i2.onDone = () => this._rangeReaders.delete(i2);
      this._source.pdfDataRangeTransport.requestDataRange(t2, e2);
    }
    return i2;
  }
  cancelAllRequests(t2) {
    super.cancelAllRequests(t2);
    this._source.pdfDataRangeTransport.abort();
  }
}
class PDFDataTransportStreamReader extends BasePDFStreamReader {
  #Hs = endRequests.bind(this);
  _done = false;
  _queuedChunks = null;
  _requests = [];
  constructor(t2) {
    super(t2);
    const { pdfDataRangeTransport: e2, disableRange: i2, disableStream: n2 } = t2._source, { length: s2, contentDispositionFilename: r2 } = e2;
    this._queuedChunks = t2._queuedChunks || [];
    for (const t3 of this._queuedChunks) this._loaded += t3.byteLength;
    this._done = t2._progressiveDone;
    this._contentLength = s2;
    this._isStreamingSupported = !n2;
    this._isRangeSupported = !i2;
    isPdfFile(r2) && (this._filename = r2);
    this._headersCapability.resolve();
    const a2 = this._loaded;
    Promise.resolve().then(() => {
      a2 > 0 && this._loaded === a2 && this._callOnProgress();
    });
  }
  _enqueue(t2) {
    if (!this._done) {
      if (this._requests.length > 0) {
        this._requests.shift().resolve({ value: t2, done: false });
      } else this._queuedChunks.push(t2);
      this._loaded += t2.byteLength;
      this._callOnProgress();
    }
  }
  async read() {
    if (this._queuedChunks.length > 0) {
      return { value: this._queuedChunks.shift(), done: false };
    }
    if (this._done) return { value: void 0, done: true };
    const t2 = Promise.withResolvers();
    this._requests.push(t2);
    return t2.promise;
  }
  cancel(t2) {
    this._done = true;
    this.#Hs();
  }
  progressiveDone() {
    this._done ||= true;
    0 === this._queuedChunks.length && this.#Hs();
  }
}
class PDFDataTransportStreamRangeReader extends BasePDFStreamRangeReader {
  #Hs = endRequests.bind(this);
  onDone = null;
  _begin = -1;
  _done = false;
  _queuedChunk = null;
  _requests = [];
  constructor(t2, e2, i2) {
    super(t2, e2, i2);
    this._begin = e2;
  }
  _enqueue(t2) {
    if (!this._done) {
      if (0 === this._requests.length) this._queuedChunk = t2;
      else {
        this._requests.shift().resolve({ value: t2, done: false });
        this.#Hs();
      }
      this._done = true;
      this.onDone?.();
    }
  }
  async read() {
    if (this._queuedChunk) {
      const t3 = this._queuedChunk;
      this._queuedChunk = null;
      return { value: t3, done: false };
    }
    if (this._done) return { value: void 0, done: true };
    const t2 = Promise.withResolvers();
    this._requests.push(t2);
    return t2.promise;
  }
  cancel(t2) {
    this._done = true;
    this.#Hs();
    this.onDone?.();
  }
}
class PDFNetworkStream extends BasePDFStream {
  #zs = /* @__PURE__ */ new WeakMap();
  _responseOrigin = null;
  constructor(t2) {
    super(t2, PDFNetworkStreamReader, PDFNetworkStreamRangeReader);
    const { httpHeaders: e2, url: i2 } = t2;
    this.url = i2;
    this.isHttp = /https?:/.test(i2.protocol);
    this.headers = createHeaders(this.isHttp, e2);
  }
  _request(t2) {
    const e2 = new XMLHttpRequest(), i2 = { validateStatus: null, onHeadersReceived: t2.onHeadersReceived, onDone: t2.onDone, onError: t2.onError, onProgress: t2.onProgress };
    this.#zs.set(e2, i2);
    e2.open("GET", this.url);
    e2.withCredentials = this._source.withCredentials;
    for (const [t3, i3] of this.headers) e2.setRequestHeader(t3, i3);
    if (this.isHttp && "begin" in t2 && "end" in t2) {
      e2.setRequestHeader("Range", `bytes=${t2.begin}-${t2.end - 1}`);
      i2.validateStatus = (t3) => 206 === t3 || 200 === t3;
    } else i2.validateStatus = (t3) => 200 === t3;
    e2.responseType = "arraybuffer";
    assert(t2.onError, "Expected `onError` callback to be provided.");
    e2.onerror = () => t2.onError(e2.status);
    e2.onreadystatechange = this.#Gs.bind(this, e2);
    e2.onprogress = this.#Vs.bind(this, e2);
    e2.send(null);
    return e2;
  }
  #Vs(t2, e2) {
    const i2 = this.#zs.get(t2);
    i2?.onProgress?.(e2);
  }
  #Gs(t2, e2) {
    const i2 = this.#zs.get(t2);
    if (!i2) return;
    if (t2.readyState >= 2 && i2.onHeadersReceived) {
      i2.onHeadersReceived();
      delete i2.onHeadersReceived;
    }
    if (4 !== t2.readyState) return;
    if (!this.#zs.has(t2)) return;
    this.#zs.delete(t2);
    if (0 === t2.status && this.isHttp) {
      i2.onError(t2.status);
      return;
    }
    const n2 = t2.status || 200;
    if (!i2.validateStatus(n2)) {
      i2.onError(t2.status);
      return;
    }
    const s2 = (function network_getArrayBuffer(t3) {
      return "string" != typeof t3 ? t3 : stringToBytes(t3).buffer;
    })(t2.response);
    if (206 === n2) {
      const e3 = t2.getResponseHeader("Content-Range");
      if (/bytes \d+-\d+\/\d+/.test(e3)) i2.onDone(s2);
      else {
        warn('Missing or invalid "Content-Range" header.');
        i2.onError(0);
      }
    } else s2 ? i2.onDone(s2) : i2.onError(t2.status);
  }
  _abortRequest(t2) {
    if (this.#zs.has(t2)) {
      this.#zs.delete(t2);
      t2.abort();
    }
  }
  getRangeReader(t2, e2) {
    const i2 = super.getRangeReader(t2, e2);
    i2 && (i2.onClosed = () => this._rangeReaders.delete(i2));
    return i2;
  }
}
class PDFNetworkStreamReader extends BasePDFStreamReader {
  #Hs = endRequests.bind(this);
  _cachedChunks = [];
  _done = false;
  _requests = [];
  _storedError = null;
  constructor(t2) {
    super(t2);
    this._fullRequestXhr = t2._request({ onHeadersReceived: this.#Ws.bind(this), onDone: this.#$s.bind(this), onError: this.#js.bind(this), onProgress: this.#Vs.bind(this) });
  }
  #Ws() {
    const t2 = this._stream, { disableRange: e2, rangeChunkSize: i2 } = t2._source, n2 = this._fullRequestXhr;
    t2._responseOrigin = getResponseOrigin(n2.responseURL);
    const s2 = n2.getAllResponseHeaders(), r2 = new Headers(s2 ? (function trimHeadersEnd(t3) {
      let e3 = t3.length;
      for (; e3 > 0 && " " !== t3[e3 - 1] && /\s/.test(t3[e3 - 1]); ) e3--;
      return t3.slice(0, e3);
    })(s2.trimStart()).split(/[\r\n]+/).map((t3) => {
      const [e3, ...i3] = t3.split(": ");
      return [e3, i3.join(": ")];
    }) : []), { contentLength: a2, isRangeSupported: o2 } = validateRangeRequestCapabilities({ responseHeaders: r2, isHttp: t2.isHttp, rangeChunkSize: i2, disableRange: e2 });
    this._contentLength = a2;
    this._isRangeSupported = o2;
    this._filename = extractFilenameFromHeader(r2);
    this._isRangeSupported && t2._abortRequest(n2);
    this._headersCapability.resolve();
  }
  #$s(t2) {
    if (this._requests.length > 0) {
      this._requests.shift().resolve({ value: t2, done: false });
    } else this._cachedChunks.push(t2);
    this._done = true;
    0 === this._cachedChunks.length && this.#Hs();
  }
  #js(t2) {
    this._storedError = createResponseError(t2, this._stream.url);
    this._headersCapability.reject(this._storedError);
    for (const t3 of this._requests) t3.reject(this._storedError);
    this._requests.length = 0;
    this._cachedChunks.length = 0;
  }
  #Vs(t2) {
    this.onProgress?.({ loaded: t2.loaded, total: t2.lengthComputable ? t2.total : this._contentLength });
  }
  async read() {
    await this._headersCapability.promise;
    if (this._storedError) throw this._storedError;
    if (this._cachedChunks.length > 0) {
      return { value: this._cachedChunks.shift(), done: false };
    }
    if (this._done) return { value: void 0, done: true };
    const t2 = Promise.withResolvers();
    this._requests.push(t2);
    return t2.promise;
  }
  cancel(t2) {
    this._done = true;
    this._headersCapability.reject(t2);
    this.#Hs();
    this._stream._abortRequest(this._fullRequestXhr);
    this._fullRequestXhr = null;
  }
}
class PDFNetworkStreamRangeReader extends BasePDFStreamRangeReader {
  #Hs = endRequests.bind(this);
  onClosed = null;
  _done = false;
  _queuedChunk = null;
  _requests = [];
  _storedError = null;
  constructor(t2, e2, i2) {
    super(t2, e2, i2);
    this._requestXhr = t2._request({ begin: e2, end: i2, onHeadersReceived: this.#Ws.bind(this), onDone: this.#$s.bind(this), onError: this.#js.bind(this), onProgress: null });
  }
  #Ws() {
    const t2 = getResponseOrigin(this._requestXhr?.responseURL);
    try {
      ensureResponseOrigin(t2, this._stream._responseOrigin);
    } catch (t3) {
      this._storedError = t3;
      this.#js(0);
    }
  }
  #$s(t2) {
    if (this._requests.length > 0) {
      this._requests.shift().resolve({ value: t2, done: false });
    } else this._queuedChunk = t2;
    this._done = true;
    this.#Hs();
    this.onClosed?.();
  }
  #js(t2) {
    this._storedError ??= createResponseError(t2, this._stream.url);
    for (const t3 of this._requests) t3.reject(this._storedError);
    this._requests.length = 0;
    this._queuedChunk = null;
  }
  async read() {
    if (this._storedError) throw this._storedError;
    if (null !== this._queuedChunk) {
      const t3 = this._queuedChunk;
      this._queuedChunk = null;
      return { value: t3, done: false };
    }
    if (this._done) return { value: void 0, done: true };
    const t2 = Promise.withResolvers();
    this._requests.push(t2);
    return t2.promise;
  }
  cancel(t2) {
    this._done = true;
    this.#Hs();
    this._stream._abortRequest(this._requestXhr);
    this.onClosed?.();
  }
}
function getReadableStream(t2, e2 = null) {
  const i2 = process.getBuiltinModule("fs"), { Readable: n2 } = process.getBuiltinModule("stream"), s2 = i2.createReadStream(t2, e2);
  return n2.toWeb(s2);
}
class PDFNodeStream extends BasePDFStream {
  constructor(t2) {
    super(t2, PDFNodeStreamReader, PDFNodeStreamRangeReader);
    const { url: e2 } = t2;
    assert("file:" === e2.protocol, "PDFNodeStream only supports file:// URLs.");
  }
}
class PDFNodeStreamReader extends BasePDFStreamReader {
  _reader = null;
  constructor(t2) {
    super(t2);
    const { disableRange: e2, disableStream: i2, rangeChunkSize: n2, url: s2 } = t2._source;
    this._isStreamingSupported = !i2;
    process.getBuiltinModule("fs/promises").lstat(s2).then((t3) => {
      const i3 = getReadableStream(s2);
      this._reader = i3.getReader();
      const { size: r2 } = t3;
      this._contentLength = r2;
      this._isRangeSupported = !e2 && r2 > 2 * n2;
      !this._isStreamingSupported && this._isRangeSupported && this.cancel(new AbortException("Streaming is disabled."));
      this._headersCapability.resolve();
    }).catch((t3) => {
      "ENOENT" === t3.code && (t3 = createResponseError(0, s2));
      this._headersCapability.reject(t3);
    });
  }
  async read() {
    await this._headersCapability.promise;
    const { value: t2, done: e2 } = await this._reader.read();
    if (e2) return { value: t2, done: e2 };
    this._loaded += t2.byteLength;
    this._callOnProgress();
    return { value: getArrayBuffer(t2), done: false };
  }
  cancel(t2) {
    this._reader?.cancel(t2);
  }
}
class PDFNodeStreamRangeReader extends BasePDFStreamRangeReader {
  _readCapability = Promise.withResolvers();
  _reader = null;
  constructor(t2, e2, i2) {
    super(t2, e2, i2);
    const { url: n2 } = t2._source;
    try {
      const t3 = getReadableStream(n2, { start: e2, end: i2 - 1 });
      this._reader = t3.getReader();
      this._readCapability.resolve();
    } catch (t3) {
      this._readCapability.reject(t3);
    }
  }
  async read() {
    await this._readCapability.promise;
    const { value: t2, done: e2 } = await this._reader.read();
    return e2 ? { value: t2, done: e2 } : { value: getArrayBuffer(t2), done: false };
  }
  cancel(t2) {
    this._reader?.cancel(t2);
  }
}
class GlobalWorkerOptions {
  static #Xs = null;
  static #Ks = "";
  static get workerPort() {
    return this.#Xs;
  }
  static set workerPort(t2) {
    if (!("undefined" != typeof Worker && t2 instanceof Worker) && null !== t2) throw new Error("Invalid `workerPort` type.");
    this.#Xs = t2;
  }
  static get workerSrc() {
    return this.#Ks;
  }
  static set workerSrc(t2) {
    if ("string" != typeof t2) throw new Error("Invalid `workerSrc` type.");
    this.#Ks = t2;
  }
}
class Metadata {
  #Ys;
  #qs;
  constructor({ parsedData: t2, rawData: e2 }) {
    this.#Ys = t2;
    this.#qs = e2;
  }
  getRaw() {
    return this.#qs;
  }
  get(t2) {
    return this.#Ys.get(t2) ?? null;
  }
  [Symbol.iterator]() {
    return this.#Ys.entries();
  }
}
const Ot = /* @__PURE__ */ Symbol("INTERNAL");
class OptionalContentGroup {
  #Qs = false;
  #Js = false;
  #Zs = false;
  #tr = true;
  constructor(t2, { name: e2, intent: i2, usage: n2, rbGroups: s2 }) {
    this.#Qs = !!(t2 & a);
    this.#Js = !!(t2 & o);
    this.name = e2;
    this.intent = i2;
    this.usage = n2;
    this.rbGroups = s2;
  }
  get visible() {
    if (this.#Zs) return this.#tr;
    if (!this.#tr) return false;
    const { print: t2, view: e2 } = this.usage;
    return this.#Qs ? "OFF" !== e2?.viewState : !this.#Js || "OFF" !== t2?.printState;
  }
  _setVisible(t2, e2, i2 = false) {
    t2 !== Ot && unreachable("Internal method `_setVisible` called.");
    this.#Zs = i2;
    this.#tr = e2;
  }
  get serializable() {
    return { userSet: this.#Zs, visible: this.#tr };
  }
}
class OptionalContentConfig {
  #er = null;
  #ir = /* @__PURE__ */ new Map();
  #nr = null;
  #sr = null;
  #rr;
  creator = null;
  name = null;
  constructor(t2, e2 = a, i2 = null) {
    this.#rr = t2;
    this.renderingIntent = e2;
    if (null !== t2) {
      this.name = t2.name;
      this.creator = t2.creator;
      this.#sr = t2.order;
      for (const i3 of t2.groups) this.#ir.set(i3.id, new OptionalContentGroup(e2, i3));
      if (i2) {
        i2.size !== this.#ir.size && unreachable("Incorrect serialized groupState.");
        for (const [t3, e3] of i2) this.#ir.get(t3)._setVisible(Ot, e3.visible, e3.userSet);
      } else {
        if ("OFF" === t2.baseState) for (const t3 of this.#ir.values()) t3._setVisible(Ot, false);
        for (const e3 of t2.on) this.#ir.get(e3)._setVisible(Ot, true);
        for (const e3 of t2.off) this.#ir.get(e3)._setVisible(Ot, false);
      }
      this.#nr = this.getHash();
    }
  }
  #ar(t2) {
    const e2 = t2.length;
    if (e2 < 2) return true;
    const i2 = t2[0];
    for (let n2 = 1; n2 < e2; n2++) {
      const e3 = t2[n2];
      let s2;
      if (Array.isArray(e3)) s2 = this.#ar(e3);
      else {
        if (!this.#ir.has(e3)) {
          warn(`Optional content group not found: ${e3}`);
          return true;
        }
        s2 = this.#ir.get(e3).visible;
      }
      switch (i2) {
        case "And":
          if (!s2) return false;
          break;
        case "Or":
          if (s2) return true;
          break;
        case "Not":
          return !s2;
        default:
          return true;
      }
    }
    return "And" === i2;
  }
  isVisible(t2) {
    if (0 === this.#ir.size) return true;
    if (!t2) {
      info("Optional content group not defined.");
      return true;
    }
    if ("OCG" === t2.type) {
      if (!this.#ir.has(t2.id)) {
        warn(`Optional content group not found: ${t2.id}`);
        return true;
      }
      return this.#ir.get(t2.id).visible;
    }
    if ("OCMD" === t2.type) {
      if (t2.expression) return this.#ar(t2.expression);
      if (!t2.policy || "AnyOn" === t2.policy) {
        for (const e2 of t2.ids) {
          if (!this.#ir.has(e2)) {
            warn(`Optional content group not found: ${e2}`);
            return true;
          }
          if (this.#ir.get(e2).visible) return true;
        }
        return false;
      }
      if ("AllOn" === t2.policy) {
        for (const e2 of t2.ids) {
          if (!this.#ir.has(e2)) {
            warn(`Optional content group not found: ${e2}`);
            return true;
          }
          if (!this.#ir.get(e2).visible) return false;
        }
        return true;
      }
      if ("AnyOff" === t2.policy) {
        for (const e2 of t2.ids) {
          if (!this.#ir.has(e2)) {
            warn(`Optional content group not found: ${e2}`);
            return true;
          }
          if (!this.#ir.get(e2).visible) return true;
        }
        return false;
      }
      if ("AllOff" === t2.policy) {
        for (const e2 of t2.ids) {
          if (!this.#ir.has(e2)) {
            warn(`Optional content group not found: ${e2}`);
            return true;
          }
          if (this.#ir.get(e2).visible) return false;
        }
        return true;
      }
      warn(`Unknown optional content policy ${t2.policy}.`);
      return true;
    }
    warn(`Unknown group type ${t2.type}.`);
    return true;
  }
  setVisibility(t2, e2 = true, i2 = true) {
    const n2 = this.#ir.get(t2);
    if (n2) {
      if (i2 && e2 && n2.rbGroups.length) for (const e3 of n2.rbGroups) for (const i3 of e3) i3 !== t2 && this.#ir.get(i3)?._setVisible(Ot, false, true);
      n2._setVisible(Ot, !!e2, true);
      this.#er = null;
    } else warn(`Optional content group not found: ${t2}`);
  }
  setOCGState({ state: t2, preserveRB: e2 }) {
    let i2;
    for (const n2 of t2) {
      switch (n2) {
        case "ON":
        case "OFF":
        case "Toggle":
          i2 = n2;
          continue;
      }
      const t3 = this.#ir.get(n2);
      if (t3) switch (i2) {
        case "ON":
          this.setVisibility(n2, true, e2);
          break;
        case "OFF":
          this.setVisibility(n2, false, e2);
          break;
        case "Toggle":
          this.setVisibility(n2, !t3.visible, e2);
      }
    }
    this.#er = null;
  }
  get hasInitialVisibility() {
    return null === this.#nr || this.getHash() === this.#nr;
  }
  getOrder() {
    return this.#ir.size ? this.#sr ? this.#sr.slice() : [...this.#ir.keys()] : null;
  }
  getGroup(t2) {
    return this.#ir.get(t2) || null;
  }
  getHash() {
    if (null !== this.#er) return this.#er;
    const t2 = new MurmurHash3_64();
    for (const [e2, i2] of this.#ir) t2.update(`${e2}:${i2.visible}`);
    return this.#er = t2.hexdigest();
  }
  [Symbol.iterator]() {
    return this.#ir.entries();
  }
  get serializable() {
    const t2 = /* @__PURE__ */ new Map();
    for (const [e2, i2] of this.#ir) t2.set(e2, i2.serializable);
    return { data: this.#rr, renderingIntent: this.renderingIntent, groupState: t2 };
  }
  static fromSerializable({ data: t2, renderingIntent: e2, groupState: i2 }) {
    return new OptionalContentConfig(t2, e2, i2);
  }
}
class PagesMapper {
  #or = null;
  #lr = null;
  #hr = 0;
  #cr = null;
  #dr = null;
  get pagesNumber() {
    return this.#hr;
  }
  set pagesNumber(t2) {
    if (this.#hr !== t2) {
      this.#hr = t2;
      this.#or = null;
      this.#lr = null;
    }
  }
  #ur() {
    if (this.#or) return;
    const t2 = this.#hr, e2 = this.#or = new Uint32Array(t2);
    for (let i2 = 0; i2 < t2; i2++) e2[i2] = i2 + 1;
    this.#lr = new Int32Array(e2);
  }
  #pr() {
    const t2 = /* @__PURE__ */ new Map(), e2 = this.#or;
    for (let i2 = 0, n2 = this.#hr; i2 < n2; i2++) {
      const n3 = e2[i2], s2 = t2.get(n3);
      s2 ? s2.push(i2 + 1) : t2.set(n3, [i2 + 1]);
    }
    return t2;
  }
  movePages(t2, e2, i2) {
    this.#ur();
    const n2 = this.#or, s2 = e2.length, r2 = new Uint32Array(s2);
    let a2 = 0;
    for (let t3 = 0; t3 < s2; t3++) {
      const s3 = e2[t3] - 1;
      r2[t3] = n2[s3];
      s3 < i2 && a2++;
    }
    const o2 = this.#hr, l2 = o2 - s2, h2 = new Int32Array(o2), c2 = MathClamp(i2 - a2, 0, l2);
    for (let e3 = 0, i3 = 0; e3 < o2; e3++) if (!t2.has(e3 + 1)) {
      n2[i3] = n2[e3];
      h2[i3++] = e3 + 1;
    }
    n2.copyWithin(c2 + s2, c2, l2);
    n2.set(r2, c2);
    h2.copyWithin(c2 + s2, c2, l2);
    h2.set(e2, c2);
    this.#lr = h2;
    n2.every((t3, e3) => t3 === e3 + 1) && (this.#or = null);
  }
  deletePages(t2) {
    this.#ur();
    const e2 = this.#or, i2 = this.#pr();
    this.#dr = { pageNumberToId: e2.slice(), pagesNumber: this.#hr, prevPageNumbers: this.#lr.slice() };
    const n2 = this.#hr - t2.length;
    this.#hr = n2;
    const s2 = this.#or = new Uint32Array(n2);
    this.#lr = new Int32Array(n2);
    let r2 = 0, a2 = 0;
    for (const i3 of t2) {
      const t3 = i3 - 1;
      if (t3 !== r2) {
        s2.set(e2.subarray(r2, t3), a2);
        a2 += t3 - r2;
      }
      r2 = t3 + 1;
    }
    r2 < e2.length && s2.set(e2.subarray(r2), a2);
    this.#gr(i2, new Set(t2));
  }
  cancelDelete() {
    if (this.#dr) {
      this.#or = this.#dr.pageNumberToId;
      this.#hr = this.#dr.pagesNumber;
      this.#lr = this.#dr.prevPageNumbers;
      this.#dr = null;
    }
  }
  cleanSavedData() {
    this.#dr = null;
  }
  copyPages(t2) {
    this.#ur();
    this.#cr = { pageNumbers: t2, pageIds: t2.map((t3) => this.#or[t3 - 1]) };
  }
  cancelCopy() {
    this.#cr = null;
  }
  pastePages(t2) {
    this.#ur();
    const e2 = this.#or, i2 = this.#pr(), { pageNumbers: n2, pageIds: s2 } = this.#cr, r2 = this.#hr + n2.length;
    this.#hr = r2;
    const a2 = this.#or = new Uint32Array(r2);
    this.#lr = new Int32Array(r2);
    a2.set(e2.subarray(0, t2), 0);
    a2.set(s2, t2);
    a2.set(e2.subarray(t2), t2 + n2.length);
    this.#gr(i2, null, t2, n2);
    this.#cr = null;
  }
  #gr(t2, e2 = null, i2 = -1, n2 = null) {
    const s2 = this.#lr, r2 = this.#or, a2 = i2 + (n2?.length ?? 0), o2 = /* @__PURE__ */ new Map();
    for (let l2 = 0, h2 = this.#hr; l2 < h2; l2++) {
      if (l2 >= i2 && l2 < a2) {
        s2[l2] = -n2[l2 - i2];
        continue;
      }
      const h3 = r2[l2], c2 = t2.get(h3);
      let d2 = o2.get(h3) || 0;
      if (e2 && c2) for (; d2 < c2.length && e2.has(c2[d2]); ) d2++;
      s2[l2] = c2?.[d2];
      o2.set(h3, d2 + 1);
    }
  }
  hasBeenAltered() {
    return null !== this.#or;
  }
  #mr(t2 = null) {
    if (!this.#or) return null;
    const e2 = new Int32Array(this.#hr).fill(-1), i2 = /* @__PURE__ */ new Map();
    if (t2) for (const n2 of t2) {
      const t3 = this.getPageId(n2), s2 = i2.get(t3) ?? 0;
      i2.set(t3, s2 + 1);
      e2[n2 - 1] = s2;
    }
    else for (let t3 = 0, n2 = this.#hr; t3 < n2; t3++) {
      const n3 = this.#or[t3], s2 = i2.get(n3) ?? 0;
      i2.set(n3, s2 + 1);
      e2[t3] = s2;
    }
    return e2;
  }
  getPageMappingForSaving(t2 = null, e2 = this.#mr()) {
    t2 ??= this.#pr();
    let i2 = 0;
    for (const e3 of t2.values()) i2 = Math.max(i2, e3.length);
    const n2 = new Array(i2);
    for (let t3 = 0; t3 < i2; t3++) n2[t3] = { document: null, pageIndices: [], includePages: [] };
    for (const [e3, i3] of t2) for (let t3 = 0, s2 = i3.length; t3 < s2; t3++) n2[t3].includePages.push([e3 - 1, i3[t3] - 1]);
    for (const { includePages: t3, pageIndices: e3 } of n2) {
      t3.sort((t4, e4) => t4[0] - e4[0]);
      for (let i3 = 0, n3 = t3.length; i3 < n3; i3++) {
        e3.push(t3[i3][1]);
        t3[i3] = t3[i3][0];
      }
    }
    return { pageInfos: n2, copyLevels: e2 };
  }
  extractPages(t2) {
    t2 = Array.from(t2).sort((t3, e3) => t3 - e3);
    const e2 = /* @__PURE__ */ new Map();
    for (let i2 = 0, n2 = t2.length; i2 < n2; i2++) {
      const n3 = this.getPageId(t2[i2]);
      e2.getOrInsertComputed(n3, makeArr).push(i2 + 1);
    }
    return this.getPageMappingForSaving(e2, this.#mr(t2));
  }
  getPrevPageNumber(t2) {
    return this.#lr?.[t2 - 1] ?? 0;
  }
  getPageNumber(t2) {
    if (!this.#or) return t2;
    const e2 = this.#or;
    for (let i2 = 0, n2 = this.#hr; i2 < n2; i2++) if (e2[i2] === t2) return i2 + 1;
    return 0;
  }
  getPageId(t2) {
    return this.#or?.[t2 - 1] ?? t2;
  }
  getMapping() {
    return this.#or?.subarray(0, this.pagesNumber);
  }
}
const Rt = /* @__PURE__ */ Symbol("INITIAL_DATA"), dataObj = () => ({ ...Promise.withResolvers(), data: Rt });
class PDFObjects {
  #fr = /* @__PURE__ */ new Map();
  get(t2, e2 = null) {
    if (e2) {
      const i3 = this.#fr.getOrInsertComputed(t2, dataObj);
      i3.promise.then(() => e2(i3.data));
      return null;
    }
    const i2 = this.#fr.get(t2);
    if (!i2 || i2.data === Rt) throw new Error(`Requesting object that isn't resolved yet ${t2}.`);
    return i2.data;
  }
  has(t2) {
    const e2 = this.#fr.get(t2);
    return !!e2 && e2.data !== Rt;
  }
  delete(t2) {
    const e2 = this.#fr.get(t2);
    if (!e2 || e2.data === Rt) return false;
    this.#fr.delete(t2);
    return true;
  }
  resolve(t2, e2 = null) {
    const i2 = this.#fr.getOrInsertComputed(t2, dataObj);
    if (i2.data !== Rt) throw new Error(`Object already resolved ${t2}.`);
    i2.data = e2;
    i2.resolve();
  }
  clear() {
    for (const { data: t2 } of this.#fr.values()) t2?.bitmap?.close();
    this.#fr.clear();
  }
  *[Symbol.iterator]() {
    for (const [t2, { data: e2 }] of this.#fr) e2 !== Rt && (yield [t2, e2]);
  }
}
class TextLayer {
  #br = Promise.withResolvers();
  #Pt = null;
  #yr = false;
  #vr = !!globalThis.FontInspector?.enabled;
  #wr = null;
  #Ar = null;
  #xr = null;
  #Cr = 0;
  #Er = 0;
  #Sr = OutputScale.pixelRatio;
  #Tr = null;
  #_r = null;
  #kr = 0;
  #Dr = 0;
  #Pr = /* @__PURE__ */ Object.create(null);
  #Mr = [];
  #Ir = null;
  #Fr = [];
  #Br = /* @__PURE__ */ new WeakMap();
  #Or = null;
  static #Rr = /* @__PURE__ */ new Map();
  static #Lr = /* @__PURE__ */ new Map();
  static #Nr = /* @__PURE__ */ new WeakMap();
  static #Ur = null;
  static #Hr = /* @__PURE__ */ new Set();
  constructor({ textContentSource: t2, images: e2, container: i2, viewport: n2 }) {
    if (t2 instanceof ReadableStream) this.#Ir = t2;
    else {
      if ("object" != typeof t2) throw new Error('No "textContentSource" parameter specified.');
      this.#Ir = new ReadableStream({ start(e3) {
        e3.enqueue(t2);
        e3.close();
      } });
    }
    this.#Pt = this.#_r = i2;
    this.#wr = e2;
    this.#Dr = n2.scale * this.#Sr;
    this.#kr = n2.rotation;
    this.#xr = { div: null, properties: null, ctx: null };
    const { pageWidth: s2, pageHeight: r2, pageX: a2, pageY: o2 } = n2.rawDims;
    this.#Or = [1, 0, 0, -1, -a2, o2 + r2];
    this.#Er = s2;
    this.#Cr = r2;
    TextLayer.#zr();
    i2.style.setProperty("--min-font-size", TextLayer.#Ur);
    setLayerDimensions(i2, n2);
    this.#br.promise.finally(() => {
      TextLayer.#Hr.delete(this);
      this.#xr = null;
      this.#Pr = null;
    }).catch(() => {
    });
  }
  static get fontFamilyMap() {
    const { isWindows: t2, isFirefox: e2 } = FeatureTest.platform;
    return shadow(this, "fontFamilyMap", /* @__PURE__ */ new Map([["sans-serif", (t2 && e2 ? "Calibri, " : "") + "sans-serif"], ["monospace", (t2 && e2 ? "Lucida Console, " : "") + "monospace"]]));
  }
  render() {
    this.#wr && this.#Pt.append(this.#wr.render());
    const pump = () => {
      this.#Tr.read().then(({ value: t2, done: e2 }) => {
        if (e2) this.#br.resolve();
        else {
          this.#Ar ??= t2.lang;
          Object.assign(this.#Pr, t2.styles);
          this.#Gr(t2.items);
          pump();
        }
      }, this.#br.reject);
    };
    this.#Tr = this.#Ir.getReader();
    TextLayer.#Hr.add(this);
    pump();
    return this.#br.promise;
  }
  update({ viewport: t2, onBefore: e2 = null }) {
    const i2 = t2.scale * OutputScale.pixelRatio, n2 = t2.rotation;
    if (n2 !== this.#kr) {
      e2?.();
      this.#kr = n2;
      setLayerDimensions(this.#_r, { rotation: n2 });
    }
    if (i2 !== this.#Dr) {
      e2?.();
      this.#Dr = i2;
      this.#Sr = OutputScale.pixelRatio;
      const t3 = { div: null, properties: null, ctx: TextLayer.#Vr(this.#Ar) };
      for (const e3 of this.#Fr) {
        t3.properties = this.#Br.get(e3);
        t3.div = e3;
        this.#Wr(t3);
      }
    }
  }
  cancel() {
    const t2 = new AbortException("TextLayer task cancelled.");
    this.#Tr?.cancel(t2).catch(() => {
    });
    this.#Tr = null;
    this.#br.reject(t2);
  }
  get textDivs() {
    return this.#Fr;
  }
  get textContentItemsStr() {
    return this.#Mr;
  }
  #Gr(t2) {
    if (this.#yr) return;
    this.#xr.ctx ??= TextLayer.#Vr(this.#Ar);
    const e2 = this.#Fr, i2 = this.#Mr;
    for (const n2 of t2) {
      if (e2.length > 1e5) {
        warn("Ignoring additional textDivs for performance reasons.");
        this.#yr = true;
        return;
      }
      if (void 0 !== n2.str) {
        i2.push(n2.str);
        this.#$r(n2);
      } else if ("beginMarkedContentProps" === n2.type || "beginMarkedContent" === n2.type) {
        const t3 = this.#Pt;
        this.#Pt = document.createElement("span");
        this.#Pt.classList.add("markedContent");
        n2.id && this.#Pt.setAttribute("id", n2.id);
        "Artifact" === n2.tag && (this.#Pt.ariaHidden = true);
        t3.append(this.#Pt);
      } else "endMarkedContent" === n2.type && (this.#Pt = this.#Pt.parentNode);
    }
  }
  #$r(t2) {
    const e2 = document.createElement("span"), i2 = { angle: 0, canvasWidth: 0, hasText: "" !== t2.str, hasEOL: t2.hasEOL, fontSize: 0 };
    this.#Fr.push(e2);
    const n2 = Util.transform(this.#Or, t2.transform);
    let s2 = Math.atan2(n2[1], n2[0]);
    const r2 = this.#Pr[t2.fontName];
    r2.vertical && (s2 += Math.PI / 2);
    let a2 = this.#vr && r2.fontSubstitution || r2.fontFamily;
    a2 = TextLayer.fontFamilyMap.get(a2) || a2;
    const o2 = Math.hypot(n2[2], n2[3]), l2 = o2 * TextLayer.#jr(a2, r2, this.#Ar);
    let h2, c2;
    if (0 === s2) {
      h2 = n2[4];
      c2 = n2[5] - l2;
    } else {
      h2 = n2[4] + l2 * Math.sin(s2);
      c2 = n2[5] - l2 * Math.cos(s2);
    }
    const d2 = e2.style;
    d2.left = `${(100 * h2 / this.#Er).toFixed(2)}%`;
    d2.top = `${(100 * c2 / this.#Cr).toFixed(2)}%`;
    const u2 = Math.round(100 * o2) / 100;
    d2.setProperty("--font-height", `${u2}px`);
    d2.fontFamily = a2;
    i2.fontSize = u2;
    e2.setAttribute("role", "presentation");
    e2.textContent = t2.str;
    e2.dir = t2.dir;
    this.#vr && (e2.dataset.fontName = r2.fontSubstitutionLoadedName || t2.fontName);
    0 !== s2 && (i2.angle = s2 * (180 / Math.PI));
    let p2 = false;
    if (t2.str.length > 1) p2 = true;
    else if (" " !== t2.str && t2.transform[0] !== t2.transform[3]) {
      const e3 = Math.abs(t2.transform[0]), i3 = Math.abs(t2.transform[3]);
      e3 !== i3 && Math.max(e3, i3) / Math.min(e3, i3) > 1.5 && (p2 = true);
    }
    p2 && (i2.canvasWidth = r2.vertical ? t2.height : t2.width);
    this.#Br.set(e2, i2);
    this.#xr.div = e2;
    this.#xr.properties = i2;
    this.#Wr(this.#xr);
    i2.hasText && this.#Pt.append(e2);
    if (i2.hasEOL) {
      const t3 = document.createElement("br");
      t3.setAttribute("role", "presentation");
      this.#Pt.append(t3);
    }
  }
  #Wr(t2) {
    const { div: e2, properties: i2, ctx: n2 } = t2, { style: s2 } = e2, { canvasWidth: r2, fontSize: a2 } = i2;
    if (0 !== r2 && 0 !== a2 && i2.hasText) {
      const { fontFamily: t3 } = s2, i3 = this.#Sr, o2 = TextLayer.#Xr(a2 * this.#Dr / i3) * i3;
      TextLayer.#Kr(n2, o2, t3);
      const { width: l2 } = n2.measureText(e2.textContent);
      l2 > 0 && s2.setProperty("--scale-x", r2 * o2 / (l2 * a2));
    }
    0 !== i2.angle && s2.setProperty("--rotate", `${i2.angle}deg`);
  }
  static cleanup() {
    if (!(this.#Hr.size > 0)) {
      this.#Rr.clear();
      for (const { canvas: t2 } of this.#Lr.values()) t2.remove();
      this.#Lr.clear();
    }
  }
  static #Vr(t2 = null) {
    let e2 = this.#Lr.get(t2 ||= "");
    if (!e2) {
      const i2 = document.createElement("canvas");
      i2.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;display:none;letter-spacing:normal;word-spacing:normal";
      i2.lang = t2;
      document.body.append(i2);
      e2 = i2.getContext("2d", { alpha: false, willReadFrequently: true });
      this.#Lr.set(t2, e2);
      this.#Nr.set(e2, { size: 0, family: "" });
    }
    return e2;
  }
  static #Xr(t2) {
    t2 = Math.fround(t2);
    const e2 = Math.fround(131073 * t2);
    return Math.fround(e2 - Math.fround(e2 - t2));
  }
  static #Kr(t2, e2, i2) {
    const n2 = this.#Nr.get(t2);
    if (e2 !== n2.size || i2 !== n2.family) {
      t2.font = `${e2}px ${i2}`;
      n2.size = e2;
      n2.family = i2;
    }
  }
  static #zr() {
    if (null !== this.#Ur) return;
    const t2 = document.createElement("div");
    t2.style.opacity = 0;
    t2.style.lineHeight = 1;
    t2.style.fontSize = "1px";
    t2.style.position = "absolute";
    t2.textContent = "X";
    document.body.append(t2);
    this.#Ur = t2.getBoundingClientRect().height;
    t2.remove();
  }
  static #jr(t2, e2, i2) {
    const n2 = this.#Rr.get(t2);
    if (n2) return n2;
    const s2 = this.#Vr(i2);
    this.#Kr(s2, 30, t2);
    const r2 = s2.measureText(""), a2 = r2.fontBoundingBoxAscent, o2 = Math.abs(r2.fontBoundingBoxDescent);
    let l2 = 0.8;
    if (a2) l2 = a2 / (a2 + o2);
    else {
      FeatureTest.platform.isFirefox && warn("Enable the `dom.textMetrics.fontBoundingBox.enabled` preference in `about:config` to improve TextLayer rendering.");
      e2.ascent ? l2 = e2.ascent : e2.descent && (l2 = 1 + e2.descent);
    }
    this.#Rr.set(t2, l2);
    return l2;
  }
}
function getDocument(e2 = {}) {
  const i2 = new PDFDocumentLoadingTask(), { docId: n2 } = i2, s2 = e2.url ? (function getUrlProp(e3) {
    if (e3 instanceof URL) return e3;
    if ("string" == typeof e3) {
      if (t) {
        if (/^[a-z][a-z0-9\-+.]+:/i.test(e3)) return new URL(e3);
        const t2 = process.getBuiltinModule("url");
        return new URL(t2.pathToFileURL(e3));
      }
      const i3 = URL.parse(e3, window.location);
      if (i3) return i3;
    }
    throw new Error("Invalid PDF url data: either string or URL-object is expected in the url property.");
  })(e2.url) : null, r2 = e2.data ? (function getDataProp(e3) {
    if (t && "undefined" != typeof Buffer && e3 instanceof Buffer) throw new Error("Please provide binary data as `Uint8Array`, rather than `Buffer`.");
    if (e3 instanceof Uint8Array && e3.byteLength === e3.buffer.byteLength) return e3;
    if ("string" == typeof e3) return stringToBytes(e3);
    if (e3 instanceof ArrayBuffer || ArrayBuffer.isView(e3) || "object" == typeof e3 && !isNaN(e3?.length)) return new Uint8Array(e3);
    throw new Error("Invalid PDF binary data: either TypedArray, string, or array-like object is expected in the data property.");
  })(e2.data) : null, a2 = e2.httpHeaders || null, o2 = true === e2.withCredentials, l2 = e2.password ?? null, h2 = e2.range instanceof PDFDataRangeTransport ? e2.range : null, c2 = Number.isInteger(e2.rangeChunkSize) && e2.rangeChunkSize > 0 ? e2.rangeChunkSize : 65536;
  let d2 = e2.worker instanceof PDFWorker ? e2.worker : null;
  const u2 = e2.verbosity, p2 = "string" != typeof e2.docBaseUrl || isDataScheme(e2.docBaseUrl) ? null : e2.docBaseUrl, g2 = getFactoryUrlProp(e2.cMapUrl), m2 = false !== e2.cMapPacked, f2 = getFactoryUrlProp(e2.iccUrl), b2 = getFactoryUrlProp(e2.standardFontDataUrl), y2 = getFactoryUrlProp(e2.wasmUrl), v2 = true !== e2.stopAtErrors, w2 = Number.isInteger(e2.maxImageSize) && e2.maxImageSize > -1 ? e2.maxImageSize : -1, A2 = "boolean" == typeof e2.isOffscreenCanvasSupported ? e2.isOffscreenCanvasSupported : !t, x2 = "boolean" == typeof e2.isImageDecoderSupported ? e2.isImageDecoderSupported : !t, C2 = Number.isInteger(e2.canvasMaxAreaInBytes) ? e2.canvasMaxAreaInBytes : -1, E2 = "boolean" == typeof e2.disableFontFace ? e2.disableFontFace : t, S2 = true === e2.fontExtraProperties, T2 = true === e2.enableXfa, _2 = e2.ownerDocument || globalThis.document, k2 = true === e2.disableRange, D2 = true === e2.disableStream, P2 = true === e2.disableAutoFetch, M2 = true === e2.pdfBug, I2 = e2.CanvasFactory || (t ? NodeCanvasFactory : DOMCanvasFactory), F2 = e2.FilterFactory || (t ? NodeFilterFactory : DOMFilterFactory), B2 = e2.BinaryDataFactory || (t ? NodeBinaryDataFactory : DOMBinaryDataFactory), O2 = true === e2.enableHWA, R2 = true === e2.enableWebGPU ? (function initGPU() {
    return Ct.init();
  })() : Promise.resolve(false), L2 = false !== e2.useWasm, N2 = e2.pagesMapper || new PagesMapper(), U2 = "boolean" == typeof e2.useSystemFonts ? e2.useSystemFonts : !t && !E2, H2 = "boolean" == typeof e2.useWorkerFetch ? e2.useWorkerFetch : !!(B2 === DOMBinaryDataFactory && g2 && m2 && b2 && y2 && isValidFetchUrl(g2, document.baseURI) && isValidFetchUrl(b2, document.baseURI) && isValidFetchUrl(y2, document.baseURI));
  setVerbosityLevel(u2);
  const z2 = { canvasFactory: new I2({ ownerDocument: _2, enableHWA: O2 }), filterFactory: new F2({ docId: n2, ownerDocument: _2 }), binaryDataFactory: H2 ? null : new B2({ cMapUrl: g2, standardFontDataUrl: b2, wasmUrl: y2 }) };
  if (!d2) {
    d2 = PDFWorker.create({ verbosity: u2, port: GlobalWorkerOptions.workerPort });
    i2._worker = d2;
  }
  const G2 = { docId: n2, apiVersion: "6.4.299", data: r2, password: l2, disableAutoFetch: P2, rangeChunkSize: c2, docBaseUrl: p2, enableXfa: T2, evaluatorOptions: { maxImageSize: w2, disableFontFace: E2, ignoreErrors: v2, isOffscreenCanvasSupported: A2, isImageDecoderSupported: x2, canvasMaxAreaInBytes: C2, fontExtraProperties: S2, useSystemFonts: U2, useWasm: L2, useWorkerFetch: H2, cMapUrl: g2, cMapPacked: m2, iccUrl: f2, standardFontDataUrl: b2, wasmUrl: y2, hasGPU: false } }, V2 = { ownerDocument: _2, pdfBug: M2, styleElement: null, enableHWA: O2, loadingParams: { disableAutoFetch: P2, enableXfa: T2 } };
  Promise.all([d2.promise, R2]).then(function([, e3]) {
    if (d2.destroyed) throw new Error("Worker was destroyed");
    G2.evaluatorOptions.hasGPU = e3;
    const l3 = d2.messageHandler.sendWithPromise("GetDocRequest", G2, r2 ? [r2.buffer] : null);
    let u3;
    if (r2) ;
    else if (h2) u3 = new PDFDataTransportStream({ pdfDataRangeTransport: h2, disableRange: k2, disableStream: D2 });
    else {
      if (!s2) throw new Error("getDocument - expected either `data`, `range`, or `url` parameter.");
      {
        const e4 = (function getNetworkStream(e5) {
          return isValidFetchUrl(e5) ? PDFFetchStream : t ? PDFNodeStream : PDFNetworkStream;
        })(s2);
        u3 = new e4({ url: s2, httpHeaders: a2, withCredentials: o2, rangeChunkSize: c2, disableRange: k2, disableStream: D2 });
      }
    }
    return l3.then((t2) => {
      if (d2.destroyed) throw new Error("Worker was destroyed");
      const e4 = new MessageHandler(n2, t2, d2.port), s3 = new WorkerTransport(e4, i2, u3, V2, z2, N2);
      i2._transport = s3;
      if (i2.destroyed) throw new Error("Loading aborted");
      e4.send("Ready", null);
    });
  }).catch(i2._capability.reject).finally(i2._setupCapability.resolve);
  return i2;
}
class PDFDocumentLoadingTask {
  static #jn = 0;
  _capability = Promise.withResolvers();
  _setupCapability = Promise.withResolvers();
  _transport = null;
  _worker = null;
  docId = "d" + PDFDocumentLoadingTask.#jn++;
  destroyed = false;
  onPassword = null;
  onProgress = null;
  get promise() {
    return this._capability.promise;
  }
  async destroy() {
    this.destroyed = true;
    this._capability.promise.catch(() => {
    });
    try {
      this._worker?.port && (this._worker._pendingDestroy = true);
      await this._setupCapability.promise;
      await this._transport?.destroy();
    } catch (t2) {
      this._worker?.port && delete this._worker._pendingDestroy;
      throw t2;
    }
    this._transport = null;
    this._worker?.destroy();
    this._worker = null;
  }
  async getData() {
    return this._transport.getData();
  }
}
class PDFDataRangeTransport {
  #br = Promise.withResolvers();
  #Yr = null;
  constructor(t2, e2, i2 = false, n2 = null) {
    this.length = t2;
    this.initialData = e2;
    this.progressiveDone = i2;
    this.contentDispositionFilename = n2;
  }
  onDataRange(t2, e2) {
    this.#Yr({ type: "range", begin: t2, chunk: e2 });
  }
  onDataProgressiveRead(t2) {
    this.#br.promise.then(() => {
      this.#Yr({ type: "progressiveRead", chunk: t2 });
    });
  }
  onDataProgressiveDone() {
    this.#br.promise.then(() => {
      this.#Yr({ type: "progressiveDone" });
    });
  }
  transportReady(t2) {
    this.#Yr = t2;
    this.#br.resolve();
  }
  requestDataRange(t2, e2) {
    unreachable("Abstract method PDFDataRangeTransport.requestDataRange");
  }
  abort() {
  }
}
class PDFDocumentProxy {
  constructor(t2, e2) {
    this._pdfInfo = t2;
    this._transport = e2;
  }
  get pagesMapper() {
    return this._transport.pagesMapper;
  }
  get annotationStorage() {
    return this._transport.annotationStorage;
  }
  get canvasFactory() {
    return this._transport.canvasFactory;
  }
  get filterFactory() {
    return this._transport.filterFactory;
  }
  get numPages() {
    return this._pdfInfo.numPages;
  }
  get fingerprints() {
    return this._pdfInfo.fingerprints;
  }
  get isPureXfa() {
    return shadow(this, "isPureXfa", !!this._transport._htmlForXfa);
  }
  get allXfaHtml() {
    return this._transport._htmlForXfa;
  }
  getPage(t2) {
    return this._transport.getPage(t2);
  }
  getPageIndex(t2) {
    return this._transport.getPageIndex(t2);
  }
  getDestinations() {
    return this._transport.getDestinations();
  }
  getDestination(t2) {
    return this._transport.getDestination(t2);
  }
  getPageLabels() {
    return this._transport.getPageLabels();
  }
  getPageLayout() {
    return this._transport.getPageLayout();
  }
  getPageMode() {
    return this._transport.getPageMode();
  }
  getViewerPreferences() {
    return this._transport.getViewerPreferences();
  }
  getOpenAction() {
    return this._transport.getOpenAction();
  }
  getAttachments() {
    return this._transport.getAttachments();
  }
  getAttachmentContent(t2) {
    return this._transport.getAttachmentContent(t2);
  }
  getAnnotationsByType(t2, e2) {
    return this._transport.getAnnotationsByType(t2, e2);
  }
  getJSActions() {
    return this._transport.getDocJSActions();
  }
  getOutline() {
    return this._transport.getOutline();
  }
  getOptionalContentConfig({ intent: t2 = "display" } = {}) {
    const { renderingIntent: e2 } = this._transport.getRenderingIntent(t2);
    return this._transport.getOptionalContentConfig(e2);
  }
  getPermissions() {
    return this._transport.getPermissions();
  }
  getMetadata() {
    return this._transport.getMetadata();
  }
  getMarkInfo() {
    return this._transport.getMarkInfo();
  }
  getData() {
    return this._transport.getData();
  }
  saveDocument(t2) {
    return this._transport.saveDocument(t2);
  }
  extractPages(t2, e2 = null) {
    return this._transport.extractPages(t2, e2);
  }
  getDownloadInfo() {
    return this._transport.downloadInfoCapability.promise;
  }
  cleanup(t2 = false) {
    return this._transport.startCleanup(t2 || this.isPureXfa);
  }
  cachedPageNumber(t2) {
    return this._transport.cachedPageNumber(t2);
  }
  get loadingParams() {
    return this._transport.loadingParams;
  }
  get loadingTask() {
    return this._transport.loadingTask;
  }
  getFieldObjects() {
    return this._transport.getFieldObjects();
  }
  getSignatures() {
    return this._transport.getSignatures();
  }
  getSignatureData(t2) {
    return this._transport.getSignatureData(t2);
  }
  hasJSActions() {
    return this._transport.hasJSActions();
  }
  getCalculationOrderIds() {
    return this._transport.getCalculationOrderIds();
  }
}
class PDFPageProxy {
  #qr = false;
  #Qr = null;
  static #Jr = 0;
  constructor(t2, e2, i2, n2, s2 = false) {
    this._pageIndex = t2;
    this._id = PDFPageProxy.#Jr++;
    this._pageInfo = e2;
    this._transport = i2;
    this._stats = s2 ? new StatTimer() : null;
    this._pdfBug = s2;
    this.commonObjs = i2.commonObjs;
    this.objs = new PDFObjects();
    this._intentStates = /* @__PURE__ */ new Map();
    this.destroyed = false;
    this.recordedBBoxes = null;
    this.#Qr = n2;
    this.imageCoordinates = null;
  }
  clone(t2) {
    const e2 = new PDFPageProxy(t2, this._pageInfo, this._transport, this.#Qr, this._pdfBug);
    e2.clonedFromIndex = this.clonedFromIndex ?? this._pageIndex;
    this._transport.updatePage(e2);
    return e2;
  }
  get pageNumber() {
    return this._pageIndex + 1;
  }
  set pageNumber(t2) {
    this._pageIndex = t2 - 1;
    this._transport.updatePage(this);
  }
  get rotate() {
    return this._pageInfo.rotate;
  }
  get ref() {
    return this._pageInfo.ref;
  }
  get userUnit() {
    return this._pageInfo.userUnit;
  }
  get view() {
    return this._pageInfo.view;
  }
  getViewport({ scale: t2, rotation: e2 = this.rotate, offsetX: i2 = 0, offsetY: n2 = 0, dontFlip: s2 = false } = {}) {
    return new PageViewport({ viewBox: this.view, userUnit: this.userUnit, scale: t2, rotation: e2, offsetX: i2, offsetY: n2, dontFlip: s2 });
  }
  getAnnotations({ intent: t2 = "display" } = {}) {
    const { renderingIntent: e2 } = this._transport.getRenderingIntent(t2);
    return this._transport.getAnnotations(this._pageIndex, e2);
  }
  getJSActions() {
    return this._transport.getPageJSActions(this._pageIndex);
  }
  get filterFactory() {
    return this._transport.filterFactory;
  }
  get isPureXfa() {
    return shadow(this, "isPureXfa", !!this._transport._htmlForXfa);
  }
  async getXfa() {
    return this._transport._htmlForXfa?.children[this._pageIndex] || null;
  }
  render({ canvasContext: t2, canvas: e2 = t2.canvas, viewport: i2, intent: n2 = "display", annotationMode: s2 = p.ENABLE, transform: r2 = null, background: a2 = null, optionalContentConfigPromise: l2 = null, annotationCanvasMap: h2 = null, pageColors: c2 = null, printAnnotationStorage: d2 = null, isEditing: u2 = false, recordImages: g2 = false, recordOperations: m2 = false, operationsFilter: f2 = null }) {
    this._stats?.time("Overall");
    const b2 = this._transport.getRenderingIntent(n2, s2, d2, u2), { renderingIntent: y2, cacheKey: v2 } = b2;
    this.#qr = false;
    l2 ||= this._transport.getOptionalContentConfig(y2);
    const w2 = this._intentStates.getOrInsertComputed(v2, makeObj);
    if (w2.streamReaderCancelTimeout) {
      clearTimeout(w2.streamReaderCancelTimeout);
      w2.streamReaderCancelTimeout = null;
    }
    const A2 = !!(y2 & o);
    if (!w2.displayReadyCapability) {
      w2.displayReadyCapability = Promise.withResolvers();
      w2.operatorList = { fnArray: [], argsArray: [], lastChunk: false, separateAnnots: null };
      this._stats?.time("Page Request");
      this._pumpOperatorList(b2);
    }
    const x2 = !(!this._pdfBug || !globalThis.StepperManager?.enabled), C2 = !!e2 && !this.recordedBBoxes && (m2 || x2), E2 = !!e2 && !this.imageCoordinates && g2, complete = (t3) => {
      w2.renderTasks.delete(_2);
      if (C2) {
        const t4 = _2.gfx?.dependencyTracker.take();
        if (t4) {
          _2.stepper?.setOperatorBBoxes(t4, _2.gfx.dependencyTracker.takeDebugMetadata());
          m2 && (this.recordedBBoxes = t4);
        }
      }
      E2 && !t3 && (this.imageCoordinates = _2.gfx?.imagesTracker.take());
      A2 && (this.#qr = true);
      this.#Zr();
      if (t3) {
        _2.capability.reject(t3);
        this._abortOperatorList({ intentState: w2, reason: t3 instanceof Error ? t3 : new Error(t3) });
      } else _2.capability.resolve();
      if (this._stats) {
        this._stats.timeEnd("Rendering");
        this._stats.timeEnd("Overall");
        globalThis.Stats?.enabled && globalThis.Stats.add(this.pageNumber, this._stats);
      }
    };
    let S2 = null, T2 = null;
    (C2 || E2) && (T2 = new CanvasBBoxTracker(e2, w2.operatorList.length));
    C2 && (S2 = new CanvasDependencyTracker(T2, x2));
    const _2 = new InternalRenderTask({ callback: complete, params: { canvas: e2, canvasContext: t2, dependencyTracker: S2 ?? T2, imagesTracker: E2 ? new CanvasImagesTracker(e2) : null, viewport: i2, transform: r2, background: a2 }, objs: this.objs, commonObjs: this.commonObjs, annotationCanvasMap: h2, operatorList: w2.operatorList, pageIndex: this._pageIndex, canvasFactory: this._transport.canvasFactory, filterFactory: this._transport.filterFactory, useRequestAnimationFrame: !A2, pdfBug: this._pdfBug, pageColors: c2, enableHWA: this._transport.enableHWA, operationsFilter: f2 });
    (w2.renderTasks ||= /* @__PURE__ */ new Set()).add(_2);
    const k2 = _2.task;
    Promise.all([w2.displayReadyCapability.promise, l2]).then(([t3, e3]) => {
      if (this.destroyed) complete();
      else {
        this._stats?.time("Rendering");
        if (!(e3.renderingIntent & y2)) throw new Error("Must use the same `intent`-argument when calling the `PDFPageProxy.render` and `PDFDocumentProxy.getOptionalContentConfig` methods.");
        _2.initializeGraphics({ transparency: t3, optionalContentConfig: e3 });
        _2.operatorListChanged();
      }
    }).catch(complete);
    return k2;
  }
  getOperatorList({ intent: t2 = "display", annotationMode: e2 = p.ENABLE, printAnnotationStorage: i2 = null, isEditing: n2 = false } = {}) {
    const s2 = this._transport.getRenderingIntent(t2, e2, i2, n2, true), r2 = this._intentStates.getOrInsertComputed(s2.cacheKey, makeObj);
    let a2;
    if (!r2.opListReadCapability) {
      a2 = /* @__PURE__ */ Object.create(null);
      a2.operatorListChanged = function operatorListChanged() {
        if (r2.operatorList.lastChunk) {
          r2.opListReadCapability.resolve(r2.operatorList);
          r2.renderTasks.delete(a2);
        }
      };
      r2.opListReadCapability = Promise.withResolvers();
      (r2.renderTasks ||= /* @__PURE__ */ new Set()).add(a2);
      r2.operatorList = { fnArray: [], argsArray: [], lastChunk: false, separateAnnots: null };
      this._stats?.time("Page Request");
      this._pumpOperatorList(s2);
    }
    return r2.opListReadCapability.promise;
  }
  streamTextContent({ includeMarkedContent: t2 = false, disableNormalization: e2 = false } = {}) {
    return this._transport.messageHandler.sendWithStream("GetTextContent", { pageId: this.#Qr.getPageId(this._pageIndex + 1) - 1, pageIndex: this._pageIndex, includeMarkedContent: true === t2, disableNormalization: true === e2 }, { highWaterMark: 100, size: (t3) => t3.items.length });
  }
  async getTextContent(t2 = {}) {
    if (this._transport._htmlForXfa) return this.getXfa().then((t3) => XfaText.textContent(t3));
    const e2 = this.streamTextContent(t2), i2 = { items: [], styles: /* @__PURE__ */ Object.create(null), lang: null };
    for await (const t3 of e2) {
      i2.lang ??= t3.lang;
      Object.assign(i2.styles, t3.styles);
      i2.items.push(...t3.items);
    }
    return i2;
  }
  getStructTree() {
    return this._transport.getStructTree(this._pageIndex);
  }
  _destroy() {
    this.destroyed = true;
    const t2 = [];
    for (const e2 of this._intentStates.values()) {
      this._abortOperatorList({ intentState: e2, reason: new Error("Page was destroyed."), force: true });
      if (!e2.opListReadCapability) for (const i2 of e2.renderTasks) {
        t2.push(i2.completed);
        i2.cancel();
      }
    }
    this.objs.clear();
    this.#qr = false;
    return Promise.all(t2);
  }
  cleanup(t2 = false) {
    this.#qr = true;
    const e2 = this.#Zr();
    t2 && e2 && (this._stats &&= new StatTimer());
    return e2;
  }
  #Zr() {
    if (!this.#qr || this.destroyed) return false;
    for (const { renderTasks: t2, operatorList: e2 } of this._intentStates.values()) if (t2.size > 0 || !e2.lastChunk) return false;
    this._intentStates.clear();
    this.objs.clear();
    this.#qr = false;
    return true;
  }
  _startRenderPage(t2, e2) {
    const i2 = this._intentStates.get(e2);
    if (i2) {
      this._stats?.timeEnd("Page Request");
      i2.displayReadyCapability?.resolve(t2);
    }
  }
  _renderPageChunk(t2, e2) {
    for (let i2 = 0, n2 = t2.length; i2 < n2; i2++) {
      e2.operatorList.fnArray.push(t2.fnArray[i2]);
      e2.operatorList.argsArray.push(t2.argsArray[i2]);
    }
    e2.operatorList.lastChunk = t2.lastChunk;
    e2.operatorList.separateAnnots = t2.separateAnnots;
    for (const t3 of e2.renderTasks) t3.operatorListChanged();
    t2.lastChunk && this.#Zr();
  }
  _pumpOperatorList({ renderingIntent: t2, cacheKey: e2, annotationStorageSerializable: i2, modifiedIds: n2 }) {
    const { map: s2, transfer: r2 } = i2, a2 = this._transport.messageHandler.sendWithStream("GetOperatorList", { pageId: this.#Qr.getPageId(this._pageIndex + 1) - 1, pageIndex: this._pageIndex, pageProxyId: this._id, intent: t2, cacheKey: e2, annotationStorage: s2, modifiedIds: n2 }, void 0, r2).getReader(), o2 = this._intentStates.get(e2);
    o2.streamReader = a2;
    const pump = () => {
      a2.read().then(({ value: t3, done: e3 }) => {
        if (e3) o2.streamReader = null;
        else if (!this._transport.destroyed) {
          this._renderPageChunk(t3, o2);
          pump();
        }
      }, (t3) => {
        o2.streamReader = null;
        if (!this._transport.destroyed) {
          if (o2.operatorList) {
            o2.operatorList.lastChunk = true;
            for (const t4 of o2.renderTasks) t4.operatorListChanged();
            this.#Zr();
          }
          if (o2.displayReadyCapability) o2.displayReadyCapability.reject(t3);
          else {
            if (!o2.opListReadCapability) throw t3;
            o2.opListReadCapability.reject(t3);
          }
        }
      });
    };
    pump();
  }
  _abortOperatorList({ intentState: t2, reason: e2, force: i2 = false }) {
    if (t2.streamReader) {
      if (t2.streamReaderCancelTimeout) {
        clearTimeout(t2.streamReaderCancelTimeout);
        t2.streamReaderCancelTimeout = null;
      }
      if (!i2) {
        if (t2.renderTasks.size > 0) return;
        if (e2 instanceof RenderingCancelledException) {
          let i3 = 100;
          e2.extraDelay > 0 && e2.extraDelay < 1e3 && (i3 += e2.extraDelay);
          t2.streamReaderCancelTimeout = setTimeout(() => {
            t2.streamReaderCancelTimeout = null;
            this._abortOperatorList({ intentState: t2, reason: e2, force: true });
          }, i3);
          return;
        }
      }
      t2.streamReader.cancel(new AbortException(e2.message)).catch(() => {
      });
      t2.streamReader = null;
      if (!this._transport.destroyed) {
        for (const [e3, i3] of this._intentStates) if (i3 === t2) {
          this._intentStates.delete(e3);
          break;
        }
        this.cleanup();
      }
    }
  }
  get stats() {
    return this._stats;
  }
}
class PDFWorker {
  #br = Promise.withResolvers();
  #ta = null;
  #Xs = null;
  #ea = null;
  static #ia = 0;
  static #na = false;
  static #sa = /* @__PURE__ */ new WeakMap();
  static {
    if (t) {
      this.#na = true;
      GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs";
    }
    this._isSameOrigin = (t2, e2) => {
      const i2 = URL.parse(t2);
      if (!i2?.origin || "null" === i2.origin) return false;
      const n2 = new URL(e2, i2);
      return i2.origin === n2.origin;
    };
    this._createCDNWrapper = (t2) => {
      const e2 = `await import("${t2}");`;
      return URL.createObjectURL(new Blob([e2], { type: "text/javascript" }));
    };
  }
  constructor({ name: t2 = null, port: e2 = null, verbosity: i2 = getVerbosityLevel() } = {}) {
    this.name = t2;
    this.destroyed = false;
    this.verbosity = i2;
    if (e2) {
      if (PDFWorker.#sa.has(e2)) throw new Error("Cannot use more than one PDFWorker per port.");
      PDFWorker.#sa.set(e2, this);
      this.#ra(e2);
    } else this.#aa();
  }
  get promise() {
    return this.#br.promise;
  }
  #oa() {
    this.#br.resolve();
    this.#ta.send("configure", { verbosity: this.verbosity });
  }
  get port() {
    return this.#Xs;
  }
  get messageHandler() {
    return this.#ta;
  }
  #ra(t2) {
    this.#Xs = t2;
    this.#ta = new MessageHandler("main", "worker", t2);
    this.#ta.on("ready", () => {
    });
    this.#oa();
  }
  #aa() {
    if (PDFWorker.#na || PDFWorker.#la) {
      this.#ha();
      return;
    }
    let { workerSrc: t2 } = PDFWorker;
    try {
      PDFWorker._isSameOrigin(window.location, t2) || (t2 = PDFWorker._createCDNWrapper(new URL(t2, window.location).href));
      const e2 = new Worker(t2, { type: "module" }), i2 = new MessageHandler("main", "worker", e2), terminateEarly = () => {
        n2.abort();
        i2.destroy();
        e2.terminate();
        this.destroyed ? this.#br.reject(new Error("Worker was destroyed")) : this.#ha();
      }, n2 = new AbortController();
      e2.addEventListener("error", () => {
        this.#ea || terminateEarly();
      }, { signal: n2.signal });
      i2.on("ready", (t3) => {
        n2.abort();
        if (!this.destroyed && t3 instanceof Uint8Array) {
          this.#ta = i2;
          this.#Xs = e2;
          this.#ea = e2;
          this.#oa();
        } else terminateEarly();
      });
    } catch {
      info("The worker has been disabled.");
      this.#ha();
    }
  }
  #ha() {
    if (!PDFWorker.#na) {
      warn("Setting up fake worker.");
      PDFWorker.#na = true;
    }
    PDFWorker._setupFakeWorkerGlobal.then((t2) => {
      if (this.destroyed) {
        this.#br.reject(new Error("Worker was destroyed"));
        return;
      }
      const e2 = new LoopbackPort();
      this.#Xs = e2;
      const i2 = "fake" + PDFWorker.#ia++, n2 = new MessageHandler(i2 + "_worker", i2, e2);
      t2.setup(n2, e2);
      this.#ta = new MessageHandler(i2, i2 + "_worker", e2);
      this.#oa();
    }).catch((t2) => {
      this.#br.reject(new Error(`Setting up fake worker failed: "${t2.message}".`));
    });
  }
  destroy() {
    this.destroyed = true;
    this.#ea?.terminate();
    this.#ea = null;
    PDFWorker.#sa.delete(this.#Xs);
    this.#Xs = null;
    this.#ta?.destroy();
    this.#ta = null;
  }
  static create(t2) {
    const e2 = this.#sa.get(t2?.port);
    if (e2) {
      if (e2._pendingDestroy) throw new Error("PDFWorker.create - the worker is being destroyed.\nPlease remember to await `PDFDocumentLoadingTask.destroy()`-calls.");
      return e2;
    }
    return new PDFWorker(t2);
  }
  static get workerSrc() {
    if (GlobalWorkerOptions.workerSrc) return GlobalWorkerOptions.workerSrc;
    throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
  }
  static get #la() {
    try {
      return globalThis.pdfjsWorker?.WorkerMessageHandler || null;
    } catch {
      return null;
    }
  }
  static get _setupFakeWorkerGlobal() {
    return shadow(this, "_setupFakeWorkerGlobal", (async () => {
      if (this.#la) return this.#la;
      return (await import(this.workerSrc)).WorkerMessageHandler;
    })());
  }
}
class WorkerTransport {
  downloadInfoCapability = Promise.withResolvers();
  #ca = null;
  #da = /* @__PURE__ */ new Map();
  #ua = null;
  #pa = /* @__PURE__ */ new Map();
  #ga = /* @__PURE__ */ new Map();
  #ma = /* @__PURE__ */ new Map();
  #fa = null;
  #ba = null;
  constructor(t2, e2, i2, n2, s2, r2) {
    this.messageHandler = t2;
    this.loadingTask = e2;
    this.#ua = i2;
    this.commonObjs = new PDFObjects();
    this.fontLoader = new FontLoader({ ownerDocument: n2.ownerDocument, styleElement: n2.styleElement });
    this.enableHWA = n2.enableHWA;
    this.loadingParams = n2.loadingParams;
    this._params = n2;
    this.canvasFactory = s2.canvasFactory;
    this.filterFactory = s2.filterFactory;
    this.binaryDataFactory = s2.binaryDataFactory;
    this.pagesMapper = r2;
    this.destroyed = false;
    this.destroyCapability = null;
    this.setupMessageHandler();
  }
  updatePage(t2) {
    this.#pa.set(t2._id, t2);
    this.#ga.set(t2._pageIndex, Promise.resolve(t2));
  }
  #ya(t2, e2 = null) {
    return this.#da.getOrInsertComputed(t2, () => this.messageHandler.sendWithPromise(t2, e2));
  }
  #Vs({ loaded: t2, total: e2 }) {
    this.loadingTask.onProgress?.({ loaded: t2, total: e2, percent: e2 ? MathClamp(Math.round(t2 / e2 * 100), 0, 100) : NaN });
  }
  get annotationStorage() {
    return shadow(this, "annotationStorage", new AnnotationStorage());
  }
  getRenderingIntent(t2, e2 = p.ENABLE, i2 = null, n2 = false, s2 = false) {
    let g2 = a, m2 = Z;
    switch (t2) {
      case "any":
        g2 = r;
        break;
      case "display":
        break;
      case "print":
        g2 = o;
        break;
      default:
        warn(`getRenderingIntent - invalid intent: ${t2}`);
    }
    const f2 = g2 & o && i2 instanceof PrintAnnotationStorage ? i2 : this.annotationStorage;
    switch (e2) {
      case p.DISABLE:
        g2 += c;
        break;
      case p.ENABLE:
        break;
      case p.ENABLE_FORMS:
        g2 += l;
        break;
      case p.ENABLE_STORAGE:
        g2 += h;
        m2 = f2.serializable;
        break;
      default:
        warn(`getRenderingIntent - invalid annotationMode: ${e2}`);
    }
    n2 && (g2 += d);
    s2 && (g2 += u);
    const { ids: b2, hash: y2 } = f2.modifiedIds;
    return { renderingIntent: g2, cacheKey: [g2, m2.hash, y2].join("_"), annotationStorageSerializable: m2, modifiedIds: b2 };
  }
  destroy() {
    if (this.destroyCapability) return this.destroyCapability.promise;
    this.destroyed = true;
    this.destroyCapability = Promise.withResolvers();
    this.#fa?.reject(new Error("Worker was destroyed during onPassword callback"));
    const t2 = [];
    for (const e3 of this.#pa.values()) t2.push(e3._destroy());
    this.#pa.clear();
    this.#ga.clear();
    this.#ma.clear();
    Object.hasOwn(this, "annotationStorage") && this.annotationStorage.resetModified();
    const e2 = this.messageHandler.sendWithPromise("Terminate", null);
    t2.push(e2);
    Promise.all(t2).then(() => {
      this.commonObjs.clear();
      this.fontLoader.clear();
      this.#da.clear();
      this.filterFactory.destroy();
      TextLayer.cleanup();
      this.#ua?.cancelAllRequests(new AbortException("Worker was terminated."));
      this.messageHandler?.destroy();
      this.messageHandler = null;
      this.destroyCapability.resolve();
    }, this.destroyCapability.reject);
    return this.destroyCapability.promise;
  }
  setupMessageHandler() {
    const { messageHandler: t2, loadingTask: e2 } = this;
    t2.on("GetReader", (t3, e3) => {
      assert(this.#ua, "GetReader - no `BasePDFStream` instance available.");
      this.#ca = this.#ua.getFullReader();
      this.#ca.onProgress = (t4) => this.#Vs(t4);
      e3.onPull = () => {
        this.#ca.read().then(function({ value: t4, done: i2 }) {
          if (i2) e3.close();
          else {
            assert(t4 instanceof ArrayBuffer, "GetReader - expected an ArrayBuffer.");
            e3.enqueue(new Uint8Array(t4), 1, [t4]);
          }
        }).catch((t4) => {
          e3.error(t4);
        });
      };
      e3.onCancel = (t4) => {
        this.#ca.cancel(t4);
        e3.ready.catch((t5) => {
          if (!this.destroyed) throw t5;
        });
      };
    });
    t2.on("ReaderHeadersReady", async (t3) => {
      await this.#ca.headersReady;
      const { isStreamingSupported: e3, isRangeSupported: i2, contentLength: n2 } = this.#ca;
      e3 && i2 && (this.#ca.onProgress = null);
      return { isStreamingSupported: e3, isRangeSupported: i2, contentLength: n2 };
    });
    t2.on("GetRangeReader", (t3, e3) => {
      assert(this.#ua, "GetRangeReader - no `BasePDFStream` instance available.");
      const i2 = this.#ua.getRangeReader(t3.begin, t3.end);
      if (i2) {
        e3.onPull = () => {
          i2.read().then(function({ value: t4, done: i3 }) {
            if (i3) e3.close();
            else {
              assert(t4 instanceof ArrayBuffer, "GetRangeReader - expected an ArrayBuffer.");
              e3.enqueue(new Uint8Array(t4), 1, [t4]);
            }
          }).catch((t4) => {
            e3.error(t4);
          });
        };
        e3.onCancel = (t4) => {
          i2.cancel(t4);
          e3.ready.catch((t5) => {
            if (!this.destroyed) throw t5;
          });
        };
      } else e3.close();
    });
    t2.on("GetDoc", ({ pdfInfo: t3 }) => {
      this.pagesMapper.pagesNumber = t3.numPages;
      this._numPages = t3.numPages;
      this._htmlForXfa = t3.htmlForXfa;
      delete t3.htmlForXfa;
      e2._capability.resolve(new PDFDocumentProxy(t3, this));
    });
    t2.on("DocException", (t3) => {
      e2._capability.reject(wrapReason(t3));
    });
    t2.on("PasswordRequest", (t3) => {
      this.#fa = Promise.withResolvers();
      try {
        if (!e2.onPassword) throw wrapReason(t3);
        const updatePassword = (t4) => {
          t4 instanceof Error ? this.#fa.reject(t4) : this.#fa.resolve({ password: t4 });
        };
        e2.onPassword(updatePassword, t3.code);
      } catch (t4) {
        this.#fa.reject(t4);
      }
      return this.#fa.promise;
    });
    t2.on("DataLoaded", (t3) => {
      this.#Vs({ loaded: t3.length, total: t3.length });
      this.downloadInfoCapability.resolve(t3);
    });
    t2.on("StartRenderPage", (t3) => {
      if (this.destroyed) return;
      this.#pa.get(t3.pageProxyId)._startRenderPage(t3.transparency, t3.cacheKey);
    });
    t2.on("commonobj", ([e3, i2, n2]) => {
      if (this.destroyed) return null;
      if (this.commonObjs.has(e3)) return null;
      switch (i2) {
        case "Font":
          if ("error" in n2) {
            const t3 = n2.error;
            warn(`Error during font loading: ${t3}`);
            this.commonObjs.resolve(e3, t3);
            break;
          }
          const s2 = new FontInfo(n2.buffer), r2 = this._params.pdfBug && globalThis.FontInspector?.enabled ? (t3, e4) => globalThis.FontInspector.fontAdded(t3, e4) : null, a2 = new FontFaceObject(s2, r2, n2.charProcOperatorList, n2.extra);
          this.fontLoader.bind(a2).catch(() => t2.sendWithPromise("FontFallback", { id: e3 })).finally(() => {
            a2.fontExtraProperties || a2.clearData();
            this.commonObjs.resolve(e3, a2);
          });
          break;
        case "CopyLocalImage":
          const { imageRef: o2 } = n2;
          assert(o2, "The imageRef must be defined.");
          for (const t3 of this.#pa.values()) for (const [, i3] of t3.objs) {
            if (i3?.ref !== o2) continue;
            if (!i3.dataLen) return null;
            const t4 = structuredClone(i3);
            this.commonObjs.resolve(e3, t4);
            return i3.dataLen;
          }
          break;
        case "FontPath":
          this.commonObjs.resolve(e3, new FontPathInfo(n2));
          break;
        case "Image":
          this.commonObjs.resolve(e3, n2);
          break;
        case "Pattern":
          const l2 = new PatternInfo(n2);
          this.commonObjs.resolve(e3, l2.getIR());
          break;
        default:
          throw new Error(`Got unknown common object type ${i2}`);
      }
      return null;
    });
    t2.on("obj", ([t3, e3, i2, n2]) => {
      if (this.destroyed) return;
      const s2 = this.#pa.get(e3);
      if (!s2.objs.has(t3)) if (0 !== s2._intentStates.size) switch (i2) {
        case "Image":
        case "Pattern":
          s2.objs.resolve(t3, n2);
          break;
        default:
          throw new Error(`Got unknown object type ${i2}`);
      }
      else n2?.bitmap?.close();
    });
    t2.on("DocProgress", (t3) => {
      this.destroyed || this.#Vs(t3);
    });
    t2.on("FetchBinaryData", async (t3) => {
      if (this.destroyed) throw new Error("Worker was destroyed.");
      if (!this.binaryDataFactory) throw new Error("`BinaryDataFactory` not initialized, see the `useWorkerFetch` parameter.");
      return this.binaryDataFactory.fetch(t3);
    });
  }
  getData() {
    return this.messageHandler.sendWithPromise("GetData", null);
  }
  saveDocument(t2 = null) {
    this.annotationStorage.size <= 0 && warn("saveDocument called while `annotationStorage` is empty, please use the getData-method instead.");
    const { map: e2, transfer: i2 } = this.annotationStorage.serializable;
    return this.messageHandler.sendWithPromise("SaveDocument", { isPureXfa: !!this._htmlForXfa, numPages: this._numPages, annotationStorage: e2, supportsPrintToPDF: null !== this.#ba, filename: this.#ca?.filename ?? null }, i2).finally(() => {
      this.#ba = null;
      this.annotationStorage.resetModified();
    });
  }
  extractPages(t2, e2 = null) {
    const i2 = { pageInfos: t2 };
    let n2;
    const s2 = globalThis.ImageBitmap;
    if ("function" == typeof s2) {
      const e3 = Array.isArray(t2) ? t2 : [t2];
      for (const t3 of e3) t3?.image instanceof s2 && (n2 ||= []).push(t3.image);
    }
    if (this.annotationStorage.size > 0) {
      const t3 = this.annotationStorage.serializable;
      let { map: s3 } = t3;
      t3.transfer?.length && (n2 ? n2.push(...t3.transfer) : n2 = t3.transfer);
      const r2 = this.pagesMapper.getMapping();
      if (r2) {
        const t4 = /* @__PURE__ */ new Map();
        for (const [i3, n3] of s3) {
          if (void 0 !== n3?.pageIndex && n3.pageIndex >= 0 && n3.pageIndex < r2.length) {
            const s4 = e2?.[n3.pageIndex] ?? 0, a2 = r2[n3.pageIndex] - 1;
            if (a2 !== n3.pageIndex || 0 !== s4) {
              t4.set(i3, { ...n3, pageIndex: a2, copyLevel: s4 });
              continue;
            }
          }
          t4.set(i3, n3);
        }
        s3 = t4;
      }
      i2.annotationStorage = s3;
    }
    return this.messageHandler.sendWithPromise("ExtractPages", i2, n2).finally(() => {
      this.annotationStorage.resetModified();
    });
  }
  getPage(t2) {
    if (!Number.isInteger(t2) || t2 <= 0 || t2 > this.pagesMapper.pagesNumber) return Promise.reject(new Error("Invalid page request."));
    const e2 = t2 - 1, i2 = this.pagesMapper.getPageId(t2) - 1, n2 = this.#ga.get(e2);
    if (n2) return n2;
    const s2 = this.messageHandler.sendWithPromise("GetPage", { pageIndex: i2 }).then((t3) => {
      if (this.destroyed) throw new Error("Transport destroyed");
      t3.refStr && this.#ma.set(t3.refStr, i2);
      const n3 = new PDFPageProxy(e2, t3, this, this.pagesMapper, this._params.pdfBug);
      this.#pa.set(n3._id, n3);
      return n3;
    });
    this.#ga.set(e2, s2);
    return s2;
  }
  async getPageIndex(t2) {
    if (!isRefProxy(t2)) throw new Error("Invalid pageIndex request.");
    const e2 = await this.messageHandler.sendWithPromise("GetPageIndex", { num: t2.num, gen: t2.gen }), i2 = this.pagesMapper.getPageNumber(e2 + 1);
    if (0 === i2) throw new Error("GetPageIndex: page has been removed.");
    return i2 - 1;
  }
  getAnnotations(t2, e2) {
    return this.messageHandler.sendWithPromise("GetAnnotations", { pageIndex: this.pagesMapper.getPageId(t2 + 1) - 1, intent: e2 });
  }
  getFieldObjects() {
    return this.#ya("GetFieldObjects");
  }
  getSignatures() {
    return this.#ya("GetSignatures");
  }
  getSignatureData(t2) {
    return this.messageHandler.sendWithPromise("GetSignatureData", t2);
  }
  hasJSActions() {
    return this.#ya("HasJSActions");
  }
  getCalculationOrderIds() {
    return this.messageHandler.sendWithPromise("GetCalculationOrderIds", null);
  }
  getDestinations() {
    return this.messageHandler.sendWithPromise("GetDestinations", null);
  }
  getDestination(t2) {
    return "string" != typeof t2 ? Promise.reject(new Error("Invalid destination request.")) : this.messageHandler.sendWithPromise("GetDestination", { id: t2 });
  }
  getPageLabels() {
    return this.messageHandler.sendWithPromise("GetPageLabels", null);
  }
  getPageLayout() {
    return this.messageHandler.sendWithPromise("GetPageLayout", null);
  }
  getPageMode() {
    return this.messageHandler.sendWithPromise("GetPageMode", null);
  }
  getViewerPreferences() {
    return this.messageHandler.sendWithPromise("GetViewerPreferences", null);
  }
  getOpenAction() {
    return this.messageHandler.sendWithPromise("GetOpenAction", null);
  }
  getAttachments() {
    return this.messageHandler.sendWithPromise("GetAttachments", null);
  }
  getAttachmentContent(t2) {
    return this.messageHandler.sendWithPromise("GetAttachmentContent", t2);
  }
  getAnnotationsByType(t2, e2) {
    return this.messageHandler.sendWithPromise("GetAnnotationsByType", { types: t2, pageIndexesToSkip: e2 });
  }
  getDocJSActions() {
    return this.#ya("GetDocJSActions");
  }
  getPageJSActions(t2) {
    return this.messageHandler.sendWithPromise("GetPageJSActions", { pageIndex: this.pagesMapper.getPageId(t2 + 1) - 1 });
  }
  getStructTree(t2) {
    return this.messageHandler.sendWithPromise("GetStructTree", { pageIndex: this.pagesMapper.getPageId(t2 + 1) - 1 });
  }
  getOutline() {
    return this.messageHandler.sendWithPromise("GetOutline", null);
  }
  getOptionalContentConfig(t2) {
    return this.#ya("GetOptionalContentConfig").then((e2) => new OptionalContentConfig(e2, t2));
  }
  getPermissions() {
    return this.messageHandler.sendWithPromise("GetPermissions", null);
  }
  getMetadata() {
    const t2 = "GetMetadata";
    return this.#da.getOrInsertComputed(t2, () => this.messageHandler.sendWithPromise(t2, null).then((t3) => ({ info: t3[0], metadata: t3[1] ? new Metadata(t3[1]) : null, contentDispositionFilename: this.#ca?.filename ?? null, contentLength: this.#ca?.contentLength ?? null, hasStructTree: t3[2] })));
  }
  getMarkInfo() {
    return this.messageHandler.sendWithPromise("GetMarkInfo", null);
  }
  async startCleanup(t2 = false) {
    if (!this.destroyed) {
      await this.messageHandler.sendWithPromise("Cleanup", null);
      for (const t3 of this.#pa.values()) {
        if (!t3.cleanup()) throw new Error(`startCleanup: Page ${t3.pageNumber} is currently rendering.`);
      }
      this.commonObjs.clear();
      t2 || this.fontLoader.clear();
      this.#da.clear();
      this.filterFactory.destroy(true);
      TextLayer.cleanup();
    }
  }
  cachedPageNumber(t2) {
    if (!isRefProxy(t2)) return null;
    const e2 = 0 === t2.gen ? `${t2.num}R` : `${t2.num}R${t2.gen}`, i2 = this.#ma.get(e2);
    if (i2 >= 0) {
      const t3 = this.pagesMapper.getPageNumber(i2 + 1);
      if (0 !== t3) return t3;
    }
    return null;
  }
}
class RenderTask {
  _internalRenderTask = null;
  onContinue = null;
  onError = null;
  constructor(t2) {
    this._internalRenderTask = t2;
  }
  get promise() {
    return this._internalRenderTask.capability.promise;
  }
  cancel(t2 = 0) {
    this._internalRenderTask.cancel(null, t2);
  }
  get separateAnnots() {
    const { separateAnnots: t2 } = this._internalRenderTask.operatorList;
    if (!t2) return false;
    const { annotationCanvasMap: e2 } = this._internalRenderTask;
    return t2.form || t2.canvas && e2?.size > 0;
  }
  get imageCoordinates() {
    return this._internalRenderTask.imageCoordinates || null;
  }
}
class InternalRenderTask {
  #va = null;
  static #wa = /* @__PURE__ */ new WeakSet();
  constructor({ callback: t2, params: e2, objs: i2, commonObjs: n2, annotationCanvasMap: s2, operatorList: r2, pageIndex: a2, canvasFactory: o2, filterFactory: l2, useRequestAnimationFrame: h2 = false, pdfBug: c2 = false, pageColors: d2 = null, enableHWA: u2 = false, operationsFilter: p2 = null }) {
    this.callback = t2;
    this.params = e2;
    this.objs = i2;
    this.commonObjs = n2;
    this.annotationCanvasMap = s2;
    this.operatorListIdx = null;
    this.operatorList = r2;
    this._pageIndex = a2;
    this.canvasFactory = o2;
    this.filterFactory = l2;
    this._pdfBug = c2;
    this.pageColors = d2;
    this.running = false;
    this.graphicsReadyCallback = null;
    this.graphicsReady = false;
    this._useRequestAnimationFrame = true === h2 && "undefined" != typeof window;
    this.cancelled = false;
    this.capability = Promise.withResolvers();
    this.task = new RenderTask(this);
    this._cancelBound = this.cancel.bind(this);
    this._continueBound = this._continue.bind(this);
    this._scheduleNextBound = this._scheduleNext.bind(this);
    this._nextBound = this._next.bind(this);
    this._canvas = e2.canvas;
    this._canvasContext = e2.canvas ? null : e2.canvasContext;
    this._enableHWA = u2;
    this._dependencyTracker = e2.dependencyTracker;
    this._imagesTracker = e2.imagesTracker;
    this._operationsFilter = p2;
  }
  get completed() {
    return this.capability.promise.catch(() => {
    });
  }
  initializeGraphics({ transparency: t2 = false, optionalContentConfig: e2 }) {
    if (this.cancelled) return;
    if (this._canvas) {
      if (InternalRenderTask.#wa.has(this._canvas)) throw new Error("Cannot use the same canvas during multiple render() operations. Use different canvas or ensure previous operations were cancelled or completed.");
      InternalRenderTask.#wa.add(this._canvas);
    }
    if (this._pdfBug && globalThis.StepperManager?.enabled) {
      this.stepper = globalThis.StepperManager.create(this._pageIndex);
      this.stepper.init(this.operatorList);
      this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
    }
    const { viewport: i2, transform: n2, background: s2, dependencyTracker: r2, imagesTracker: a2 } = this.params, o2 = this._canvasContext || this._canvas.getContext("2d", { alpha: false, willReadFrequently: !this._enableHWA });
    this.gfx = new CanvasGraphics(o2, this.commonObjs, this.objs, this.canvasFactory, this.filterFactory, { optionalContentConfig: e2 }, this.annotationCanvasMap, this.pageColors, r2, a2);
    this.gfx.beginDrawing({ transform: n2, viewport: i2, transparency: t2, background: s2 });
    this.operatorListIdx = 0;
    this.graphicsReady = true;
    this.graphicsReadyCallback?.();
  }
  cancel(t2 = null, e2 = 0) {
    this.running = false;
    this.cancelled = true;
    this.gfx?.endDrawing();
    if (this.#va) {
      window.cancelAnimationFrame(this.#va);
      this.#va = null;
    }
    InternalRenderTask.#wa.delete(this._canvas);
    t2 ||= new RenderingCancelledException(`Rendering cancelled, page ${this._pageIndex + 1}`, e2);
    this.callback(t2);
    this.task.onError?.(t2);
  }
  operatorListChanged() {
    if (this.graphicsReady) {
      this.gfx.dependencyTracker?.growOperationsCount(this.operatorList.fnArray.length);
      this.stepper?.updateOperatorList(this.operatorList);
      this.running || this._continue();
    } else this.graphicsReadyCallback ||= this._continueBound;
  }
  _continue() {
    this.running = true;
    this.cancelled || (this.task.onContinue ? this.task.onContinue(this._scheduleNextBound) : this._scheduleNext());
  }
  _scheduleNext() {
    this._useRequestAnimationFrame ? this.#va = window.requestAnimationFrame(() => {
      this.#va = null;
      this._nextBound().catch(this._cancelBound);
    }) : Promise.resolve().then(this._nextBound).catch(this._cancelBound);
  }
  async _next() {
    if (!this.cancelled) {
      this.operatorListIdx = this.gfx.executeOperatorList(this.operatorList, this.operatorListIdx, this._continueBound, this.stepper, this._operationsFilter);
      if (this.operatorListIdx === this.operatorList.argsArray.length) {
        this.running = false;
        if (this.operatorList.lastChunk) {
          this.gfx.endDrawing();
          InternalRenderTask.#wa.delete(this._canvas);
          this.callback();
        }
      }
    }
  }
}
const Lt = "6.4.299", Nt = "d0991a0d5";
class ColorPicker {
  #Aa = null;
  #xa = null;
  #Ca;
  #Ea = null;
  #Sa = false;
  #Ta = false;
  #o = null;
  #_a;
  #ka = null;
  #v = null;
  static #Da = null;
  static get _keyboardManager() {
    return shadow(this, "_keyboardManager", new KeyboardManager([[["Escape"], ColorPicker.prototype._hideDropdownFromKeyboard], [["Space"], ColorPicker.prototype._colorSelectFromKeyboard], [["ArrowDown", "ArrowRight"], ColorPicker.prototype._moveToNext], [["ArrowUp", "ArrowLeft"], ColorPicker.prototype._moveToPrevious], [["Home"], ColorPicker.prototype._moveToBeginning], [["End"], ColorPicker.prototype._moveToEnd]]));
  }
  constructor({ editor: t2 = null, uiManager: e2 = null }) {
    if (t2) {
      this.#Ta = false;
      this.#o = t2;
    } else this.#Ta = true;
    this.#v = t2?._uiManager || e2;
    this.#_a = this.#v._eventBus;
    this.#Ca = t2?.color?.toUpperCase() || this.#v?.highlightColors.values().next().value || "#FFFF98";
    ColorPicker.#Da ||= Object.freeze({ blue: "pdfjs-editor-colorpicker-blue", green: "pdfjs-editor-colorpicker-green", pink: "pdfjs-editor-colorpicker-pink", red: "pdfjs-editor-colorpicker-red", yellow: "pdfjs-editor-colorpicker-yellow" });
  }
  renderButton() {
    const t2 = this.#Aa = document.createElement("button");
    t2.className = "colorPicker";
    t2.tabIndex = "0";
    t2.setAttribute("data-l10n-id", "pdfjs-editor-colorpicker-button");
    t2.ariaHasPopup = "true";
    this.#o && (t2.ariaControls = `${this.#o.id}_colorpicker_dropdown`);
    const e2 = this.#v._signal;
    t2.addEventListener("click", this.#Pa.bind(this), { signal: e2 });
    t2.addEventListener("keydown", this.#Ma.bind(this), { signal: e2 });
    const i2 = this.#xa = document.createElement("span");
    i2.className = "swatch";
    i2.ariaHidden = "true";
    i2.style.backgroundColor = this.#Ca;
    t2.append(i2);
    return t2;
  }
  renderMainDropdown() {
    const t2 = this.#Ea = this.#Ia();
    t2.ariaOrientation = "horizontal";
    t2.ariaLabelledBy = "highlightColorPickerLabel";
    return t2;
  }
  #Ia() {
    const t2 = document.createElement("div"), e2 = this.#v._signal;
    t2.addEventListener("contextmenu", noContextMenu, { signal: e2 });
    t2.className = "dropdown";
    t2.role = "listbox";
    t2.ariaMultiSelectable = "false";
    t2.ariaOrientation = "vertical";
    t2.setAttribute("data-l10n-id", "pdfjs-editor-colorpicker-dropdown");
    this.#o && (t2.id = `${this.#o.id}_colorpicker_dropdown`);
    for (const [i2, n2] of this.#v.highlightColors) {
      const s2 = document.createElement("button");
      s2.tabIndex = "0";
      s2.role = "option";
      s2.setAttribute("data-color", n2);
      s2.title = i2;
      s2.setAttribute("data-l10n-id", ColorPicker.#Da[i2]);
      const r2 = document.createElement("span");
      s2.append(r2);
      r2.className = "swatch";
      r2.style.backgroundColor = n2;
      s2.ariaSelected = n2 === this.#Ca;
      s2.addEventListener("click", this.#Fa.bind(this, n2), { signal: e2 });
      t2.append(s2);
    }
    t2.addEventListener("keydown", this.#Ma.bind(this), { signal: e2 });
    return t2;
  }
  #Fa(t2, e2) {
    e2.stopPropagation();
    this.#_a.dispatch("switchannotationeditorparams", { source: this, type: b.HIGHLIGHT_COLOR, value: t2 });
    this.update(t2);
  }
  _colorSelectFromKeyboard(t2) {
    if (t2.target === this.#Aa) {
      this.#Pa(t2);
      return;
    }
    const e2 = t2.target.getAttribute("data-color");
    e2 && this.#Fa(e2, t2);
  }
  _moveToNext(t2) {
    this.#Ba ? t2.target !== this.#Aa ? t2.target.nextSibling?.focus() : this.#Ea.firstElementChild?.focus() : this.#Pa(t2);
  }
  _moveToPrevious(t2) {
    if (t2.target !== this.#Ea?.firstElementChild && t2.target !== this.#Aa) {
      this.#Ba || this.#Pa(t2);
      t2.target.previousSibling?.focus();
    } else this.#Ba && this._hideDropdownFromKeyboard();
  }
  _moveToBeginning(t2) {
    this.#Ba ? this.#Ea.firstElementChild?.focus() : this.#Pa(t2);
  }
  _moveToEnd(t2) {
    this.#Ba ? this.#Ea.lastElementChild?.focus() : this.#Pa(t2);
  }
  #Ma(t2) {
    ColorPicker._keyboardManager.exec(this, t2);
  }
  #Pa(t2) {
    if (this.#Ba) {
      this.hideDropdown();
      return;
    }
    this.#Sa = 0 === t2.detail;
    if (!this.#ka) {
      this.#ka = new AbortController();
      window.addEventListener("pointerdown", this.#g.bind(this), { signal: this.#v.combinedSignal(this.#ka) });
    }
    this.#Aa.ariaExpanded = "true";
    if (this.#Ea) {
      this.#Ea.classList.remove("hidden");
      return;
    }
    const e2 = this.#Ea = this.#Ia();
    this.#Aa.append(e2);
  }
  #g(t2) {
    this.#Ea?.contains(t2.target) || this.hideDropdown();
  }
  hideDropdown() {
    this.#Ea?.classList.add("hidden");
    this.#Aa.ariaExpanded = "false";
    this.#ka?.abort();
    this.#ka = null;
  }
  get #Ba() {
    return this.#Ea && !this.#Ea.classList.contains("hidden");
  }
  _hideDropdownFromKeyboard() {
    if (!this.#Ta) if (this.#Ba) {
      this.hideDropdown();
      this.#Aa.focus({ preventScroll: true, focusVisible: this.#Sa });
    } else this.#o?.unselect();
  }
  update(t2) {
    this.#xa && (this.#xa.style.backgroundColor = t2);
    if (!this.#Ea) return;
    const e2 = this.#v.highlightColors.values();
    for (const i2 of this.#Ea.children) i2.ariaSelected = e2.next().value === t2.toUpperCase();
  }
  destroy() {
    this.#Aa?.remove();
    this.#Aa = null;
    this.#xa = null;
    this.#Ea?.remove();
    this.#Ea = null;
  }
}
class BasicColorPicker {
  #Oa = null;
  #Ra = false;
  #o = null;
  #v = null;
  static #Da = null;
  constructor(t2) {
    this.#o = t2;
    this.#v = t2._uiManager;
    BasicColorPicker.#Da ||= Object.freeze({ freetext: "pdfjs-editor-color-picker-free-text-input", ink: "pdfjs-editor-color-picker-ink-input" });
  }
  renderButton() {
    if (this.#Oa) return this.#Oa;
    const { editorType: t2, colorType: e2, colorAndOpacityType: i2, opacityType: n2, color: s2, opacity: r2 } = this.#o, a2 = this.#Ra = FeatureTest.isAlphaColorInputSupported && void 0 !== n2, o2 = this.#Oa = document.createElement("input");
    o2.type = "color";
    if (a2) {
      o2.setAttribute("alpha", "");
      const t3 = Util.hexNums[Math.round(255 * (r2 ?? 1))];
      o2.value = (s2 || "#000000") + t3;
    } else o2.value = s2 || "#000000";
    o2.className = "basicColorPicker";
    o2.tabIndex = 0;
    o2.setAttribute("data-l10n-id", BasicColorPicker.#Da[t2]);
    o2.addEventListener("input", () => {
      if (a2) {
        const t3 = getRGBA(o2.value);
        if (!t3) return;
        const [s3, r3, a3, l2] = t3, h2 = Util.makeHexColor(s3, r3, a3);
        if (void 0 !== i2) this.#v.updateParams(i2, { color: h2, opacity: l2 });
        else {
          this.#v.updateParams(e2, h2);
          this.#v.updateParams(n2, l2);
        }
      } else this.#v.updateParams(e2, o2.value);
    }, { signal: this.#v._signal });
    return o2;
  }
  update(t2) {
    if (this.#Oa) if (this.#Ra) {
      const e2 = Util.hexNums[Math.round(255 * this.#o.opacity)];
      this.#Oa.value = t2 + e2;
    } else this.#Oa.value = t2;
  }
  updateOpacity(t2) {
    if (!this.#Oa || !this.#Ra) return;
    const e2 = Util.hexNums[Math.round(255 * t2)];
    this.#Oa.value = this.#o.color + e2;
  }
  destroy() {
    this.#Oa?.remove();
    this.#Oa = null;
  }
  hideDropdown() {
  }
}
function makeColorComp(t2) {
  return Math.floor(255 * MathClamp(t2, 0, 1)).toString(16).padStart(2, "0");
}
function scaleAndClamp(t2) {
  return 255 * MathClamp(t2, 0, 1);
}
class ColorConverters {
  static CMYK_G([t2, e2, i2, n2]) {
    return ["G", 1 - Math.min(1, 0.3 * t2 + 0.59 * i2 + 0.11 * e2 + n2)];
  }
  static G_CMYK([t2]) {
    return ["CMYK", 0, 0, 0, 1 - t2];
  }
  static G_RGB([t2]) {
    return ["RGB", t2, t2, t2];
  }
  static G_rgb([t2]) {
    return [t2 = scaleAndClamp(t2), t2, t2];
  }
  static G_HTML([t2]) {
    const e2 = makeColorComp(t2);
    return `#${e2}${e2}${e2}`;
  }
  static RGB_G([t2, e2, i2]) {
    return ["G", 0.3 * t2 + 0.59 * e2 + 0.11 * i2];
  }
  static RGB_rgb(t2) {
    return t2.map(scaleAndClamp);
  }
  static RGB_HTML(t2) {
    return `#${t2.map(makeColorComp).join("")}`;
  }
  static T_HTML() {
    return "#00000000";
  }
  static T_rgb() {
    return [null];
  }
  static CMYK_RGB([t2, e2, i2, n2]) {
    return ["RGB", 1 - Math.min(1, t2 + n2), 1 - Math.min(1, i2 + n2), 1 - Math.min(1, e2 + n2)];
  }
  static CMYK_rgb([t2, e2, i2, n2]) {
    return [scaleAndClamp(1 - Math.min(1, t2 + n2)), scaleAndClamp(1 - Math.min(1, i2 + n2)), scaleAndClamp(1 - Math.min(1, e2 + n2))];
  }
  static CMYK_HTML(t2) {
    const e2 = this.CMYK_RGB(t2).slice(1);
    return this.RGB_HTML(e2);
  }
  static RGB_CMYK([t2, e2, i2]) {
    const n2 = 1 - t2, s2 = 1 - e2, r2 = 1 - i2;
    return ["CMYK", n2, s2, r2, Math.min(n2, s2, r2)];
  }
}
class BaseSVGFactory {
  create(t2, e2, i2 = false) {
    if (t2 <= 0 || e2 <= 0) throw new Error("Invalid SVG dimensions");
    const n2 = this._createSVG("svg:svg");
    n2.setAttribute("version", "1.1");
    if (!i2) {
      n2.setAttribute("width", `${t2}px`);
      n2.setAttribute("height", `${e2}px`);
    }
    n2.setAttribute("preserveAspectRatio", "none");
    n2.setAttribute("viewBox", `0 0 ${t2} ${e2}`);
    return n2;
  }
  createElement(t2) {
    if ("string" != typeof t2) throw new Error("Invalid SVG element type");
    return this._createSVG(t2);
  }
  _createSVG(t2) {
    unreachable("Abstract method `_createSVG` called.");
  }
}
class DOMSVGFactory extends BaseSVGFactory {
  _createSVG(t2) {
    return document.createElementNS(s, t2);
  }
}
const Ut = /* @__PURE__ */ new WeakSet(), Ht = 60 * (/* @__PURE__ */ new Date()).getTimezoneOffset() * 1e3;
class AnnotationElementFactory {
  static create(t2) {
    switch (t2.data.annotationType) {
      case T.LINK:
        return new LinkAnnotationElement(t2);
      case T.TEXT:
        return new TextAnnotationElement(t2);
      case T.WIDGET:
        switch (t2.data.fieldType) {
          case "Tx":
            return new TextWidgetAnnotationElement(t2);
          case "Btn":
            return t2.data.radioButton ? new RadioButtonWidgetAnnotationElement(t2) : t2.data.checkBox ? new CheckboxWidgetAnnotationElement(t2) : new PushButtonWidgetAnnotationElement(t2);
          case "Ch":
            return new ChoiceWidgetAnnotationElement(t2);
          case "Sig":
            return new SignatureWidgetAnnotationElement(t2);
        }
        return new WidgetAnnotationElement(t2);
      case T.POPUP:
        return new PopupAnnotationElement(t2);
      case T.FREETEXT:
        return new FreeTextAnnotationElement(t2);
      case T.LINE:
        return new LineAnnotationElement(t2);
      case T.SQUARE:
        return new SquareAnnotationElement(t2);
      case T.CIRCLE:
        return new CircleAnnotationElement(t2);
      case T.POLYLINE:
        return new PolylineAnnotationElement(t2);
      case T.CARET:
        return new CaretAnnotationElement(t2);
      case T.INK:
        return new InkAnnotationElement(t2);
      case T.POLYGON:
        return new PolygonAnnotationElement(t2);
      case T.HIGHLIGHT:
        return new HighlightAnnotationElement(t2);
      case T.UNDERLINE:
        return new UnderlineAnnotationElement(t2);
      case T.SQUIGGLY:
        return new SquigglyAnnotationElement(t2);
      case T.STRIKEOUT:
        return new StrikeOutAnnotationElement(t2);
      case T.STAMP:
        return new StampAnnotationElement(t2);
      case T.FILEATTACHMENT:
        return new FileAttachmentAnnotationElement(t2);
      case T.RICHMEDIA:
      case T.SCREEN:
      case T.SOUND:
        return new MediaAnnotationElement(t2);
      default:
        return new AnnotationElement(t2);
    }
  }
}
class AnnotationElement {
  #La = null;
  #Na = false;
  #Ua = null;
  constructor(t2, { isRenderable: e2 = false, ignoreBorder: i2 = false, createQuadrilaterals: n2 = false } = {}) {
    this.isRenderable = e2;
    this.data = t2.data;
    this.layer = t2.layer;
    this.linkService = t2.linkService;
    this.downloadManager = t2.downloadManager;
    this.imageResourcesPath = t2.imageResourcesPath;
    this.renderForms = t2.renderForms;
    this.svgFactory = t2.svgFactory;
    this.annotationStorage = t2.annotationStorage;
    this.enableComment = t2.enableComment;
    this.enableScripting = t2.enableScripting;
    this.hasJSActions = t2.hasJSActions;
    this._fieldObjects = t2.fieldObjects;
    this.parent = t2.parent;
    this.hasOwnCommentButton = false;
    e2 && (this.contentElement = this.container = this._createContainer(i2));
    n2 && this._createQuadrilaterals();
  }
  static _hasPopupData({ contentsObj: t2, richText: e2 }) {
    return !(!t2?.str && !e2?.str);
  }
  get _isEditable() {
    return this.data.isEditable;
  }
  get hasPopupData() {
    return AnnotationElement._hasPopupData(this.data) || this.enableComment && !!this.commentText;
  }
  get commentData() {
    const { data: t2 } = this, e2 = this.annotationStorage?.getEditor(t2.id);
    return e2 ? e2.getData() : t2;
  }
  get hasCommentButton() {
    return this.enableComment && this.hasPopupElement;
  }
  get commentButtonPosition() {
    const t2 = this.annotationStorage?.getEditor(this.data.id);
    if (t2) return t2.commentButtonPositionInPage;
    const { quadPoints: e2, inkLists: i2, rect: n2 } = this.data;
    let s2 = -1 / 0, r2 = -1 / 0;
    if (e2?.length >= 8) {
      for (let t3 = 0; t3 < e2.length; t3 += 8) if (e2[t3 + 1] > r2) {
        r2 = e2[t3 + 1];
        s2 = e2[t3 + 2];
      } else e2[t3 + 1] === r2 && (s2 = Math.max(s2, e2[t3 + 2]));
      return [s2, r2];
    }
    if (i2?.length >= 1) {
      for (const t3 of i2) for (let e3 = 0, i3 = t3.length; e3 < i3; e3 += 2) if (t3[e3 + 1] > r2) {
        r2 = t3[e3 + 1];
        s2 = t3[e3];
      } else t3[e3 + 1] === r2 && (s2 = Math.max(s2, t3[e3]));
      if (s2 !== 1 / 0) return [s2, r2];
    }
    return n2 ? [n2[2], n2[3]] : null;
  }
  _normalizePoint(t2) {
    const { page: { view: e2 }, viewport: { rawDims: { pageWidth: i2, pageHeight: n2, pageX: s2, pageY: r2 } } } = this.parent;
    t2[1] = e2[3] - t2[1] + e2[1];
    t2[0] = 100 * (t2[0] - s2) / i2;
    t2[1] = 100 * (t2[1] - r2) / n2;
    return t2;
  }
  get commentText() {
    const { data: t2 } = this;
    return this.annotationStorage.getRawValue(`${m}${t2.id}`)?.popup?.contents || t2.contentsObj?.str || "";
  }
  set commentText(t2) {
    const { data: e2 } = this, i2 = { deleted: !t2, contents: t2 || "" };
    this.annotationStorage.updateEditor(e2.id, { popup: i2 }) || this.annotationStorage.setValue(`${m}${e2.id}`, { id: e2.id, annotationType: e2.annotationType, page: this.parent.page, popup: i2, popupRef: e2.popupRef, modificationDate: /* @__PURE__ */ new Date() });
    t2 || this.removePopup();
  }
  removePopup() {
    (this.#Ua?.popup || this.popup)?.remove();
    this.#Ua = this.popup = null;
  }
  updateEdited(t2) {
    if (!this.container) return;
    t2.rect && (this.#La ||= { rect: this.data.rect.slice(0) });
    const { rect: e2, popup: i2 } = t2;
    e2 && this.#Ha(e2);
    let n2 = this.#Ua?.popup || this.popup;
    if (!n2 && i2?.text) {
      this._createPopup(i2);
      n2 = this.#Ua.popup;
    }
    if (n2) {
      n2.updateEdited(t2);
      if (i2?.deleted) {
        n2.remove();
        this.#Ua = null;
        this.popup = null;
      }
    }
  }
  resetEdited() {
    if (this.#La) {
      this.#Ha(this.#La.rect);
      this.#Ua?.popup.resetEdited();
      this.#La = null;
    }
  }
  #Ha(t2) {
    const { container: { style: e2 }, data: { rect: i2, rotation: n2 }, parent: { viewport: { rawDims: { pageWidth: s2, pageHeight: r2, pageX: a2, pageY: o2 } } } } = this;
    i2?.splice(0, 4, ...t2);
    e2.left = 100 * (t2[0] - a2) / s2 + "%";
    e2.top = 100 * (r2 - t2[3] + o2) / r2 + "%";
    if (0 === n2) {
      e2.width = 100 * (t2[2] - t2[0]) / s2 + "%";
      e2.height = 100 * (t2[3] - t2[1]) / r2 + "%";
    } else this.setRotation(n2);
  }
  _createContainer(t2) {
    const { data: e2, parent: { page: i2, viewport: n2 } } = this, s2 = document.createElement("section");
    s2.setAttribute("data-annotation-id", e2.id);
    this instanceof WidgetAnnotationElement || this instanceof LinkAnnotationElement || this instanceof MediaAnnotationElement || (s2.tabIndex = 0);
    const { style: r2 } = s2;
    r2.zIndex = this.parent.zIndex;
    this.parent.zIndex += 2;
    e2.alternativeText && (s2.title = e2.alternativeText);
    e2.noRotate && s2.classList.add("norotate");
    if (!e2.rect || this instanceof PopupAnnotationElement) {
      const { rotation: t3 } = e2;
      e2.hasOwnCanvas || 0 === t3 || this.setRotation(t3, s2);
      return s2;
    }
    const { width: a2, height: o2 } = this;
    if (!t2 && e2.borderStyle.width > 0) {
      r2.borderWidth = `${e2.borderStyle.width}px`;
      const t3 = e2.borderStyle.horizontalCornerRadius, i3 = e2.borderStyle.verticalCornerRadius;
      if (t3 > 0 || i3 > 0) {
        const e3 = `calc(${t3}px * var(--total-scale-factor)) / calc(${i3}px * var(--total-scale-factor))`;
        r2.borderRadius = e3;
      }
      switch (e2.borderStyle.style) {
        case _:
          r2.borderStyle = "solid";
          break;
        case k:
          r2.borderStyle = "dashed";
          break;
        case D:
          warn("Unimplemented border style: beveled");
          break;
        case P:
          warn("Unimplemented border style: inset");
          break;
        case M:
          r2.borderBottomStyle = "solid";
      }
      const n3 = e2.borderColor || null;
      if (n3) {
        this.#Na = true;
        r2.borderColor = Util.makeHexColor(...n3);
      } else r2.borderWidth = 0;
    }
    const l2 = Util.normalizeRect([e2.rect[0], i2.view[3] - e2.rect[1] + i2.view[1], e2.rect[2], i2.view[3] - e2.rect[3] + i2.view[1]]), { pageWidth: h2, pageHeight: c2, pageX: d2, pageY: u2 } = n2.rawDims;
    r2.left = 100 * (l2[0] - d2) / h2 + "%";
    r2.top = 100 * (l2[1] - u2) / c2 + "%";
    const { rotation: p2 } = e2;
    if (e2.hasOwnCanvas || 0 === p2) {
      r2.width = 100 * a2 / h2 + "%";
      r2.height = 100 * o2 / c2 + "%";
    } else this.setRotation(p2, s2);
    return s2;
  }
  setRotation(t2, e2 = this.container) {
    if (!this.data.rect) return;
    const { pageWidth: i2, pageHeight: n2 } = this.parent.viewport.rawDims;
    let { width: s2, height: r2 } = this;
    t2 % 180 != 0 && ([s2, r2] = [r2, s2]);
    e2.style.width = 100 * s2 / i2 + "%";
    e2.style.height = 100 * r2 / n2 + "%";
    e2.setAttribute("data-main-rotation", (360 - t2) % 360);
  }
  get _commonActions() {
    const setColor = (t2, e2, i2) => {
      const n2 = i2.detail[t2], s2 = n2[0], r2 = n2.slice(1);
      i2.target.style[e2] = ColorConverters[`${s2}_HTML`](r2);
      this.annotationStorage.setValue(this.data.id, { [e2]: ColorConverters[`${s2}_rgb`](r2) });
    };
    return shadow(this, "_commonActions", { display: (t2) => {
      const { display: e2 } = t2.detail, i2 = e2 % 2 == 1;
      this.container.style.visibility = i2 ? "hidden" : "visible";
      this.annotationStorage.setValue(this.data.id, { noView: i2, noPrint: 1 === e2 || 2 === e2 });
    }, print: (t2) => {
      this.annotationStorage.setValue(this.data.id, { noPrint: !t2.detail.print });
    }, hidden: (t2) => {
      const { hidden: e2 } = t2.detail;
      this.container.style.visibility = e2 ? "hidden" : "visible";
      this.annotationStorage.setValue(this.data.id, { noPrint: e2, noView: e2 });
    }, focus: (t2) => {
      setTimeout(() => t2.target.focus({ preventScroll: false }), 0);
    }, userName: (t2) => {
      t2.target.title = t2.detail.userName;
    }, readonly: (t2) => {
      t2.target.disabled = t2.detail.readonly;
    }, required: (t2) => {
      this._setRequired(t2.target, t2.detail.required);
    }, bgColor: (t2) => {
      setColor("bgColor", "backgroundColor", t2);
    }, fillColor: (t2) => {
      setColor("fillColor", "backgroundColor", t2);
    }, fgColor: (t2) => {
      setColor("fgColor", "color", t2);
    }, textColor: (t2) => {
      setColor("textColor", "color", t2);
    }, borderColor: (t2) => {
      setColor("borderColor", "borderColor", t2);
    }, strokeColor: (t2) => {
      setColor("strokeColor", "borderColor", t2);
    }, rotation: (t2) => {
      const e2 = t2.detail.rotation;
      this.setRotation(e2);
      this.annotationStorage.setValue(this.data.id, { rotation: e2 });
    } });
  }
  _dispatchEventFromSandbox(t2, e2) {
    const i2 = this._commonActions;
    for (const n2 of Object.keys(e2.detail)) {
      const s2 = t2[n2] || i2[n2];
      s2?.(e2);
    }
  }
  _setDefaultPropertiesFromJS(t2) {
    if (!this.enableScripting) return;
    const e2 = this.annotationStorage.getRawValue(this.data.id);
    if (!e2) return;
    const i2 = this._commonActions;
    for (const [n2, s2] of Object.entries(e2)) {
      const r2 = i2[n2];
      if (r2) {
        r2({ detail: { [n2]: s2 }, target: t2 });
        delete e2[n2];
      }
    }
  }
  _createQuadrilaterals() {
    if (!this.container) return;
    const { quadPoints: t2 } = this.data;
    if (!t2) return;
    const [e2, i2, n2, r2] = this.data.rect.map(Math.fround);
    if (8 === t2.length) {
      const [s2, a3, o3, l3] = t2.subarray(2, 6);
      if (n2 === s2 && r2 === a3 && e2 === o3 && i2 === l3) return;
    }
    const { style: a2 } = this.container;
    let o2;
    if (this.#Na) {
      const { borderColor: t3, borderWidth: e3 } = a2;
      a2.borderWidth = 0;
      o2 = ["url('data:image/svg+xml;utf8,", `<svg xmlns="${s}" preserveAspectRatio="none" viewBox="0 0 1 1">`, `<g fill="transparent" stroke="${t3}" stroke-width="${e3}">`];
      this.container.classList.add("hasBorder");
    }
    const l2 = n2 - e2, h2 = r2 - i2, { svgFactory: c2 } = this, d2 = c2.createElement("svg");
    d2.classList.add("quadrilateralsContainer");
    d2.setAttribute("width", 0);
    d2.setAttribute("height", 0);
    d2.role = "none";
    const u2 = c2.createElement("defs");
    d2.append(u2);
    const p2 = c2.createElement("clipPath"), g2 = `clippath_${this.data.id}`;
    p2.setAttribute("id", g2);
    p2.setAttribute("clipPathUnits", "objectBoundingBox");
    u2.append(p2);
    for (let i3 = 2, n3 = t2.length; i3 < n3; i3 += 8) {
      const n4 = t2[i3], s2 = t2[i3 + 1], a3 = t2[i3 + 2], d3 = t2[i3 + 3], u3 = c2.createElement("rect"), g3 = (a3 - e2) / l2, m2 = (r2 - s2) / h2, f2 = (n4 - a3) / l2, b2 = (s2 - d3) / h2;
      u3.setAttribute("x", g3);
      u3.setAttribute("y", m2);
      u3.setAttribute("width", f2);
      u3.setAttribute("height", b2);
      p2.append(u3);
      o2?.push(`<rect vector-effect="non-scaling-stroke" x="${g3}" y="${m2}" width="${f2}" height="${b2}"/>`);
    }
    if (this.#Na) {
      o2.push("</g></svg>')");
      a2.backgroundImage = o2.join("");
    }
    this.container.append(d2);
    this.container.style.clipPath = `url(#${g2})`;
  }
  _createPopup(t2 = null) {
    const { data: e2 } = this;
    let i2, n2;
    if (t2) {
      i2 = { str: t2.text };
      n2 = t2.date;
    } else {
      i2 = e2.contentsObj;
      n2 = e2.modificationDate;
    }
    this.#Ua = new PopupAnnotationElement({ data: { color: e2.color, titleObj: e2.titleObj, modificationDate: n2, contentsObj: i2, richText: e2.richText, parentRect: e2.rect, borderStyle: 0, id: `popup_${e2.id}`, rotation: e2.rotation, noRotate: true }, linkService: this.linkService, parent: this.parent, elements: [this] });
  }
  get hasPopupElement() {
    return !!(this.#Ua || this.popup || this.data.popupRef);
  }
  get extraPopupElement() {
    return this.#Ua;
  }
  render() {
    unreachable("Abstract method `AnnotationElement.render` called");
  }
  _getElementsByName(t2, e2 = null) {
    const i2 = [];
    if (this._fieldObjects) {
      const n2 = this._fieldObjects.get(t2) || [];
      for (const { page: t3, id: s2, exportValues: r2 } of n2) {
        if (-1 === t3 || s2 === e2) continue;
        const n3 = "string" == typeof r2 ? r2 : null, a2 = document.querySelector(`[data-element-id="${s2}"]`);
        !a2 || Ut.has(a2) ? i2.push({ id: s2, exportValue: n3, domElement: a2 }) : warn(`_getElementsByName - element not allowed: ${s2}`);
      }
      return i2;
    }
    for (const n2 of document.getElementsByName(t2)) {
      const { exportValue: t3 } = n2, s2 = n2.getAttribute("data-element-id");
      s2 !== e2 && Ut.has(n2) && i2.push({ id: s2, exportValue: t3, domElement: n2 });
    }
    return i2;
  }
  show() {
    this.container && (this.container.hidden = false);
    this.popup?.maybeShow();
  }
  hide() {
    this.container && (this.container.hidden = true);
    this.popup?.forceHide();
  }
  getElementsToTriggerPopup() {
    return this.container;
  }
  addHighlightArea() {
    const t2 = this.getElementsToTriggerPopup();
    if (Array.isArray(t2)) for (const e2 of t2) e2.classList.add("highlightArea");
    else t2.classList.add("highlightArea");
  }
  _editOnDoubleClick() {
    if (!this._isEditable) return;
    const { annotationEditorType: t2, data: { id: e2 } } = this;
    this.container.addEventListener("dblclick", () => {
      this.linkService.eventBus?.dispatch("switchannotationeditormode", { source: this, mode: t2, editId: e2, mustEnterInEditMode: true });
    });
  }
  updateOC(t2) {
    if (!this.data.oc || !t2) return;
    t2.isVisible(this.data.oc) ? this.show() : this.hide();
  }
  get width() {
    return this.data.rect[2] - this.data.rect[0];
  }
  get height() {
    return this.data.rect[3] - this.data.rect[1];
  }
  _setBackgroundColor(t2) {
    const e2 = this.data.backgroundColor || null;
    t2.style.backgroundColor = null === e2 ? "transparent" : Util.makeHexColor(...e2);
  }
}
class EditorAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
    this.editor = t2.editor;
  }
  render() {
    this.container.className = "editorAnnotation";
    return this.container;
  }
  createOrUpdatePopup() {
    const { editor: t2 } = this;
    t2.hasComment && this._createPopup(t2.comment);
  }
  get hasCommentButton() {
    return this.enableComment && this.editor.hasComment;
  }
  get commentButtonPosition() {
    return this.editor.commentButtonPositionInPage;
  }
  get commentText() {
    return this.editor.comment.text;
  }
  set commentText(t2) {
    this.editor.comment = t2;
    t2 || this.removePopup();
  }
  get commentData() {
    return this.editor.getData();
  }
  remove() {
    this.parent.removeAnnotation(this.data.id);
    this.container.remove();
    this.container = null;
    this.removePopup();
  }
}
class LinkAnnotationElement extends AnnotationElement {
  constructor(t2, e2 = null) {
    super(t2, { isRenderable: true, ignoreBorder: !!e2?.ignoreBorder, createQuadrilaterals: true });
    this.isTooltipOnly = t2.data.isTooltipOnly;
  }
  render() {
    const { data: t2, linkService: e2 } = this, i2 = document.createElement("a");
    i2.setAttribute("data-element-id", t2.id);
    let n2 = false;
    if (t2.url) {
      e2.addLinkAttributes(i2, t2.url, t2.newWindow);
      n2 = true;
    } else if (t2.action) {
      this._bindNamedAction(i2, t2.action, t2.overlaidText);
      n2 = true;
    } else if (t2.attachment) {
      this.#za(i2, t2.attachmentId, t2.attachment, t2.overlaidText, t2.attachmentDest);
      n2 = true;
    } else if (t2.setOCGState) {
      this.#Ga(i2, t2.setOCGState, t2.overlaidText);
      n2 = true;
    } else if (t2.dest) {
      this._bindLink(i2, t2.dest, t2.overlaidText);
      n2 = true;
    } else {
      if (t2.actions && (t2.actions.has("Action") || t2.actions.has("Mouse Up") || t2.actions.has("Mouse Down")) && this.enableScripting && this.hasJSActions) {
        this._bindJSAction(i2, t2);
        n2 = true;
      }
      if (t2.resetForm) {
        this._bindResetFormAction(i2, t2.resetForm);
        n2 = true;
      } else if (this.isTooltipOnly && !n2) {
        this._bindLink(i2, "");
        n2 = true;
      }
    }
    this.container.classList.add("linkAnnotation");
    if (n2) {
      this.contentElement = i2;
      this.container.append(i2);
    }
    return this.container;
  }
  #Va() {
    this.container.setAttribute("data-internal-link", "");
  }
  _bindLink(t2, e2, i2 = "") {
    t2.href = this.linkService.getDestinationHash(e2);
    t2.onclick = () => {
      e2 && this.linkService.goToDestination(e2);
      return false;
    };
    (e2 || "" === e2) && this.#Va();
    i2 && (t2.title = i2);
  }
  _bindNamedAction(t2, e2, i2 = "") {
    t2.href = this.linkService.getAnchorUrl("");
    t2.onclick = () => {
      this.linkService.executeNamedAction(e2);
      return false;
    };
    i2 && (t2.title = i2);
    this.#Va();
  }
  #za(t2, e2, i2, n2 = "", s2 = null) {
    t2.href = this.linkService.getAnchorUrl("");
    i2.description ? t2.title = i2.description : n2 && (t2.title = n2);
    const openAttachment = async () => {
      const t3 = await this.linkService.getAttachmentContent(e2);
      t3 && this.downloadManager?.openOrDownloadData(t3, i2.filename, s2);
    };
    t2.onclick = () => {
      openAttachment();
      return false;
    };
    this.#Va();
  }
  #Ga(t2, e2, i2 = "") {
    t2.href = this.linkService.getAnchorUrl("");
    t2.onclick = () => {
      this.linkService.executeSetOCGState(e2);
      return false;
    };
    i2 && (t2.title = i2);
    this.#Va();
  }
  _bindJSAction(t2, { actions: e2, id: i2, overlaidText: n2 }) {
    t2.href = this.linkService.getAnchorUrl("");
    const s2 = /* @__PURE__ */ new Map([["Action", "onclick"], ["Mouse Up", "onmouseup"], ["Mouse Down", "onmousedown"]]);
    for (const n3 of e2.keys()) {
      const e3 = s2.get(n3);
      e3 && (t2[e3] = () => {
        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: i2, name: n3 } });
        return false;
      });
    }
    n2 && (t2.title = n2);
    t2.onclick ||= () => false;
    this.#Va();
  }
  _bindResetFormAction(t2, e2) {
    const i2 = t2.onclick;
    i2 || (t2.href = this.linkService.getAnchorUrl(""));
    this.#Va();
    if (this._fieldObjects) t2.onclick = () => {
      i2?.();
      const { fields: t3, refs: n2, include: s2 } = e2, r2 = [];
      if (0 !== t3.length || 0 !== n2.length) {
        const e3 = new Set(n2);
        for (const i4 of t3) {
          const t4 = this._fieldObjects.get(i4) || [];
          for (const { id: i5 } of t4) e3.add(i5);
        }
        const i3 = /* @__PURE__ */ new Map();
        for (const t4 of this._fieldObjects.values()) for (const { id: e4, kidIds: n3 } of t4) n3 && i3.set(e4, n3);
        for (const t4 of e3) for (const n3 of i3.get(t4) || []) e3.add(n3);
        for (const t4 of this._fieldObjects.values()) for (const i4 of t4) e3.has(i4.id) === s2 && r2.push(i4);
      } else for (const t4 of this._fieldObjects.values()) r2.push(...t4);
      const a2 = this.annotationStorage, o2 = [];
      for (const t4 of r2) {
        const { id: e3 } = t4;
        o2.push(e3);
        switch (t4.type) {
          case "text": {
            const i4 = t4.defaultValue || "";
            a2.setValue(e3, { value: i4 });
            break;
          }
          case "checkbox":
          case "radiobutton": {
            const i4 = t4.defaultValue === t4.exportValues;
            a2.setValue(e3, { value: i4 });
            break;
          }
          case "combobox":
          case "listbox": {
            const i4 = t4.defaultValue || "";
            a2.setValue(e3, { value: i4 });
            break;
          }
          default:
            continue;
        }
        const i3 = document.querySelector(`[data-element-id="${e3}"]`);
        i3 && (Ut.has(i3) ? i3.dispatchEvent(new Event("resetform")) : warn(`_bindResetFormAction - element not allowed: ${e3}`));
      }
      this.enableScripting && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: "app", ids: o2, name: "ResetForm" } });
      return false;
    };
    else {
      warn('_bindResetFormAction - "resetForm" action not supported, ensure that the `fieldObjects` parameter is provided.');
      i2 || (t2.onclick = () => false);
    }
  }
}
class TextAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true });
  }
  render() {
    this.container.classList.add("textAnnotation");
    const t2 = document.createElement("img");
    t2.src = this.imageResourcesPath + "annotation-" + this.data.name.toLowerCase() + ".svg";
    t2.setAttribute("data-l10n-id", "pdfjs-text-annotation-type");
    t2.setAttribute("data-l10n-args", JSON.stringify({ type: this.data.name }));
    if (!this.data.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this.container.append(t2);
    return this.container;
  }
}
class WidgetAnnotationElement extends AnnotationElement {
  render() {
    return this.container;
  }
  _getKeyModifier(t2) {
    return FeatureTest.platform.isMac ? t2.metaKey : t2.ctrlKey;
  }
  _setEventListener(t2, e2, i2, n2, s2) {
    i2.includes("mouse") ? t2.addEventListener(i2, (t3) => {
      this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: this.data.id, name: n2, value: s2(t3), shift: t3.shiftKey, modifier: this._getKeyModifier(t3) } });
    }) : t2.addEventListener(i2, (t3) => {
      if ("blur" === i2) {
        if (!e2.focused || !t3.relatedTarget) return;
        e2.focused = false;
      } else if ("focus" === i2) {
        if (e2.focused) return;
        e2.focused = true;
      }
      s2 && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: this.data.id, name: n2, value: s2(t3) } });
    });
  }
  _setEventListeners(t2, e2, i2, n2) {
    const { actions: s2 } = this.data;
    for (const [r2, a2] of i2) if ("Action" === a2 || s2?.has(a2)) {
      "Focus" !== a2 && "Blur" !== a2 || (e2 ||= { focused: false });
      this._setEventListener(t2, e2, r2, a2, n2);
      "Focus" !== a2 || s2?.has("Blur") ? "Blur" !== a2 || s2?.has("Focus") || this._setEventListener(t2, e2, "focus", "Focus", null) : this._setEventListener(t2, e2, "blur", "Blur", null);
    }
  }
  _setTextStyle(t2) {
    const e2 = ["left", "center", "right"], { fontColor: i2 } = this.data.defaultAppearanceData, n2 = this.data.defaultAppearanceData.fontSize || 9, s2 = t2.style;
    let r2;
    const roundToOneDecimal = (t3) => Math.round(10 * t3) / 10;
    if (this.data.multiLine) {
      const t3 = Math.abs(this.data.rect[3] - this.data.rect[1] - 2), e3 = t3 / (Math.round(t3 / (1.35 * n2)) || 1);
      r2 = Math.min(n2, roundToOneDecimal(e3 / 1.35));
    } else {
      const t3 = Math.abs(this.data.rect[3] - this.data.rect[1] - 2);
      r2 = Math.min(n2, roundToOneDecimal(t3 / 1.35));
    }
    s2.fontSize = `calc(${r2}px * var(--total-scale-factor))`;
    s2.color = Util.makeHexColor(...i2);
    null === this.data.textAlignment || this.data.comb || (s2.textAlign = e2[this.data.textAlignment]);
  }
  _setRequired(t2, e2) {
    e2 ? t2.setAttribute("required", true) : t2.removeAttribute("required");
    t2.setAttribute("aria-required", e2);
  }
}
class TextWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: t2.renderForms || t2.data.hasOwnCanvas || !t2.data.hasAppearance && !!t2.data.fieldValue });
  }
  setPropertyOnSiblings(t2, e2, i2, n2) {
    const s2 = this.annotationStorage;
    for (const r2 of this._getElementsByName(t2.name, t2.id)) {
      r2.domElement && (r2.domElement[e2] = i2);
      s2.setValue(r2.id, { [n2]: i2 });
    }
  }
  render() {
    const t2 = this.annotationStorage, e2 = this.data.id;
    this.container.classList.add("textWidgetAnnotation");
    let i2 = null;
    if (this.renderForms) {
      const n2 = t2.getValue(e2, { value: this.data.fieldValue });
      let s2 = n2.value || "";
      const r2 = t2.getValue(e2, { charLimit: this.data.maxLen }).charLimit;
      r2 && s2.length > r2 && (s2 = s2.slice(0, r2));
      let a2 = n2.formattedValue || this.data.textContent?.join("\n") || null;
      a2 && this.data.comb && (a2 = a2.replaceAll(/\s+/g, ""));
      const o2 = { userValue: s2, formattedValue: a2, lastCommittedValue: null, commitKey: 1, focused: false };
      if (this.data.multiLine) {
        i2 = document.createElement("textarea");
        i2.textContent = a2 ?? s2;
        this.data.doNotScroll && (i2.style.overflowY = "hidden");
      } else {
        i2 = document.createElement("input");
        i2.type = this.data.password ? "password" : "text";
        i2.setAttribute("value", a2 ?? s2);
        this.data.doNotScroll && (i2.style.overflowX = "hidden");
      }
      if (this.data.hasOwnCanvas) {
        this.container.classList.add("hasOwnCanvas");
        t2.has(e2) && this.container.classList.add("sandboxModified");
      }
      Ut.add(i2);
      this.contentElement = i2;
      i2.setAttribute("data-element-id", e2);
      i2.disabled = this.data.readOnly;
      i2.name = this.data.fieldName;
      i2.tabIndex = 0;
      const { datetimeFormat: l2, datetimeType: h2, timeStep: c2 } = this.data, d2 = !!h2 && this.enableScripting;
      l2 && (i2.title = l2);
      this._setRequired(i2, this.data.required);
      r2 && (i2.maxLength = r2);
      i2.addEventListener("input", (n3) => {
        t2.setValue(e2, { value: n3.target.value });
        this.setPropertyOnSiblings(i2, "value", n3.target.value, "value");
        o2.formattedValue = null;
      });
      i2.addEventListener("resetform", (t3) => {
        const e3 = this.data.defaultFieldValue ?? "";
        i2.value = o2.userValue = e3;
        o2.formattedValue = null;
      });
      let blurListener = (t3) => {
        const { formattedValue: e3 } = o2;
        null != e3 && (t3.target.value = e3);
        t3.target.scrollLeft = 0;
      };
      if (this.enableScripting && this.hasJSActions) {
        i2.addEventListener("focus", (t3) => {
          if (o2.focused) return;
          const { target: e3 } = t3;
          if (d2) {
            e3.type = h2;
            c2 && (e3.step = c2);
          }
          if (o2.userValue) {
            const t4 = o2.userValue;
            if (d2) if ("time" === h2) {
              const i3 = new Date(t4), n4 = [i3.getHours(), i3.getMinutes(), i3.getSeconds()];
              e3.value = n4.map((t5) => t5.toString().padStart(2, "0")).join(":");
            } else e3.value = new Date(t4 - Ht).toISOString().split("date" === h2 ? "T" : ".", 1)[0];
            else e3.value = t4;
          }
          o2.lastCommittedValue = e3.value;
          o2.commitKey = 1;
          this.data.actions?.has("Focus") || (o2.focused = true);
        });
        i2.addEventListener("updatefromsandbox", (i3) => {
          this.container.classList.add("sandboxModified");
          const n4 = { value(i4) {
            o2.userValue = i4.detail.value ?? "";
            d2 || t2.setValue(e2, { value: o2.userValue.toString() });
            i4.target.value = o2.userValue;
          }, formattedValue(i4) {
            const { formattedValue: n5 } = i4.detail;
            o2.formattedValue = n5;
            null != n5 && i4.target !== document.activeElement && (i4.target.value = n5);
            const s3 = { formattedValue: n5 };
            d2 && (s3.value = n5);
            t2.setValue(e2, s3);
          }, selRange(t3) {
            t3.target.setSelectionRange(...t3.detail.selRange);
          }, charLimit: (i4) => {
            const { charLimit: n5 } = i4.detail, { target: s3 } = i4;
            if (0 === n5) {
              s3.removeAttribute("maxLength");
              return;
            }
            s3.setAttribute("maxLength", n5);
            let r3 = o2.userValue;
            if (r3 && !(r3.length <= n5)) {
              r3 = r3.slice(0, n5);
              s3.value = o2.userValue = r3;
              t2.setValue(e2, { value: r3 });
              this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: e2, name: "Keystroke", value: r3, willCommit: true, commitKey: 1, selStart: s3.selectionStart, selEnd: s3.selectionEnd } });
            }
          } };
          this._dispatchEventFromSandbox(n4, i3);
        });
        i2.addEventListener("keydown", (t3) => {
          o2.commitKey = 1;
          let i3 = -1;
          "Escape" === t3.key ? i3 = 0 : "Enter" !== t3.key || this.data.multiLine ? "Tab" === t3.key && (o2.commitKey = 3) : i3 = 2;
          if (-1 === i3) return;
          const { value: n4 } = t3.target;
          if (o2.lastCommittedValue !== n4) {
            o2.lastCommittedValue = n4;
            o2.userValue = n4;
            this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: e2, name: "Keystroke", value: n4, willCommit: true, commitKey: i3, selStart: t3.target.selectionStart, selEnd: t3.target.selectionEnd } });
          }
        });
        const n3 = blurListener;
        blurListener = null;
        i2.addEventListener("blur", (t3) => {
          if (!o2.focused || !t3.relatedTarget) return;
          this.data.actions?.has("Blur") || (o2.focused = false);
          const { target: i3 } = t3;
          let { value: s3 } = i3;
          if (d2) {
            if (s3 && "time" === h2) {
              const t4 = s3.split(":").map((t5) => parseInt(t5, 10));
              s3 = new Date(2e3, 0, 1, t4[0], t4[1], t4[2] || 0).valueOf();
              i3.step = "";
            } else {
              s3.includes("T") || (s3 = `${s3}T00:00`);
              s3 = new Date(s3).valueOf();
            }
            i3.type = "text";
          }
          o2.userValue = s3;
          o2.lastCommittedValue !== s3 && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: e2, name: "Keystroke", value: s3, willCommit: true, commitKey: o2.commitKey, selStart: t3.target.selectionStart, selEnd: t3.target.selectionEnd } });
          n3(t3);
        });
        this.data.actions?.has("Keystroke") && i2.addEventListener("beforeinput", (t3) => {
          o2.lastCommittedValue = null;
          const { data: i3, target: n4 } = t3, { value: s3, selectionStart: r3, selectionEnd: a3 } = n4;
          let l3 = r3, h3 = a3;
          switch (t3.inputType) {
            case "deleteWordBackward": {
              const t4 = /\w/;
              for (; l3 > 0 && !t4.test(s3[l3 - 1]); ) l3--;
              for (; l3 > 0 && t4.test(s3[l3 - 1]); ) l3--;
              break;
            }
            case "deleteWordForward": {
              const t4 = s3.substring(r3).match(/^\W*\w*/);
              t4 && (h3 += t4[0].length);
              break;
            }
            case "deleteContentBackward":
              r3 === a3 && (l3 -= 1);
              break;
            case "deleteContentForward":
              r3 === a3 && (h3 += 1);
          }
          t3.preventDefault();
          this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: e2, name: "Keystroke", value: s3, change: i3 || "", willCommit: false, selStart: l3, selEnd: h3 } });
        });
        this._setEventListeners(i2, o2, [["focus", "Focus"], ["blur", "Blur"], ["mousedown", "Mouse Down"], ["mouseenter", "Mouse Enter"], ["mouseleave", "Mouse Exit"], ["mouseup", "Mouse Up"]], (t3) => t3.target.value);
      }
      blurListener && i2.addEventListener("blur", blurListener);
      if (this.data.comb) {
        const t3 = (this.data.rect[2] - this.data.rect[0]) / r2;
        i2.classList.add("comb");
        i2.style.setProperty("--comb-width", `calc(${t3}px * var(--total-scale-factor))`);
        const e3 = this.data.textAlignment;
        if (1 === e3 || 2 === e3) {
          const setCombOffset = () => {
            const t4 = r2 - i2.value.length;
            i2.style.setProperty("--comb-offset", `${1 === e3 ? t4 >> 1 : t4}`);
          };
          setCombOffset();
          for (const t4 of ["input", "blur", "resetform", "updatefromsandbox"]) i2.addEventListener(t4, setCombOffset);
        }
      }
    } else {
      i2 = document.createElement("div");
      i2.textContent = this.data.fieldValue;
      i2.style.verticalAlign = "middle";
      i2.style.display = "table-cell";
      this.data.hasOwnCanvas && (i2.hidden = true);
    }
    this._setTextStyle(i2);
    this._setBackgroundColor(i2);
    this._setDefaultPropertiesFromJS(i2);
    this.container.append(i2);
    return this.container;
  }
}
class SignatureWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: !!t2.data.hasOwnCanvas });
  }
}
class CheckboxWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: t2.renderForms });
  }
  render() {
    const t2 = this.annotationStorage, e2 = this.data, i2 = e2.id;
    let n2 = t2.getValue(i2, { value: e2.exportValue === e2.fieldValue }).value;
    if ("string" == typeof n2) {
      n2 = "Off" !== n2;
      t2.setValue(i2, { value: n2 });
    }
    this.container.classList.add("buttonWidgetAnnotation", "checkBox");
    const s2 = document.createElement("input");
    Ut.add(s2);
    s2.setAttribute("data-element-id", i2);
    s2.disabled = e2.readOnly;
    this._setRequired(s2, this.data.required);
    s2.type = "checkbox";
    s2.name = e2.fieldName;
    n2 && s2.setAttribute("checked", true);
    s2.setAttribute("exportValue", e2.exportValue);
    s2.tabIndex = 0;
    s2.addEventListener("change", (n3) => {
      const { name: s3, checked: r2 } = n3.target;
      for (const n4 of this._getElementsByName(s3, i2)) {
        const i3 = r2 && n4.exportValue === e2.exportValue;
        n4.domElement && (n4.domElement.checked = i3);
        t2.setValue(n4.id, { value: i3 });
      }
      t2.setValue(i2, { value: r2 });
    });
    s2.addEventListener("resetform", (t3) => {
      const i3 = e2.defaultFieldValue || "Off";
      t3.target.checked = i3 === e2.exportValue;
    });
    if (this.enableScripting && this.hasJSActions) {
      s2.addEventListener("updatefromsandbox", (e3) => {
        const n3 = { value(e4) {
          e4.target.checked = "Off" !== e4.detail.value;
          t2.setValue(i2, { value: e4.target.checked });
        } };
        this._dispatchEventFromSandbox(n3, e3);
      });
      this._setEventListeners(s2, null, [["change", "Validate"], ["change", "Action"], ["focus", "Focus"], ["blur", "Blur"], ["mousedown", "Mouse Down"], ["mouseenter", "Mouse Enter"], ["mouseleave", "Mouse Exit"], ["mouseup", "Mouse Up"]], (t3) => t3.target.checked);
    }
    this._setDefaultPropertiesFromJS(s2);
    this.container.append(s2);
    return this.container;
  }
}
class RadioButtonWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: t2.renderForms });
  }
  render() {
    this.container.classList.add("buttonWidgetAnnotation", "radioButton");
    const t2 = this.annotationStorage, e2 = this.data, i2 = e2.id;
    let n2 = t2.getValue(i2, { value: null !== e2.buttonValue && e2.fieldValue === e2.buttonValue }).value;
    if ("string" == typeof n2) {
      n2 = n2 !== e2.buttonValue;
      t2.setValue(i2, { value: n2 });
    }
    if (n2) for (const n3 of this._getElementsByName(e2.fieldName, i2)) t2.setValue(n3.id, { value: false });
    const s2 = document.createElement("input");
    Ut.add(s2);
    s2.setAttribute("data-element-id", i2);
    s2.disabled = e2.readOnly;
    this._setRequired(s2, this.data.required);
    s2.type = "radio";
    s2.name = e2.fieldName;
    n2 && s2.setAttribute("checked", true);
    s2.tabIndex = 0;
    s2.addEventListener("change", (e3) => {
      const { name: n3, checked: s3 } = e3.target;
      for (const e4 of this._getElementsByName(n3, i2)) t2.setValue(e4.id, { value: false });
      t2.setValue(i2, { value: s3 });
    });
    s2.addEventListener("resetform", (t3) => {
      const i3 = e2.defaultFieldValue;
      t3.target.checked = null != i3 && i3 === e2.buttonValue;
    });
    if (this.enableScripting && this.hasJSActions) {
      const n3 = e2.buttonValue;
      s2.addEventListener("updatefromsandbox", (e3) => {
        const s3 = { value: (e4) => {
          const s4 = n3 === e4.detail.value;
          for (const n4 of this._getElementsByName(e4.target.name)) {
            const e5 = s4 && n4.id === i2;
            n4.domElement && (n4.domElement.checked = e5);
            t2.setValue(n4.id, { value: e5 });
          }
        } };
        this._dispatchEventFromSandbox(s3, e3);
      });
      this._setEventListeners(s2, null, [["change", "Validate"], ["change", "Action"], ["focus", "Focus"], ["blur", "Blur"], ["mousedown", "Mouse Down"], ["mouseenter", "Mouse Enter"], ["mouseleave", "Mouse Exit"], ["mouseup", "Mouse Up"]], (t3) => t3.target.checked);
    }
    this._setDefaultPropertiesFromJS(s2);
    this.container.append(s2);
    return this.container;
  }
}
class PushButtonWidgetAnnotationElement extends LinkAnnotationElement {
  constructor(t2) {
    super(t2, { ignoreBorder: t2.data.hasAppearance });
  }
  render() {
    const t2 = super.render();
    t2.classList.add("buttonWidgetAnnotation", "pushButton");
    const e2 = t2.lastChild;
    if (this.enableScripting && this.hasJSActions && e2) {
      this._setDefaultPropertiesFromJS(e2);
      e2.addEventListener("updatefromsandbox", (t3) => {
        this._dispatchEventFromSandbox({}, t3);
      });
    }
    return t2;
  }
}
class ChoiceWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: t2.renderForms });
  }
  render() {
    this.container.classList.add("choiceWidgetAnnotation");
    const t2 = this.annotationStorage, e2 = this.data.id, i2 = t2.getValue(e2, { value: this.data.fieldValue }), n2 = document.createElement("select");
    Ut.add(n2);
    n2.setAttribute("data-element-id", e2);
    n2.disabled = this.data.readOnly;
    this._setRequired(n2, this.data.required);
    n2.name = this.data.fieldName;
    n2.tabIndex = 0;
    let s2 = this.data.combo && this.data.options.length > 0;
    if (!this.data.combo) {
      n2.size = this.data.options.length;
      this.data.multiSelect && (n2.multiple = true);
    }
    n2.addEventListener("resetform", (t3) => {
      const e3 = this.data.defaultFieldValue;
      for (const t4 of n2.options) t4.selected = t4.value === e3;
    });
    const fixDisplayValue = (t3, e3) => {
      const i3 = e3.replaceAll(" ", " ");
      t3.textContent = i3;
      i3 !== e3 && t3.setAttribute("display-value", e3);
    };
    for (const t3 of this.data.options) {
      const e3 = document.createElement("option");
      fixDisplayValue(e3, t3.displayValue);
      e3.value = t3.exportValue;
      if (i2.value.includes(t3.exportValue)) {
        e3.setAttribute("selected", true);
        s2 = false;
      }
      n2.append(e3);
    }
    let r2 = null;
    if (s2) {
      const t3 = document.createElement("option");
      t3.value = " ";
      t3.setAttribute("hidden", true);
      t3.setAttribute("selected", true);
      n2.prepend(t3);
      r2 = () => {
        t3.remove();
        n2.removeEventListener("input", r2);
        r2 = null;
      };
      n2.addEventListener("input", r2);
    }
    const getValue = (t3) => {
      const e3 = t3 ? "value" : "textContent", { options: i3, multiple: s3 } = n2;
      return s3 ? Array.prototype.filter.call(i3, (t4) => t4.selected).map((t4) => t4[e3]) : -1 === i3.selectedIndex ? null : i3[i3.selectedIndex][e3];
    };
    let a2 = getValue(false);
    const getItems = (t3) => {
      const e3 = t3.target.options;
      return Array.prototype.map.call(e3, (t4) => ({ displayValue: t4.getAttribute("display-value") || t4.textContent, exportValue: t4.value }));
    };
    if (this.enableScripting && this.hasJSActions) {
      n2.addEventListener("updatefromsandbox", (i3) => {
        const s3 = { value(i4) {
          r2?.();
          const s4 = i4.detail.value, o2 = new Set(Array.isArray(s4) ? s4 : [s4]);
          for (const t3 of n2.options) t3.selected = o2.has(t3.value);
          t2.setValue(e2, { value: getValue(true) });
          a2 = getValue(false);
        }, multipleSelection(t3) {
          n2.multiple = true;
        }, remove(i4) {
          const s4 = n2.options, r3 = i4.detail.remove;
          s4[r3].selected = false;
          n2.remove(r3);
          if (s4.length > 0) {
            -1 === Array.prototype.findIndex.call(s4, (t3) => t3.selected) && (s4[0].selected = true);
          }
          t2.setValue(e2, { value: getValue(true), items: getItems(i4) });
          a2 = getValue(false);
        }, clear(i4) {
          for (; 0 !== n2.length; ) n2.remove(0);
          t2.setValue(e2, { value: null, items: [] });
          a2 = getValue(false);
        }, insert(i4) {
          const { index: s4, displayValue: r3, exportValue: o2 } = i4.detail.insert, l2 = n2.children[s4], h2 = document.createElement("option");
          fixDisplayValue(h2, r3);
          h2.value = o2;
          l2 ? l2.before(h2) : n2.append(h2);
          t2.setValue(e2, { value: getValue(true), items: getItems(i4) });
          a2 = getValue(false);
        }, items(i4) {
          const { items: s4 } = i4.detail;
          for (; 0 !== n2.length; ) n2.remove(0);
          for (const t3 of s4) {
            const { displayValue: e3, exportValue: i5 } = t3, s5 = document.createElement("option");
            fixDisplayValue(s5, e3);
            s5.value = i5;
            n2.append(s5);
          }
          n2.options.length > 0 && (n2.options[0].selected = true);
          t2.setValue(e2, { value: getValue(true), items: getItems(i4) });
          a2 = getValue(false);
        }, indices(i4) {
          const n3 = new Set(i4.detail.indices);
          for (const t3 of i4.target.options) t3.selected = n3.has(t3.index);
          t2.setValue(e2, { value: getValue(true) });
          a2 = getValue(false);
        }, editable(t3) {
          t3.target.disabled = !t3.detail.editable;
        } };
        this._dispatchEventFromSandbox(s3, i3);
      });
      n2.addEventListener("input", (i3) => {
        const n3 = getValue(true), s3 = getValue(false);
        t2.setValue(e2, { value: n3 });
        i3.preventDefault();
        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", { source: this, detail: { id: e2, name: "Keystroke", value: a2, change: s3, changeEx: n3, willCommit: false, commitKey: 1, keyDown: false } });
      });
      this._setEventListeners(n2, null, [["focus", "Focus"], ["blur", "Blur"], ["mousedown", "Mouse Down"], ["mouseenter", "Mouse Enter"], ["mouseleave", "Mouse Exit"], ["mouseup", "Mouse Up"], ["input", "Action"], ["input", "Validate"]], (t3) => t3.target.value);
    } else n2.addEventListener("input", function(i3) {
      t2.setValue(e2, { value: getValue(true) });
    });
    this.data.combo && this._setTextStyle(n2);
    this._setBackgroundColor(n2);
    this._setDefaultPropertiesFromJS(n2);
    this.container.append(n2);
    return this.container;
  }
}
class PopupAnnotationElement extends AnnotationElement {
  constructor(t2) {
    const { data: e2, elements: i2, parent: n2 } = t2, s2 = !!n2._commentManager;
    super(t2, { isRenderable: !s2 && AnnotationElement._hasPopupData(e2) });
    this.elements = i2;
    if (s2 && AnnotationElement._hasPopupData(e2)) {
      const t3 = this.popup = this.#Wa();
      for (const e3 of i2) e3.popup = t3;
    } else this.popup = null;
  }
  #Wa() {
    return new PopupElement({ container: this.container, color: this.data.color, titleObj: this.data.titleObj, modificationDate: this.data.modificationDate || this.data.creationDate, contentsObj: this.data.contentsObj, richText: this.data.richText, rect: this.data.rect, parentRect: this.data.parentRect || null, parent: this.parent, elements: this.elements, open: this.data.open, commentManager: this.parent._commentManager });
  }
  render() {
    const { container: t2 } = this;
    t2.classList.add("popupAnnotation");
    t2.role = "comment";
    const e2 = this.popup = this.#Wa(), i2 = [];
    for (const t3 of this.elements) {
      t3.popup = e2;
      t3.container.ariaHasPopup = "dialog";
      i2.push(t3.data.id);
      t3.addHighlightArea();
    }
    this.container.setAttribute("aria-controls", i2.map((t3) => `${g}${t3}`).join(","));
    return this.container;
  }
}
class PopupElement {
  #K = null;
  #$a = this.#Ma.bind(this);
  #ja = this.#Xa.bind(this);
  #Ka = this.#Ya.bind(this);
  #qa = this.#Qa.bind(this);
  #Ja = null;
  #Pt = null;
  #Za = null;
  #to = null;
  #eo = null;
  #io = null;
  #no = null;
  #so = false;
  #ro = null;
  #ao = null;
  #B = null;
  #oo = null;
  #lo = null;
  #xe = null;
  #ho = null;
  #ye = null;
  #co = null;
  #La = null;
  #do = false;
  #uo = null;
  #po = null;
  constructor({ container: t2, color: e2, elements: i2, titleObj: n2, modificationDate: s2, contentsObj: r2, richText: a2, parent: o2, rect: l2, parentRect: h2, open: c2, commentManager: d2 = null }) {
    this.#Pt = t2;
    this.#co = n2;
    this.#Za = r2;
    this.#ye = a2;
    this.#io = o2;
    this.#Ja = e2;
    this.#ho = l2;
    this.#no = h2;
    this.#eo = i2;
    this.#K = d2;
    this.#uo = i2[0];
    this.#to = PDFDateString.toDateObject(s2);
    this.trigger = i2.flatMap((t3) => t3.getElementsToTriggerPopup());
    if (!d2) {
      this.#go();
      this.#Pt.hidden = true;
      c2 && this.#Qa();
    }
  }
  #go() {
    if (this.#ao) return;
    this.#ao = new AbortController();
    const { signal: t2 } = this.#ao;
    for (const e2 of this.trigger) {
      e2.addEventListener("click", this.#qa, { signal: t2 });
      e2.addEventListener("pointerenter", this.#Ka, { signal: t2 });
      e2.addEventListener("pointerleave", this.#ja, { signal: t2 });
      e2.classList.add("popupTriggerArea");
    }
    for (const e2 of this.#eo) e2.container?.addEventListener("keydown", this.#$a, { signal: t2 });
  }
  #mo() {
    const t2 = this.#eo.find((t3) => t3.hasCommentButton);
    t2 && (this.#lo = t2._normalizePoint(t2.commentButtonPosition));
  }
  renderCommentButton() {
    if (this.#oo) {
      this.#oo.parentNode || this.#uo.container.after(this.#oo);
      return;
    }
    this.#lo || this.#mo();
    if (!this.#lo) return;
    const { signal: t2 } = this.#ao = new AbortController(), e2 = this.#uo.hasOwnCommentButton, togglePopup = () => {
      this.#K.toggleCommentPopup(this, true, void 0, !e2);
    }, showPopup = () => {
      this.#K.toggleCommentPopup(this, false, true, !e2);
    }, hidePopup = () => {
      this.#K.toggleCommentPopup(this, false, false);
    };
    if (e2) {
      this.#oo = this.#uo.container;
      for (const e3 of this.trigger) {
        e3.ariaHasPopup = "dialog";
        e3.ariaControls = "commentPopup";
        e3.addEventListener("keydown", this.#$a, { signal: t2 });
        e3.addEventListener("click", togglePopup, { signal: t2 });
        e3.addEventListener("pointerenter", showPopup, { signal: t2 });
        e3.addEventListener("pointerleave", hidePopup, { signal: t2 });
        e3.classList.add("popupTriggerArea");
      }
    } else {
      const e3 = this.#oo = document.createElement("button");
      e3.className = "annotationCommentButton";
      const i2 = this.#uo.container;
      e3.style.zIndex = parseInt(i2.style.zIndex, 10) + 1;
      e3.tabIndex = 0;
      e3.ariaHasPopup = "dialog";
      e3.ariaControls = "commentPopup";
      e3.setAttribute("data-l10n-id", "pdfjs-show-comment-button");
      this.#fo();
      this.#bo();
      e3.addEventListener("keydown", this.#$a, { signal: t2 });
      e3.addEventListener("click", togglePopup, { signal: t2 });
      e3.addEventListener("pointerenter", showPopup, { signal: t2 });
      e3.addEventListener("pointerleave", hidePopup, { signal: t2 });
      i2.after(e3);
    }
  }
  #bo() {
    if (this.#uo.extraPopupElement && !this.#uo.editor) return;
    this.#oo || this.renderCommentButton();
    const [t2, e2] = this.#lo, { style: i2 } = this.#oo;
    i2.left = `calc(${t2}%)`;
    i2.top = `calc(${e2}% - var(--comment-button-dim))`;
  }
  #fo() {
    if (!this.#uo.extraPopupElement) {
      this.#oo || this.renderCommentButton();
      this.#oo.style.backgroundColor = this.commentButtonColor || "";
    }
  }
  get commentButtonColor() {
    const { color: t2, opacity: e2 } = this.#uo.commentData;
    return t2 ? this.#io._commentManager.makeCommentColor(t2, e2) : null;
  }
  focusCommentButton() {
    setTimeout(() => {
      this.#oo?.focus();
    }, 0);
  }
  getData() {
    const { richText: t2, color: e2, opacity: i2, creationDate: n2, modificationDate: s2 } = this.#uo.commentData;
    return { contentsObj: { str: this.comment }, richText: t2, color: e2, opacity: i2, creationDate: n2, modificationDate: s2 };
  }
  get elementBeforePopup() {
    return this.#oo;
  }
  get comment() {
    this.#po ||= this.#uo.commentText;
    return this.#po;
  }
  set comment(t2) {
    t2 !== this.comment && (this.#uo.commentText = this.#po = t2);
  }
  focus() {
    this.#uo.container?.focus();
  }
  get parentBoundingClientRect() {
    return this.#uo.layer.getBoundingClientRect();
  }
  setCommentButtonStates({ selected: t2, hasPopup: e2 }) {
    if (this.#oo) {
      this.#oo.classList.toggle("selected", t2);
      this.#oo.ariaExpanded = e2;
    }
  }
  setSelectedCommentButton(t2) {
    this.#oo.classList.toggle("selected", t2);
  }
  get commentPopupPosition() {
    if (this.#xe) return this.#xe;
    const { x: t2, y: e2, height: i2 } = this.#oo.getBoundingClientRect(), { x: n2, y: s2, width: r2, height: a2 } = this.#uo.layer.getBoundingClientRect();
    return [(t2 - n2) / r2, (e2 + i2 - s2) / a2];
  }
  set commentPopupPosition(t2) {
    this.#xe = t2;
  }
  hasDefaultPopupPosition() {
    return null === this.#xe;
  }
  get commentButtonPosition() {
    return this.#lo;
  }
  get commentButtonWidth() {
    return this.#oo.getBoundingClientRect().width / this.parentBoundingClientRect.width;
  }
  editComment(t2) {
    const [e2, i2] = this.#xe || this.commentButtonPosition.map((t3) => t3 / 100), n2 = this.parentBoundingClientRect, { x: s2, y: r2, width: a2, height: o2 } = n2;
    this.#K.showDialog(null, this, s2 + e2 * a2, r2 + i2 * o2, { ...t2, parentDimensions: n2 });
  }
  render() {
    if (this.#ro) return;
    const t2 = this.#ro = document.createElement("div");
    t2.className = "popup";
    if (this.#Ja) {
      const e3 = t2.style.outlineColor = Util.makeHexColor(...this.#Ja);
      t2.style.backgroundColor = `color-mix(in srgb, ${e3} 30%, white)`;
    }
    const e2 = document.createElement("span");
    e2.className = "header";
    if (this.#co?.str) {
      const t3 = document.createElement("span");
      t3.className = "title";
      e2.append(t3);
      ({ dir: t3.dir, str: t3.textContent } = this.#co);
    }
    t2.append(e2);
    if (this.#to) {
      const t3 = document.createElement("time");
      t3.className = "popupDate";
      t3.setAttribute("data-l10n-id", "pdfjs-annotation-date-time-string");
      t3.setAttribute("data-l10n-args", JSON.stringify({ dateObj: this.#to.valueOf() }));
      t3.dateTime = this.#to.toISOString();
      e2.append(t3);
    }
    renderRichText({ html: this.#yo || this.#Za.str, dir: this.#Za?.dir, className: "popupContent" }, t2);
    this.#Pt.append(t2);
  }
  get #yo() {
    const t2 = this.#ye, e2 = this.#Za;
    return !t2?.str || e2?.str && e2.str !== t2.str ? null : this.#ye.html || null;
  }
  get #vo() {
    return this.#yo?.attributes?.style?.fontSize || 0;
  }
  get #wo() {
    return this.#yo?.attributes?.style?.color || null;
  }
  #Ao(t2) {
    const e2 = [], i2 = { str: t2, html: { name: "div", attributes: { dir: "auto" }, children: [{ name: "p", children: e2 }] } }, n2 = { style: { color: this.#wo, fontSize: this.#vo ? `calc(${this.#vo}px * var(--total-scale-factor))` : "" } };
    for (const i3 of t2.split("\n")) e2.push({ name: "span", value: i3, attributes: n2 });
    return i2;
  }
  #Ma(t2) {
    t2.altKey || t2.shiftKey || t2.ctrlKey || t2.metaKey || ("Enter" === t2.key || "Escape" === t2.key && this.#so) && this.#Qa();
  }
  updateEdited({ rect: t2, popup: e2, deleted: i2 }) {
    if (this.#K) {
      if (i2) {
        this.remove();
        this.#po = null;
      } else if (e2) if (e2.deleted) this.remove();
      else {
        this.#fo();
        this.#po = e2.text;
      }
      if (t2) {
        this.#lo = null;
        this.#mo();
        this.#bo();
      }
    } else if (i2 || e2?.deleted) this.remove();
    else {
      this.#go();
      this.#La ||= { contentsObj: this.#Za, richText: this.#ye };
      t2 && (this.#B = null);
      if (e2 && e2.text) {
        this.#ye = this.#Ao(e2.text);
        this.#to = PDFDateString.toDateObject(e2.date);
        this.#Za = null;
      }
      this.#ro?.remove();
      this.#ro = null;
    }
  }
  resetEdited() {
    if (this.#La) {
      ({ contentsObj: this.#Za, richText: this.#ye } = this.#La);
      this.#La = null;
      this.#ro?.remove();
      this.#ro = null;
      this.#B = null;
    }
  }
  remove() {
    this.#ao?.abort();
    this.#ao = null;
    this.#ro?.remove();
    this.#ro = null;
    this.#do = false;
    this.#so = false;
    this.#oo?.remove();
    this.#oo = null;
    if (this.trigger) for (const t2 of this.trigger) t2.classList.remove("popupTriggerArea");
  }
  #xo() {
    if (null !== this.#B) return;
    const { page: { view: t2 }, viewport: { rawDims: { pageWidth: e2, pageHeight: i2, pageX: n2, pageY: s2 } } } = this.#io;
    let r2 = !!this.#no, a2 = r2 ? this.#no : this.#ho;
    for (const t3 of this.#eo) if (!a2 || null !== Util.intersect(t3.data.rect, a2)) {
      a2 = t3.data.rect;
      r2 = true;
      break;
    }
    const o2 = Util.normalizeRect([a2[0], t2[3] - a2[1] + t2[1], a2[2], t2[3] - a2[3] + t2[1]]), l2 = r2 ? a2[2] - a2[0] + 5 : 0, h2 = o2[0] + l2, c2 = o2[1];
    this.#B = [100 * (h2 - n2) / e2, 100 * (c2 - s2) / i2];
    const { style: d2 } = this.#Pt;
    d2.left = `${this.#B[0]}%`;
    d2.top = `${this.#B[1]}%`;
  }
  #Qa() {
    if (this.#K) this.#K.toggleCommentPopup(this, false);
    else {
      this.#so = !this.#so;
      if (this.#so) {
        this.#Ya();
        this.#Pt.addEventListener("click", this.#qa);
        this.#Pt.addEventListener("keydown", this.#$a);
      } else {
        this.#Xa();
        this.#Pt.removeEventListener("click", this.#qa);
        this.#Pt.removeEventListener("keydown", this.#$a);
      }
    }
  }
  #Ya() {
    this.#ro || this.render();
    if (this.isVisible) this.#so && this.#Pt.classList.add("focused");
    else {
      this.#xo();
      this.#Pt.hidden = false;
      this.#Pt.style.zIndex = parseInt(this.#Pt.style.zIndex, 10) + 1e3;
    }
  }
  #Xa() {
    this.#Pt.classList.remove("focused");
    if (!this.#so && this.isVisible) {
      this.#Pt.hidden = true;
      this.#Pt.style.zIndex = parseInt(this.#Pt.style.zIndex, 10) - 1e3;
    }
  }
  forceHide() {
    this.#do = this.isVisible;
    this.#do && (this.#Pt.hidden = true);
  }
  maybeShow() {
    if (!this.#K) {
      this.#go();
      if (this.#do) {
        this.#ro || this.#Ya();
        this.#do = false;
        this.#Pt.hidden = false;
      }
    }
  }
  get isVisible() {
    return !this.#K && false === this.#Pt.hidden;
  }
}
class FreeTextAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
    this.textContent = t2.data.textContent;
    this.textPosition = t2.data.textPosition;
    this.annotationEditorType = f.FREETEXT;
  }
  render() {
    this.container.classList.add("freeTextAnnotation");
    if (this.textContent) {
      const t2 = this.contentElement = document.createElement("div");
      t2.classList.add("annotationTextContent");
      t2.setAttribute("role", "comment");
      for (const e2 of this.textContent) {
        const i2 = document.createElement("span");
        i2.textContent = e2;
        t2.append(i2);
      }
      this.container.append(t2);
    }
    if (!this.data.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this._editOnDoubleClick();
    return this.container;
  }
}
class LineAnnotationElement extends AnnotationElement {
  #Co = null;
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
  }
  render() {
    this.container.classList.add("lineAnnotation");
    const { data: t2, width: e2, height: i2 } = this, n2 = this.svgFactory.create(e2, i2, true), s2 = this.#Co = this.svgFactory.createElement("svg:line");
    s2.setAttribute("x1", t2.rect[2] - t2.lineCoordinates[0]);
    s2.setAttribute("y1", t2.rect[3] - t2.lineCoordinates[1]);
    s2.setAttribute("x2", t2.rect[2] - t2.lineCoordinates[2]);
    s2.setAttribute("y2", t2.rect[3] - t2.lineCoordinates[3]);
    s2.setAttribute("stroke-width", t2.borderStyle.width || 1);
    s2.setAttribute("stroke", "transparent");
    s2.setAttribute("fill", "transparent");
    n2.append(s2);
    this.container.append(n2);
    if (!t2.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    return this.container;
  }
  getElementsToTriggerPopup() {
    return this.#Co;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}
class SquareAnnotationElement extends AnnotationElement {
  #Eo = null;
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
  }
  render() {
    this.container.classList.add("squareAnnotation");
    const { data: t2, width: e2, height: i2 } = this, n2 = this.svgFactory.create(e2, i2, true), s2 = t2.borderStyle.width, r2 = this.#Eo = this.svgFactory.createElement("svg:rect");
    r2.setAttribute("x", s2 / 2);
    r2.setAttribute("y", s2 / 2);
    r2.setAttribute("width", e2 - s2);
    r2.setAttribute("height", i2 - s2);
    r2.setAttribute("stroke-width", s2 || 1);
    r2.setAttribute("stroke", "transparent");
    r2.setAttribute("fill", "transparent");
    n2.append(r2);
    this.container.append(n2);
    if (!t2.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    return this.container;
  }
  getElementsToTriggerPopup() {
    return this.#Eo;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}
class CircleAnnotationElement extends AnnotationElement {
  #So = null;
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
  }
  render() {
    this.container.classList.add("circleAnnotation");
    const { data: t2, width: e2, height: i2 } = this, n2 = this.svgFactory.create(e2, i2, true), s2 = t2.borderStyle.width, r2 = this.#So = this.svgFactory.createElement("svg:ellipse");
    r2.setAttribute("cx", e2 / 2);
    r2.setAttribute("cy", i2 / 2);
    r2.setAttribute("rx", e2 / 2 - s2 / 2);
    r2.setAttribute("ry", i2 / 2 - s2 / 2);
    r2.setAttribute("stroke-width", s2 || 1);
    r2.setAttribute("stroke", "transparent");
    r2.setAttribute("fill", "transparent");
    n2.append(r2);
    this.container.append(n2);
    if (!t2.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    return this.container;
  }
  getElementsToTriggerPopup() {
    return this.#So;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}
class PolylineAnnotationElement extends AnnotationElement {
  #To = null;
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
    this.containerClassName = "polylineAnnotation";
    this.svgElementName = "svg:polyline";
  }
  render() {
    this.container.classList.add(this.containerClassName);
    const { data: { rect: t2, vertices: e2, borderStyle: i2, popupRef: n2 }, width: s2, height: r2 } = this;
    if (!e2) return this.container;
    const a2 = this.svgFactory.create(s2, r2, true);
    let o2 = [];
    for (let i3 = 0, n3 = e2.length; i3 < n3; i3 += 2) {
      const n4 = e2[i3] - t2[0], s3 = t2[3] - e2[i3 + 1];
      o2.push(`${n4},${s3}`);
    }
    o2 = o2.join(" ");
    const l2 = this.#To = this.svgFactory.createElement(this.svgElementName);
    l2.setAttribute("points", o2);
    l2.setAttribute("stroke-width", i2.width || 1);
    l2.setAttribute("stroke", "transparent");
    l2.setAttribute("fill", "transparent");
    a2.append(l2);
    this.container.append(a2);
    if (!n2 && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    return this.container;
  }
  getElementsToTriggerPopup() {
    return this.#To;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}
class PolygonAnnotationElement extends PolylineAnnotationElement {
  constructor(t2) {
    super(t2);
    this.containerClassName = "polygonAnnotation";
    this.svgElementName = "svg:polygon";
  }
}
class CaretAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
  }
  render() {
    this.container.classList.add("caretAnnotation");
    if (!this.data.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    return this.container;
  }
}
class InkAnnotationElement extends AnnotationElement {
  #_o = null;
  #ko = [];
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
    this.containerClassName = "inkAnnotation";
    this.svgElementName = "svg:polyline";
    this.annotationEditorType = "InkHighlight" === this.data.it ? f.HIGHLIGHT : f.INK;
  }
  #Do(t2, e2) {
    switch (t2) {
      case 90:
        return { transform: `rotate(90) translate(${-e2[0]},${e2[1]}) scale(1,-1)`, width: e2[3] - e2[1], height: e2[2] - e2[0] };
      case 180:
        return { transform: `rotate(180) translate(${-e2[2]},${e2[1]}) scale(1,-1)`, width: e2[2] - e2[0], height: e2[3] - e2[1] };
      case 270:
        return { transform: `rotate(270) translate(${-e2[2]},${e2[3]}) scale(1,-1)`, width: e2[3] - e2[1], height: e2[2] - e2[0] };
      default:
        return { transform: `translate(${-e2[0]},${e2[3]}) scale(1,-1)`, width: e2[2] - e2[0], height: e2[3] - e2[1] };
    }
  }
  render() {
    this.container.classList.add(this.containerClassName);
    const { data: { rect: t2, rotation: e2, inkLists: i2, borderStyle: n2, popupRef: s2 } } = this, { transform: r2, width: a2, height: o2 } = this.#Do(e2, t2), l2 = this.svgFactory.create(a2, o2, true), h2 = this.#_o = this.svgFactory.createElement("svg:g");
    l2.append(h2);
    h2.setAttribute("stroke-width", n2.width || 1);
    h2.setAttribute("stroke-linecap", "round");
    h2.setAttribute("stroke-linejoin", "round");
    h2.setAttribute("stroke-miterlimit", 10);
    h2.setAttribute("stroke", "transparent");
    h2.setAttribute("fill", "transparent");
    h2.setAttribute("transform", r2);
    for (const t3 of i2) {
      const e3 = this.svgFactory.createElement(this.svgElementName);
      this.#ko.push(e3);
      e3.setAttribute("points", t3.join(","));
      h2.append(e3);
    }
    if (!s2 && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this.container.append(l2);
    this._editOnDoubleClick();
    return this.container;
  }
  updateEdited(t2) {
    super.updateEdited(t2);
    const { thickness: e2, points: i2, rect: n2 } = t2, s2 = this.#_o;
    e2 >= 0 && s2.setAttribute("stroke-width", e2 || 1);
    if (i2) for (let t3 = 0, e3 = this.#ko.length; t3 < e3; t3++) this.#ko[t3].setAttribute("points", i2[t3].join(","));
    if (n2) {
      const { transform: t3, width: e3, height: i3 } = this.#Do(this.data.rotation, n2);
      s2.parentElement.setAttribute("viewBox", `0 0 ${e3} ${i3}`);
      s2.setAttribute("transform", t3);
    }
  }
  getElementsToTriggerPopup() {
    return this.#ko;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}
class HighlightAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true, createQuadrilaterals: true });
    this.annotationEditorType = f.HIGHLIGHT;
  }
  render() {
    const { data: { overlaidText: t2, popupRef: e2 } } = this;
    if (!e2 && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this.container.classList.add("highlightAnnotation");
    this._editOnDoubleClick();
    if (t2) {
      const e3 = document.createElement("mark");
      e3.classList.add("overlaidText");
      e3.textContent = t2;
      this.container.append(e3);
    }
    return this.container;
  }
}
class UnderlineAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true, createQuadrilaterals: true });
  }
  render() {
    const { data: { overlaidText: t2, popupRef: e2 } } = this;
    if (!e2 && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this.container.classList.add("underlineAnnotation");
    if (t2) {
      const e3 = document.createElement("u");
      e3.classList.add("overlaidText");
      e3.textContent = t2;
      this.container.append(e3);
    }
    return this.container;
  }
}
class SquigglyAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true, createQuadrilaterals: true });
  }
  render() {
    const { data: { overlaidText: t2, popupRef: e2 } } = this;
    if (!e2 && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this.container.classList.add("squigglyAnnotation");
    if (t2) {
      const e3 = document.createElement("u");
      e3.classList.add("overlaidText");
      e3.textContent = t2;
      this.container.append(e3);
    }
    return this.container;
  }
}
class StrikeOutAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true, createQuadrilaterals: true });
  }
  render() {
    const { data: { overlaidText: t2, popupRef: e2 } } = this;
    if (!e2 && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this.container.classList.add("strikeoutAnnotation");
    if (t2) {
      const e3 = document.createElement("s");
      e3.classList.add("overlaidText");
      e3.textContent = t2;
      this.container.append(e3);
    }
    return this.container;
  }
}
class StampAnnotationElement extends AnnotationElement {
  constructor(t2) {
    super(t2, { isRenderable: true, ignoreBorder: true });
    this.annotationEditorType = f.STAMP;
  }
  render() {
    this.container.classList.add("stampAnnotation");
    this.container.setAttribute("role", "img");
    if (!this.data.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    }
    this._editOnDoubleClick();
    return this.container;
  }
}
class FileAttachmentAnnotationElement extends AnnotationElement {
  #Po = null;
  constructor(t2) {
    super(t2, { isRenderable: true });
    const { fileId: e2, file: i2 } = this.data;
    this.filename = i2.filename;
    this.content = i2.content;
    this.fileId = e2;
    this.linkService.eventBus?.dispatch("fileattachmentannotation", { source: this, attachmentId: this.fileId, ...i2 });
  }
  render() {
    this.container.classList.add("fileAttachmentAnnotation");
    const { container: t2, data: e2 } = this;
    let i2;
    if (e2.hasAppearance || 0 === e2.fillAlpha) i2 = document.createElement("div");
    else {
      i2 = document.createElement("img");
      i2.src = `${this.imageResourcesPath}annotation-${/paperclip/i.test(e2.name) ? "paperclip" : "pushpin"}.svg`;
      e2.fillAlpha && e2.fillAlpha < 1 && (i2.style = `filter: opacity(${Math.round(100 * e2.fillAlpha)}%);`);
    }
    i2.addEventListener("dblclick", this.#Mo.bind(this));
    this.#Po = i2;
    const { isMac: n2 } = FeatureTest.platform;
    t2.addEventListener("keydown", (t3) => {
      "Enter" === t3.key && (n2 ? t3.metaKey : t3.ctrlKey) && this.#Mo();
    });
    if (!e2.popupRef && this.hasPopupData) {
      this.hasOwnCommentButton = true;
      this._createPopup();
    } else i2.classList.add("popupTriggerArea");
    t2.append(i2);
    return t2;
  }
  getElementsToTriggerPopup() {
    return this.#Po;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
  async #Mo() {
    const { fileId: t2, filename: e2, content: i2 } = this, n2 = await this.linkService.getAttachmentContent(t2) || i2;
    n2 && this.downloadManager?.openOrDownloadData(n2, e2);
  }
}
class MediaAnnotationElement extends AnnotationElement {
  #L = new AbortController();
  #Io = null;
  #Fo = null;
  constructor(t2) {
    super(t2, { isRenderable: !!t2.data.richMedia });
  }
  render() {
    this.container.classList.add("mediaAnnotation");
    const { filename: t2 } = this.data.richMedia, e2 = document.createElement("button");
    e2.className = "mediaPlayButton";
    e2.type = "button";
    e2.title = e2.ariaLabel = t2;
    e2.addEventListener("click", () => this.#Bo(e2), { signal: this.#L.signal });
    this.container.append(e2);
    return this.container;
  }
  async #Bo(t2) {
    const { fileId: e2, filename: i2, contentType: n2 } = this.data.richMedia;
    t2.disabled = true;
    let s2;
    try {
      s2 = await this.linkService.getAttachmentContent(e2);
    } catch {
      return;
    } finally {
      t2.disabled = false;
    }
    if (!s2 || !t2.isConnected) return;
    const { signal: r2 } = this.#L, a2 = new Blob([s2], { type: n2 });
    if (!/^(?:video|audio)\//.test(a2.type)) return;
    const o2 = URL.createObjectURL(a2);
    this.#Io = o2;
    const l2 = a2.type.startsWith("audio/"), h2 = document.createElement(l2 ? "audio" : "video");
    this.#Fo = h2;
    h2.className = "mediaContent";
    this._setBackgroundColor(h2);
    h2.src = o2;
    h2.title = i2;
    h2.controls = true;
    h2.autoplay = true;
    h2.tabIndex = 0;
    if (l2) {
      let t3 = false, e3 = false;
      const updateControls = () => {
        h2.controls = t3 || e3;
      };
      this.container.addEventListener("pointerenter", () => {
        t3 = true;
        updateControls();
      }, { signal: r2 });
      this.container.addEventListener("pointerleave", () => {
        t3 = false;
        updateControls();
      }, { signal: r2 });
      this.container.addEventListener("focusin", () => {
        e3 = true;
        updateControls();
      }, { signal: r2 });
      this.container.addEventListener("focusout", () => {
        e3 = false;
        updateControls();
      }, { signal: r2 });
    }
    h2.addEventListener("emptied", () => this.#Oo(o2), { once: true, signal: r2 });
    t2.replaceWith(h2);
    h2.play().catch(() => {
    });
  }
  #Oo(t2 = this.#Io) {
    if (t2 && t2 === this.#Io) {
      URL.revokeObjectURL(t2);
      this.#Io = null;
    }
  }
  destroy() {
    this.#L.abort();
    if (this.#Fo) {
      this.#Fo.pause();
      this.#Fo.removeAttribute("src");
      this.#Fo.load();
      this.#Fo = null;
    }
    this.#Oo();
  }
}
class AnnotationLayer {
  #Ro = null;
  #Lo = null;
  #$ = null;
  #No = /* @__PURE__ */ new Map();
  #Uo = null;
  #Ho = null;
  #eo = [];
  #zo = false;
  zIndex = 0;
  constructor({ div: t2, accessibilityManager: e2, annotationCanvasMap: i2, annotationEditorUIManager: n2, page: s2, viewport: r2, structTreeLayer: a2, commentManager: o2, linkService: l2, annotationStorage: h2 }) {
    this.div = t2;
    this.#Ro = e2;
    this.#Lo = i2;
    this.#Uo = a2 || null;
    this.#Ho = l2 || null;
    this.#$ = h2 || new AnnotationStorage();
    this.page = s2;
    this.viewport = r2;
    this._annotationEditorUIManager = n2;
    this._commentManager = o2 || null;
  }
  hasEditableAnnotations() {
    return this.#No.size > 0;
  }
  async render(t2) {
    const { annotations: e2, optionalContentConfig: i2 } = t2, n2 = this.div;
    setLayerDimensions(n2, this.viewport);
    const s2 = /* @__PURE__ */ new Map(), r2 = [], a2 = { data: null, layer: n2, linkService: this.#Ho, downloadManager: t2.downloadManager, imageResourcesPath: t2.imageResourcesPath || "", renderForms: false !== t2.renderForms, svgFactory: new DOMSVGFactory(), annotationStorage: this.#$, enableComment: true === t2.enableComment, enableScripting: true === t2.enableScripting, hasJSActions: t2.hasJSActions, fieldObjects: t2.fieldObjects, parent: this, elements: null };
    for (const t3 of e2) {
      if (t3.noHTML) continue;
      const e3 = t3.annotationType === T.POPUP;
      if (e3) {
        const e4 = s2.get(t3.id);
        if (!e4) continue;
        if (!this._commentManager) {
          r2.push(t3);
          continue;
        }
        a2.elements = e4;
      } else if (t3.rect[2] === t3.rect[0] || t3.rect[3] === t3.rect[1]) continue;
      a2.data = t3;
      const n3 = AnnotationElementFactory.create(a2);
      if (!n3.isRenderable) continue;
      if (!e3) {
        this.#eo.push(n3);
        t3.popupRef && s2.getOrInsertComputed(t3.popupRef, makeArr).push(n3);
      }
      const o2 = n3.render();
      t3.hidden && (o2.style.visibility = "hidden");
      n3.updateOC(i2);
      if (n3._isEditable) {
        this.#No.set(n3.data.id, n3);
        this._annotationEditorUIManager?.renderAnnotationElement(n3);
      }
    }
    await this.#Go();
    for (const t3 of r2) {
      const e3 = a2.elements = s2.get(t3.id);
      a2.data = t3;
      const i3 = AnnotationElementFactory.create(a2);
      if (!i3.isRenderable) continue;
      const n3 = i3.render();
      i3.contentElement.id = `${g}${t3.id}`;
      t3.hidden && (n3.style.visibility = "hidden");
      e3.at(-1).container.after(n3);
    }
    this.#Vo();
  }
  async #Go() {
    if (0 === this.#eo.length) return;
    this.div.replaceChildren();
    const t2 = [];
    if (!this.#zo) {
      this.#zo = true;
      for (const { contentElement: e3, data: { hidden: i2, id: n2, oc: s2 } } of this.#eo) {
        const r2 = e3.id = `${g}${n2}`, a2 = "a" === e3.localName && !i2 && !s2;
        t2.push(this.#Uo?.getAriaAttributes(r2, { enableLinkOwnership: a2 }).then((t3) => {
          if (t3) for (const [i3, n3] of t3) e3.setAttribute(i3, n3);
        }));
      }
    }
    this.#eo.sort(({ data: { rect: [t3, e3, i2, n2] } }, { data: { rect: [s2, r2, a2, o2] } }) => {
      if (t3 === i2 && e3 === n2) return 1;
      if (s2 === a2 && r2 === o2) return -1;
      const l2 = (e3 + n2) / 2, h2 = (r2 + o2) / 2;
      if (l2 >= o2 && h2 <= e3) return -1;
      if (h2 >= n2 && l2 <= r2) return 1;
      return (t3 + i2) / 2 - (s2 + a2) / 2;
    });
    const e2 = document.createDocumentFragment();
    for (const t3 of this.#eo) {
      e2.append(t3.container);
      this._commentManager ? (t3.extraPopupElement?.popup || t3.popup)?.renderCommentButton() : t3.extraPopupElement && e2.append(t3.extraPopupElement.render());
    }
    this.div.append(e2);
    await Promise.all(t2);
    if (this.#Ro) {
      const t3 = await this.#Uo?.getAnnotationIds();
      for (const { contentElement: e3 } of this.#eo) t3?.has(e3.id) || this.#Ro.addPointerInTextLayer(e3, false);
    }
  }
  async addLinkAnnotations(t2) {
    const e2 = { data: null, layer: this.div, linkService: this.#Ho, svgFactory: new DOMSVGFactory(), parent: this };
    for (const i2 of t2) {
      i2.borderStyle ||= AnnotationLayer._defaultBorderStyle;
      e2.data = i2;
      const t3 = AnnotationElementFactory.create(e2);
      if (t3.isRenderable) {
        t3.render();
        t3.contentElement.id = `${g}${i2.id}`;
        this.#eo.push(t3);
      }
    }
    await this.#Go();
  }
  update({ viewport: t2, optionalContentConfig: e2 }) {
    const i2 = this.div;
    this.viewport = t2;
    setLayerDimensions(i2, { rotation: t2.rotation });
    for (const t3 of this.#eo) t3.updateOC(e2);
    this.#Vo();
    i2.hidden = false;
  }
  destroy() {
    for (const t2 of this.#eo) {
      t2.destroy?.();
      this.#Ro?.removePointerInTextLayer(t2.contentElement);
    }
    this.#eo.length = 0;
    this.#No.clear();
    this.div.replaceChildren();
  }
  #Vo() {
    if (!this.#Lo) return;
    const t2 = this.div;
    for (const [e2, i2] of this.#Lo) {
      const n2 = t2.querySelector(`[data-annotation-id="${e2}"]`);
      if (!n2) continue;
      if (Array.isArray(i2)) for (const t3 of i2) {
        t3.className = "annotationContent";
        t3.ariaHidden = true;
      }
      else {
        i2.className = "annotationContent";
        i2.ariaHidden = true;
      }
      const s2 = [];
      for (const t3 of n2.children) "CANVAS" === t3.nodeName && s2.push(t3);
      for (const t3 of s2) t3.remove();
      const r2 = Array.isArray(i2) ? i2[0] : i2, { firstChild: a2 } = n2;
      a2 ? a2.classList.contains("annotationContent") ? a2.after(r2) : a2.before(r2) : n2.append(r2);
      if (Array.isArray(i2)) {
        let t3 = r2;
        for (let e3 = 1, n3 = i2.length; e3 < n3; e3++) {
          t3.after(i2[e3]);
          t3 = i2[e3];
        }
      }
      this.#Lo.delete(e2);
      const o2 = this.#No.get(e2);
      if (o2) if (o2._hasNoCanvas) {
        this._annotationEditorUIManager?.setMissingCanvas(e2, n2.id, i2);
        o2._hasNoCanvas = false;
      } else o2.canvas = i2;
    }
  }
  refreshCanvases() {
    this.#Vo();
  }
  getEditableAnnotations() {
    return this.#No.values();
  }
  getEditableAnnotation(t2) {
    return this.#No.get(t2);
  }
  addFakeAnnotation(t2) {
    const { div: e2 } = this, { id: i2, rotation: n2 } = t2, s2 = new EditorAnnotationElement({ data: { id: i2, rect: t2.getPDFRect(), rotation: n2 }, editor: t2, layer: e2, parent: this, enableComment: !!this._commentManager, linkService: this.#Ho, annotationStorage: this.#$ });
    s2.render();
    s2.contentElement.id = `${g}${i2}`;
    s2.createOrUpdatePopup();
    this.#eo.push(s2);
    return s2;
  }
  removeAnnotation(t2) {
    const e2 = this.#eo.findIndex((e3) => e3.data.id === t2);
    if (e2 < 0) return;
    const [i2] = this.#eo.splice(e2, 1);
    this.#Ro?.removePointerInTextLayer(i2.contentElement);
  }
  updateFakeAnnotations(t2) {
    if (0 !== t2.length) {
      for (const e2 of t2) e2.updateFakeAnnotationElement(this);
      this.#Go();
    }
  }
  togglePointerEvents(t2 = false) {
    this.div.classList.toggle("disabled", !t2);
  }
  static get _defaultBorderStyle() {
    return shadow(this, "_defaultBorderStyle", Object.freeze({ width: 1, rawWidth: 1, style: _, dashArray: [3], horizontalCornerRadius: 0, verticalCornerRadius: 0 }));
  }
}
const zt = /\r\n?|\n/g;
class FreeTextEditor extends AnnotationEditor {
  #Wo = "";
  #$o = `${this.id}-editor`;
  #jo = null;
  #vo;
  _colorPicker = null;
  static _freeTextDefaultContent = "";
  static _internalPadding = 0;
  static _defaultColor = null;
  static _defaultFontSize = 10;
  static get _keyboardManager() {
    const t2 = FreeTextEditor.prototype, arrowChecker = (t3) => t3.isEmpty(), e2 = AnnotationEditorUIManager.TRANSLATE_SMALL, i2 = AnnotationEditorUIManager.TRANSLATE_BIG;
    return shadow(this, "_keyboardManager", new KeyboardManager([[["ctrl+s", "mac+meta+s", "ctrl+p", "mac+meta+p"], t2.commitOrRemove, { bubbles: true }], [["ctrl+Enter", "mac+meta+Enter"], t2.commitOrRemove], [["Escape"], t2.commitOrRemove], [["ArrowLeft"], t2._translateEmpty, { args: [-e2, 0], checker: arrowChecker }], [["ctrl+ArrowLeft", "mac+shift+ArrowLeft"], t2._translateEmpty, { args: [-i2, 0], checker: arrowChecker }], [["ArrowRight"], t2._translateEmpty, { args: [e2, 0], checker: arrowChecker }], [["ctrl+ArrowRight", "mac+shift+ArrowRight"], t2._translateEmpty, { args: [i2, 0], checker: arrowChecker }], [["ArrowUp"], t2._translateEmpty, { args: [0, -e2], checker: arrowChecker }], [["ctrl+ArrowUp", "mac+shift+ArrowUp"], t2._translateEmpty, { args: [0, -i2], checker: arrowChecker }], [["ArrowDown"], t2._translateEmpty, { args: [0, e2], checker: arrowChecker }], [["ctrl+ArrowDown", "mac+shift+ArrowDown"], t2._translateEmpty, { args: [0, i2], checker: arrowChecker }]]));
  }
  static _type = "freetext";
  static _editorType = f.FREETEXT;
  constructor(t2) {
    super({ ...t2, name: "freeTextEditor" });
    this.color = t2.color || FreeTextEditor._defaultColor || AnnotationEditor._defaultLineColor;
    this.#vo = t2.fontSize || FreeTextEditor._defaultFontSize;
    this.annotationElementId || this._uiManager.a11yAlert(AnnotationEditor._l10nAlert.freetext);
    this.canAddComment = false;
  }
  static initialize(t2, e2) {
    AnnotationEditor.initialize(t2, e2);
    const i2 = getComputedStyle(document.documentElement);
    this._internalPadding = parseFloat(i2.getPropertyValue("--freetext-padding"));
  }
  static updateDefaultParams(t2, e2) {
    switch (t2) {
      case b.FREETEXT_SIZE:
        FreeTextEditor._defaultFontSize = e2;
        break;
      case b.FREETEXT_COLOR:
        FreeTextEditor._defaultColor = e2;
    }
  }
  updateParams(t2, e2) {
    switch (t2) {
      case b.FREETEXT_SIZE:
        this.#Xo(e2);
        break;
      case b.FREETEXT_COLOR:
        this.#fo(e2);
    }
  }
  static get defaultPropertiesToUpdate() {
    return [[b.FREETEXT_SIZE, FreeTextEditor._defaultFontSize], [b.FREETEXT_COLOR, FreeTextEditor._defaultColor || AnnotationEditor._defaultLineColor]];
  }
  get propertiesToUpdate() {
    return [[b.FREETEXT_SIZE, this.#vo], [b.FREETEXT_COLOR, this.color]];
  }
  get toolbarButtons() {
    this._colorPicker ||= new BasicColorPicker(this);
    return [["colorPicker", this._colorPicker]];
  }
  get colorType() {
    return b.FREETEXT_COLOR;
  }
  #Xo(t2) {
    const setFontsize = (t3) => {
      this.editorDiv.style.fontSize = `calc(${t3}px * var(--total-scale-factor))`;
      this.translate(0, -(t3 - this.#vo) * this.parentScale);
      this.#vo = t3;
      this.#Ko();
    }, e2 = this.#vo;
    this.addCommands({ cmd: setFontsize.bind(this, t2), undo: setFontsize.bind(this, e2), post: this._uiManager.updateUI.bind(this._uiManager, this), mustExec: true, type: b.FREETEXT_SIZE, overwriteIfSameType: true, keepUndo: true });
  }
  onUpdatedColor() {
    this.editorDiv.style.color = this.color;
    this._colorPicker?.update(this.color);
    super.onUpdatedColor();
  }
  #fo(t2) {
    const setColor = (t3) => {
      this.color = t3;
      this.onUpdatedColor();
    }, e2 = this.color;
    this.addCommands({ cmd: setColor.bind(this, t2), undo: setColor.bind(this, e2), post: this._uiManager.updateUI.bind(this._uiManager, this), mustExec: true, type: b.FREETEXT_COLOR, overwriteIfSameType: true, keepUndo: true });
  }
  _translateEmpty(t2, e2) {
    this._uiManager.translateSelectedEditors(t2, e2, true);
  }
  getInitialTranslation() {
    const t2 = this.parentScale;
    return [-FreeTextEditor._internalPadding * t2, -(FreeTextEditor._internalPadding + this.#vo) * t2];
  }
  rebuild() {
    if (this.parent) {
      super.rebuild();
      null !== this.div && (this.isAttachedToDOM || this.parent.add(this));
    }
  }
  enableEditMode() {
    if (!super.enableEditMode()) return false;
    this.overlayDiv.classList.remove("enabled");
    this.editorDiv.contentEditable = true;
    this._isDraggable = false;
    this.div.removeAttribute("aria-activedescendant");
    this.#jo = new AbortController();
    const t2 = this._uiManager.combinedSignal(this.#jo);
    this.editorDiv.addEventListener("keydown", this.editorDivKeydown.bind(this), { signal: t2 });
    this.editorDiv.addEventListener("focus", this.editorDivFocus.bind(this), { signal: t2 });
    this.editorDiv.addEventListener("blur", this.editorDivBlur.bind(this), { signal: t2 });
    this.editorDiv.addEventListener("input", this.editorDivInput.bind(this), { signal: t2 });
    this.editorDiv.addEventListener("paste", this.editorDivPaste.bind(this), { signal: t2 });
    return true;
  }
  disableEditMode() {
    if (!super.disableEditMode()) return false;
    this.overlayDiv.classList.add("enabled");
    this.editorDiv.contentEditable = false;
    this.div.setAttribute("aria-activedescendant", this.#$o);
    this._isDraggable = true;
    this.#jo?.abort();
    this.#jo = null;
    this.div.focus({ preventScroll: true });
    this.isEditing = false;
    this.parent.div.classList.add("freetextEditing");
    return true;
  }
  focusin(t2) {
    if (this._focusEventsAllowed) {
      super.focusin(t2);
      t2.target !== this.editorDiv && this.editorDiv.focus();
    }
  }
  onceAdded(t2) {
    if (!this.width) {
      this.enableEditMode();
      t2 && this.editorDiv.focus();
      this._initialOptions?.isCentered && this.center();
      this._initialOptions = null;
    }
  }
  isEmpty() {
    return !this.editorDiv || "" === this.editorDiv.innerText.trim();
  }
  remove() {
    this.isEditing = false;
    if (this.parent) {
      this.parent.setEditingState(true);
      this.parent.div.classList.add("freetextEditing");
    }
    super.remove();
  }
  #Yo() {
    const t2 = [];
    this.editorDiv.normalize();
    let e2 = null;
    for (const i2 of this.editorDiv.childNodes) if (e2?.nodeType !== Node.TEXT_NODE || "BR" !== i2.nodeName) {
      t2.push(FreeTextEditor.#qo(i2));
      e2 = i2;
    }
    return t2.join("\n");
  }
  #Ko() {
    const [t2, e2] = this.parentDimensions;
    let i2;
    if (this.isAttachedToDOM) i2 = this.div.getBoundingClientRect();
    else {
      const { currentLayer: t3, div: e3 } = this, n2 = e3.style.display, s2 = e3.classList.contains("hidden");
      e3.classList.remove("hidden");
      e3.style.display = "hidden";
      t3.div.append(this.div);
      i2 = e3.getBoundingClientRect();
      e3.remove();
      e3.style.display = n2;
      e3.classList.toggle("hidden", s2);
    }
    if (this.rotation % 180 == this.parentRotation % 180) {
      this.width = i2.width / t2;
      this.height = i2.height / e2;
    } else {
      this.width = i2.height / t2;
      this.height = i2.width / e2;
    }
    this.fixAndSetPosition();
  }
  commit() {
    if (!this.isInEditMode()) return;
    super.commit();
    this.disableEditMode();
    const t2 = this.#Wo, e2 = this.#Wo = this.#Yo().trimEnd();
    if (t2 === e2) return;
    const setText = (t3) => {
      this.#Wo = t3;
      if (t3) {
        this.#Qo();
        this._uiManager.rebuild(this);
        this.#Ko();
      } else this.remove();
    };
    this.addCommands({ cmd: () => {
      setText(e2);
    }, undo: () => {
      setText(t2);
    }, mustExec: false });
    this.#Ko();
  }
  shouldGetKeyboardEvents() {
    return this.isInEditMode();
  }
  enterInEditMode() {
    this.enableEditMode();
    this.editorDiv.focus();
  }
  keydown(t2) {
    if (t2.target === this.div && "Enter" === t2.key) {
      this.enterInEditMode();
      t2.preventDefault();
    }
  }
  editorDivKeydown(t2) {
    FreeTextEditor._keyboardManager.exec(this, t2);
  }
  editorDivFocus(t2) {
    this.isEditing = true;
  }
  editorDivBlur(t2) {
    this.isEditing = false;
  }
  editorDivInput(t2) {
    this.parent.div.classList.toggle("freetextEditing", this.isEmpty());
  }
  disableEditing() {
    this.editorDiv.setAttribute("role", "comment");
    this.editorDiv.removeAttribute("aria-multiline");
  }
  enableEditing() {
    this.editorDiv.setAttribute("role", "textbox");
    this.editorDiv.setAttribute("aria-multiline", true);
  }
  get canChangeContent() {
    return true;
  }
  render() {
    if (this.div) return this.div;
    let t2, e2;
    if (this._isCopy || this.annotationElementId) {
      t2 = this.x;
      e2 = this.y;
    }
    super.render();
    this.editorDiv = document.createElement("div");
    this.editorDiv.className = "internal";
    this.editorDiv.setAttribute("id", this.#$o);
    this.editorDiv.setAttribute("data-l10n-id", "pdfjs-free-text2");
    this.editorDiv.setAttribute("data-l10n-attrs", "default-content");
    this.enableEditing();
    this.editorDiv.contentEditable = true;
    const { style: i2 } = this.editorDiv;
    i2.fontSize = `calc(${this.#vo}px * var(--total-scale-factor))`;
    i2.color = this.color;
    this.div.append(this.editorDiv);
    this.overlayDiv = document.createElement("div");
    this.overlayDiv.classList.add("overlay", "enabled");
    this.div.append(this.overlayDiv);
    if (this._isCopy || this.annotationElementId) {
      const [i3, n2] = this.parentDimensions;
      if (this.annotationElementId) {
        const { position: s2 } = this._initialData;
        let [r2, a2] = this.getInitialTranslation();
        [r2, a2] = this.pageTranslationToScreen(r2, a2);
        const [o2, l2] = this.pageDimensions, [h2, c2] = this.pageTranslation;
        let d2, u2;
        switch (this.rotation) {
          case 0:
            d2 = t2 + (s2[0] - h2) / o2;
            u2 = e2 + this.height - (s2[1] - c2) / l2;
            break;
          case 90:
            d2 = t2 + (s2[0] - h2) / o2;
            u2 = e2 - (s2[1] - c2) / l2;
            [r2, a2] = [a2, -r2];
            break;
          case 180:
            d2 = t2 - this.width + (s2[0] - h2) / o2;
            u2 = e2 - (s2[1] - c2) / l2;
            [r2, a2] = [-r2, -a2];
            break;
          case 270:
            d2 = t2 + (s2[0] - h2 - this.height * l2) / o2;
            u2 = e2 + (s2[1] - c2 - this.width * o2) / l2;
            [r2, a2] = [-a2, r2];
        }
        this.setAt(d2 * i3, u2 * n2, r2, a2);
      } else this._moveAfterPaste(t2, e2);
      this.#Qo();
      this._isDraggable = true;
      this.editorDiv.contentEditable = false;
    } else {
      this._isDraggable = false;
      this.editorDiv.contentEditable = true;
    }
    return this.div;
  }
  static #qo(t2) {
    return (t2.nodeType === Node.TEXT_NODE ? t2.nodeValue : t2.innerText).replaceAll(zt, "");
  }
  editorDivPaste(t2) {
    const e2 = t2.clipboardData || window.clipboardData, { types: i2 } = e2;
    if (1 === i2.length && "text/plain" === i2[0]) return;
    t2.preventDefault();
    const n2 = FreeTextEditor.#Jo(e2.getData("text") || "").replaceAll(zt, "\n");
    if (!n2) return;
    const s2 = window.getSelection();
    if (!s2.rangeCount) return;
    this.editorDiv.normalize();
    s2.deleteFromDocument();
    const r2 = s2.getRangeAt(0);
    if (!n2.includes("\n")) {
      r2.insertNode(document.createTextNode(n2));
      this.editorDiv.normalize();
      s2.collapseToStart();
      return;
    }
    const { startContainer: a2, startOffset: o2 } = r2, l2 = [], h2 = [];
    if (a2.nodeType === Node.TEXT_NODE) {
      const t3 = a2.parentElement;
      h2.push(a2.nodeValue.slice(o2).replaceAll(zt, ""));
      if (t3 !== this.editorDiv) {
        let e3 = l2;
        for (const i3 of this.editorDiv.childNodes) i3 !== t3 ? e3.push(FreeTextEditor.#qo(i3)) : e3 = h2;
      }
      l2.push(a2.nodeValue.slice(0, o2).replaceAll(zt, ""));
    } else if (a2 === this.editorDiv) {
      let t3 = l2, e3 = 0;
      for (const i3 of this.editorDiv.childNodes) {
        e3++ === o2 && (t3 = h2);
        t3.push(FreeTextEditor.#qo(i3));
      }
    }
    this.#Wo = `${l2.join("\n")}${n2}${h2.join("\n")}`;
    this.#Qo();
    const c2 = new Range();
    let d2 = Math.sumPrecise(l2.map((t3) => t3.length));
    for (const { firstChild: t3 } of this.editorDiv.childNodes) if (t3.nodeType === Node.TEXT_NODE) {
      const e3 = t3.nodeValue.length;
      if (d2 <= e3) {
        c2.setStart(t3, d2);
        c2.setEnd(t3, d2);
        break;
      }
      d2 -= e3;
    }
    s2.removeAllRanges();
    s2.addRange(c2);
  }
  #Qo() {
    this.editorDiv.replaceChildren();
    if (this.#Wo) for (const t2 of this.#Wo.split("\n")) {
      const e2 = document.createElement("div");
      e2.append(t2 ? document.createTextNode(t2) : document.createElement("br"));
      this.editorDiv.append(e2);
    }
  }
  #Zo() {
    return this.#Wo.replaceAll(" ", " ");
  }
  static #Jo(t2) {
    return t2.replaceAll(" ", " ");
  }
  get contentDiv() {
    return this.editorDiv;
  }
  getPDFRect() {
    const t2 = FreeTextEditor._internalPadding * this.parentScale;
    return this.getRect(t2, t2);
  }
  static async deserialize(t2, e2, i2) {
    let n2 = null;
    if (t2 instanceof FreeTextAnnotationElement) {
      const { data: { defaultAppearanceData: { fontSize: e3, fontColor: i3 }, rect: s3, rotation: r2, id: a2, popupRef: o2, richText: l2, contentsObj: h2, creationDate: c2, modificationDate: d2 }, textContent: u2, textPosition: p2, parent: { page: { pageNumber: g2 } } } = t2;
      if (!u2?.length) return null;
      n2 = t2 = { annotationType: f.FREETEXT, color: Array.from(i3), fontSize: e3, value: u2.join("\n"), position: p2, pageIndex: g2 - 1, rect: s3.slice(0), rotation: r2, annotationElementId: a2, id: a2, deleted: false, popupRef: o2, comment: h2?.str || null, richText: l2, creationDate: c2, modificationDate: d2 };
    }
    const s2 = await super.deserialize(t2, e2, i2);
    s2.#vo = t2.fontSize;
    s2.color = Util.makeHexColor(...t2.color);
    s2.#Wo = FreeTextEditor.#Jo(t2.value);
    s2._initialData = n2;
    t2.comment && s2.setCommentData(t2);
    return s2;
  }
  serialize(t2 = false) {
    if (this.isEmpty()) return null;
    if (this.deleted) return this.serializeDeleted();
    const e2 = AnnotationEditor._colorManager.convert(this.isAttachedToDOM ? getComputedStyle(this.editorDiv).color : this.color), i2 = Object.assign(super.serialize(t2), { color: e2, fontSize: this.#vo, value: this.#Zo() });
    this.addComment(i2);
    if (t2) {
      i2.isCopy = true;
      return i2;
    }
    if (this.annotationElementId && !this.#tl(i2)) return null;
    i2.id = this.annotationElementId;
    return i2;
  }
  #tl(t2) {
    const { value: e2, fontSize: i2, color: n2, pageIndex: s2 } = this._initialData;
    return this.hasEditedComment || this._hasBeenMoved || t2.value !== e2 || t2.fontSize !== i2 || t2.color.some((t3, e3) => t3 !== n2[e3]) || t2.pageIndex !== s2;
  }
  renderAnnotationElement(t2) {
    const e2 = super.renderAnnotationElement(t2);
    if (!e2) return null;
    const { style: i2 } = e2;
    i2.fontSize = `calc(${this.#vo}px * var(--total-scale-factor))`;
    i2.color = this.color;
    e2.replaceChildren();
    for (const t3 of this.#Wo.split("\n")) {
      const i3 = document.createElement("div");
      i3.append(t3 ? document.createTextNode(t3) : document.createElement("br"));
      e2.append(i3);
    }
    t2.updateEdited({ rect: this.getPDFRect(), popup: this._uiManager.hasCommentManager() || this.hasEditedComment ? this.comment : { text: this.#Wo } });
    return e2;
  }
  resetAnnotationElement(t2) {
    super.resetAnnotationElement(t2);
    t2.resetEdited();
  }
}
class DrawingOptions {
  #el = /* @__PURE__ */ Object.create(null);
  updateProperty(t2, e2) {
    this[t2] = e2;
    this.updateSVGProperty(t2, e2);
  }
  updateProperties(t2) {
    if (t2) for (const [e2, i2] of Object.entries(t2)) e2.startsWith("_") || this.updateProperty(e2, i2);
  }
  updateSVGProperty(t2, e2) {
    this.#el[t2] = e2;
  }
  toSVGProperties() {
    const t2 = this.#el;
    this.#el = /* @__PURE__ */ Object.create(null);
    return { root: t2 };
  }
  reset() {
    this.#el = /* @__PURE__ */ Object.create(null);
  }
  updateAll(t2 = this) {
    this.updateProperties(t2);
  }
  clone() {
    unreachable("Not implemented");
  }
}
class DrawingEditor extends AnnotationEditor {
  #il = null;
  #nl;
  _clipPathId = null;
  _colorPicker = null;
  _drawId = null;
  _drawOutlines = null;
  _focusDrawId = null;
  static _currentDrawId = -1;
  static _currentParent = null;
  static #sl = null;
  static #rl = null;
  static #al = null;
  static #ol = null;
  static _INNER_MARGIN = 3;
  constructor(t2) {
    super(t2);
    this.#nl = t2.mustBeCommitted || false;
    this._addOutlines(t2);
  }
  onUpdatedColor() {
    this._colorPicker?.update(this.color);
    super.onUpdatedColor();
  }
  onUpdatedOpacity() {
    this._colorPicker?.updateOpacity?.(this.opacity);
  }
  _addOutlines(t2) {
    if (t2.drawOutlines) {
      this.#ll(t2);
      this.#hl();
    }
  }
  #ll({ drawOutlines: t2, drawId: e2, drawingOptions: i2, clipPathId: n2 }) {
    this._drawOutlines = t2;
    this._drawingOptions ||= i2;
    this.annotationElementId || this._uiManager.a11yAlert(AnnotationEditor._l10nAlert[this.editorType]);
    if (e2 >= 0) {
      this._drawId = e2;
      this._clipPathId = n2 ?? null;
      this.parent.drawLayer.finalizeDraw(e2, t2.defaultProperties);
      this.#cl(this.parent);
    } else this._drawId = this.#dl(t2, this.parent);
    this.#ul(t2.box);
  }
  #dl(t2, e2) {
    const { id: i2, clipPathId: n2 } = e2.drawLayer.draw(DrawingEditor._mergeSVGProperties(this._drawingOptions.toSVGProperties(), t2.defaultSVGProperties), false, this.constructor._hasClipPath);
    this.constructor._hasClipPath && (this._clipPathId = n2);
    this.#cl(e2);
    return i2;
  }
  #cl(t2) {
    const e2 = this._drawOutlines.getFocusSVGProperties(this.#pl);
    e2 && (this._focusDrawId = t2.drawLayer.drawOutline(e2, this._drawOutlines.focusMustRemoveSelfIntersections));
  }
  #gl(t2 = this.#pl) {
    null !== this._focusDrawId && this.parent?.drawLayer.updateProperties(this._focusDrawId, this._drawOutlines.getFocusSVGProperties(t2));
  }
  #ml(t2) {
    null !== this._focusDrawId && this.parent?.drawLayer.updateProperties(this._focusDrawId, { rootClass: t2 });
  }
  #fl() {
    const { parent: t2, _drawId: e2, _focusDrawId: i2, _isVisible: n2 } = this;
    if (!t2 || null === e2) return;
    const s2 = { hidden: !n2 };
    t2.drawLayer.updateProperties(e2, { rootClass: s2 });
    null !== i2 && t2.drawLayer.updateProperties(i2, { rootClass: s2 });
  }
  static _mergeSVGProperties(t2, e2) {
    const i2 = new Set(Object.keys(t2));
    for (const [n2, s2] of Object.entries(e2)) i2.has(n2) ? Object.assign(t2[n2], s2) : t2[n2] = s2;
    return t2;
  }
  static getDefaultDrawingOptions(t2) {
    unreachable("Not implemented");
  }
  static get typesMap() {
    unreachable("Not implemented");
  }
  static get isDrawer() {
    return true;
  }
  static get _hasClipPath() {
    return false;
  }
  static get _hasDrawClass() {
    return true;
  }
  static get supportMultipleDrawings() {
    return false;
  }
  get _drawRotation() {
    return this.rotation;
  }
  get _opacityName() {
    return this.constructor.typesMap.get(this.opacityType);
  }
  get #pl() {
    return (this.parentRotation - this._drawRotation + 360) % 360;
  }
  static updateDefaultParams(t2, e2) {
    const i2 = this.typesMap.get(t2);
    i2 && this._defaultDrawingOptions.updateProperty(i2, e2);
    if (this._currentParent) {
      DrawingEditor.#sl.updateProperty(i2, e2);
      this._currentParent.drawLayer.updateProperties(this._currentDrawId, this._defaultDrawingOptions.toSVGProperties());
    }
  }
  updateParams(t2, e2) {
    const i2 = this.constructor.typesMap.get(t2);
    i2 && this._updateProperty(t2, i2, e2);
  }
  static get defaultPropertiesToUpdate() {
    const t2 = [], e2 = this._defaultDrawingOptions;
    for (const [i2, n2] of this.typesMap) t2.push([i2, e2[n2]]);
    return t2;
  }
  get propertiesToUpdate() {
    const t2 = [], { _drawingOptions: e2 } = this;
    for (const [i2, n2] of this.constructor.typesMap) t2.push([i2, e2[n2]]);
    return t2;
  }
  _updateProperty(t2, e2, i2) {
    const n2 = this._drawingOptions, s2 = n2[e2], setter = (i3) => {
      n2.updateProperty(e2, i3);
      const s3 = this._drawOutlines.updateProperty(e2, i3);
      s3 && this.#ul(s3);
      this.parent?.drawLayer.updateProperties(this._drawId, n2.toSVGProperties());
      t2 === this.colorType ? this.onUpdatedColor() : t2 === this.opacityType && this.onUpdatedOpacity();
    };
    this.addCommands({ cmd: setter.bind(this, i2), undo: setter.bind(this, s2), post: this._uiManager.updateUI.bind(this._uiManager, this), mustExec: true, type: t2, overwriteIfSameType: true, keepUndo: true });
  }
  _updateColorAndOpacity(t2, e2, i2 = this.colorAndOpacityType) {
    const n2 = this.constructor.typesMap.get(this.colorType), s2 = this._opacityName, r2 = this._drawingOptions, a2 = r2[n2], o2 = r2[s2], setter = (t3, e3) => {
      r2.updateProperty(n2, t3);
      r2.updateProperty(s2, e3);
      this._drawOutlines.updateProperty(n2, t3);
      this._drawOutlines.updateProperty(s2, e3);
      this.parent?.drawLayer.updateProperties(this._drawId, r2.toSVGProperties());
      this.onUpdatedColor();
      this.onUpdatedOpacity();
    };
    this.addCommands({ cmd: setter.bind(this, t2, e2), undo: setter.bind(this, a2, o2), post: this._uiManager.updateUI.bind(this._uiManager, this), mustExec: true, type: i2, overwriteIfSameType: true, keepUndo: true });
  }
  _onResizing() {
    this.parent?.drawLayer.updateProperties(this._drawId, DrawingEditor._mergeSVGProperties(this._drawOutlines.getPathResizingSVGProperties(this.#bl()), { bbox: this.#yl() }));
  }
  _onResized() {
    this.parent?.drawLayer.updateProperties(this._drawId, DrawingEditor._mergeSVGProperties(this._drawOutlines.getPathResizedSVGProperties(this.#bl()), { bbox: this.#yl() }));
    this.#gl();
  }
  _onTranslating(t2, e2) {
    this.parent?.drawLayer.updateProperties(this._drawId, { bbox: this.#yl() });
  }
  _onTranslated() {
    this.parent?.drawLayer.updateProperties(this._drawId, DrawingEditor._mergeSVGProperties(this._drawOutlines.getPathTranslatedSVGProperties(this.#bl(), this.parentDimensions), { bbox: this.#yl() }));
  }
  _onStartDragging() {
    this.parent?.drawLayer.updateProperties(this._drawId, { rootClass: { moving: true } });
  }
  _onStopDragging() {
    this.parent?.drawLayer.updateProperties(this._drawId, { rootClass: { moving: false } });
  }
  get _mustBeDisabledOnCommit() {
    return true;
  }
  commit() {
    super.commit();
    if (this._mustBeDisabledOnCommit) {
      this.disableEditMode();
      this.disableEditing();
    }
  }
  disableEditing() {
    super.disableEditing();
    this.div.classList.toggle("disabled", true);
  }
  enableEditing() {
    super.enableEditing();
    this.div.classList.toggle("disabled", false);
  }
  getBaseTranslation() {
    return [0, 0];
  }
  get isResizable() {
    return true;
  }
  onceAdded(t2) {
    this.annotationElementId || this.parent.addUndoableEditor(this);
    this._isDraggable = true;
    if (this.#nl) {
      this.#nl = false;
      this.commit();
      this.parent.setSelected(this);
      t2 && this.isOnScreen && this.div.focus();
    }
  }
  remove() {
    this._uiManager.removeShouldRescale(this);
    this.#vl();
    super.remove();
  }
  rebuild() {
    if (this.parent) {
      super.rebuild();
      if (null !== this.div) {
        this.#hl();
        this.#ul(this._drawOutlines.box);
        this.isAttachedToDOM || this.parent.add(this);
      }
    }
  }
  setParent(t2) {
    let e2 = false;
    if (this.parent && !t2) {
      this._uiManager.removeShouldRescale(this);
      this.#vl();
    } else if (t2) {
      this._uiManager.addShouldRescale(this);
      this.#hl(t2);
      e2 = !this.parent && this.div?.classList.contains("selectedEditor");
    }
    super.setParent(t2);
    this.#fl();
    e2 && this.select();
  }
  #vl() {
    if (null === this._drawId || !this.parent) return;
    const { drawLayer: t2 } = this.parent;
    t2.remove(this._drawId);
    this._drawId = null;
    if (null !== this._focusDrawId) {
      t2.remove(this._focusDrawId);
      this._focusDrawId = null;
    }
    this._drawingOptions.reset();
  }
  #hl(t2 = this.parent) {
    if (null === this._drawId || this.parent !== t2) {
      if (null !== this._drawId) {
        const { drawLayer: e2 } = this.parent;
        e2.updateParent(this._drawId, t2.drawLayer);
        null !== this._focusDrawId && e2.updateParent(this._focusDrawId, t2.drawLayer);
        return;
      }
      this._drawingOptions.updateAll();
      this._drawId = this.#dl(this._drawOutlines, t2);
      this._clipPathId && this.#il && (this.#il.style.clipPath = this._clipPathId);
    }
  }
  #wl([t2, e2, i2, n2]) {
    const { parentDimensions: [s2, r2], _drawRotation: a2 } = this;
    switch (a2) {
      case 90:
        return [e2, 1 - t2, i2 * (r2 / s2), n2 * (s2 / r2)];
      case 180:
        return [1 - t2, 1 - e2, i2, n2];
      case 270:
        return [1 - e2, t2, i2 * (r2 / s2), n2 * (s2 / r2)];
      default:
        return [t2, e2, i2, n2];
    }
  }
  #bl() {
    const { x: t2, y: e2, width: i2, height: n2, parentDimensions: [s2, r2], _drawRotation: a2 } = this;
    switch (a2) {
      case 90:
        return [1 - e2, t2, i2 * (s2 / r2), n2 * (r2 / s2)];
      case 180:
        return [1 - t2, 1 - e2, i2, n2];
      case 270:
        return [e2, 1 - t2, i2 * (s2 / r2), n2 * (r2 / s2)];
      default:
        return [t2, e2, i2, n2];
    }
  }
  #ul(t2) {
    [this.x, this.y, this.width, this.height] = this.#wl(t2);
    if (this.div) {
      this.fixAndSetPosition();
      this.setDims();
    }
    this._onResized();
  }
  #yl(t2 = this.parentRotation) {
    const { x: e2, y: i2, width: n2, height: s2, _drawRotation: r2, parentDimensions: [a2, o2] } = this;
    switch ((4 * r2 + t2) / 90) {
      case 1:
        return [1 - i2 - s2, e2, s2, n2];
      case 2:
        return [1 - e2 - n2, 1 - i2 - s2, n2, s2];
      case 3:
        return [i2, 1 - e2 - n2, s2, n2];
      case 4:
        return [e2, i2 - n2 * (a2 / o2), s2 * (o2 / a2), n2 * (a2 / o2)];
      case 5:
        return [1 - i2, e2, n2 * (a2 / o2), s2 * (o2 / a2)];
      case 6:
        return [1 - e2 - s2 * (o2 / a2), 1 - i2, s2 * (o2 / a2), n2 * (a2 / o2)];
      case 7:
        return [i2 - n2 * (a2 / o2), 1 - e2 - s2 * (o2 / a2), n2 * (a2 / o2), s2 * (o2 / a2)];
      case 8:
        return [e2 - n2, i2 - s2, n2, s2];
      case 9:
        return [1 - i2, e2 - n2, s2, n2];
      case 10:
        return [1 - e2, 1 - i2, n2, s2];
      case 11:
        return [i2 - s2, 1 - e2, s2, n2];
      case 12:
        return [e2 - s2 * (o2 / a2), i2, s2 * (o2 / a2), n2 * (a2 / o2)];
      case 13:
        return [1 - i2 - n2 * (a2 / o2), e2 - s2 * (o2 / a2), n2 * (a2 / o2), s2 * (o2 / a2)];
      case 14:
        return [1 - e2, 1 - i2 - n2 * (a2 / o2), s2 * (o2 / a2), n2 * (a2 / o2)];
      case 15:
        return [i2, 1 - e2, n2 * (a2 / o2), s2 * (o2 / a2)];
      default:
        return [e2, i2, n2, s2];
    }
  }
  rotate(t2 = this.parentRotation) {
    if (!this.parent || null === this._drawId) return;
    const e2 = (t2 - this._drawRotation + 360) % 360;
    this.parent.drawLayer.updateProperties(this._drawId, DrawingEditor._mergeSVGProperties({ bbox: this.#yl(t2) }, this._drawOutlines.updateRotation(e2)));
    this.#gl(e2);
  }
  show(t2 = this._isVisible) {
    super.show(t2);
    this.#fl();
  }
  select() {
    super.select();
    this.#ml({ hovered: false, selected: true });
  }
  unselect() {
    super.unselect();
    this.#ml({ selected: false });
  }
  pointerover() {
    this.isSelected || this.#ml({ hovered: true });
  }
  pointerleave() {
    this.isSelected || this.#ml({ hovered: false });
  }
  onScaleChanging() {
    if (!this.parent) return;
    const t2 = this._drawOutlines.updateParentDimensions(this.parentDimensions, this.parent.scale);
    t2 && this.#ul(t2);
  }
  static onScaleChangingWhenDrawing() {
  }
  render() {
    if (this.div) return this.div;
    let t2, e2;
    if (this._isCopy) {
      t2 = this.x;
      e2 = this.y;
    }
    const i2 = super.render();
    this.constructor._hasDrawClass && i2.classList.add("draw");
    const n2 = this.#il = document.createElement("div");
    i2.append(n2);
    n2.setAttribute("aria-hidden", "true");
    n2.className = "internal";
    this._clipPathId && (n2.style.clipPath = this._clipPathId);
    bindEvents(this, n2, ["pointerover", "pointerleave"]);
    this.setDims();
    this._uiManager.addShouldRescale(this);
    this.disableEditing();
    this._isCopy && this._moveAfterPaste(t2, e2);
    return i2;
  }
  static createDrawerInstance(t2) {
    unreachable("Not implemented");
  }
  static _getDrawingTarget(t2, { target: e2 }) {
    return e2;
  }
  static _getPointerCoords({ offsetX: t2, offsetY: e2, clientX: i2, clientY: n2 }, s2 = null) {
    if (!s2) return [t2, e2];
    let r2 = i2 - s2.clientX, a2 = n2 - s2.clientY;
    switch (this._currentParent.viewport.rotation) {
      case 90:
        [r2, a2] = [a2, -r2];
        break;
      case 180:
        [r2, a2] = [-r2, -a2];
        break;
      case 270:
        [r2, a2] = [-a2, r2];
    }
    return [s2.offsetX + r2, s2.offsetY + a2];
  }
  static _addDrawingListeners(t2, e2) {
  }
  static _endDrawingSession(t2 = false) {
    return this._currentParent.endDrawingSession(t2);
  }
  static startDrawing(t2, e2, i2, n2) {
    const { pointerId: s2, pointerType: r2 } = n2;
    if (CurrentPointers.isInitializedAndDifferentPointerType(r2)) return;
    const a2 = this._getDrawingTarget(t2, n2), [o2, l2] = this._getPointerCoords(n2), { viewport: { rotation: h2 } } = t2, { x: c2, y: d2, width: u2, height: p2 } = a2.getBoundingClientRect(), g2 = DrawingEditor.#rl = new AbortController(), m2 = t2.combinedSignal(g2);
    CurrentPointers.setPointer(r2, s2);
    window.addEventListener("pointerup", (t3) => {
      CurrentPointers.isSamePointerIdOrRemove(t3.pointerId) && this._endDraw(t3);
    }, { signal: m2 });
    window.addEventListener("pointercancel", (t3) => {
      CurrentPointers.isSamePointerIdOrRemove(t3.pointerId) && this._endDrawingSession();
    }, { signal: m2 });
    window.addEventListener("pointerdown", (t3) => {
      if (CurrentPointers.isSamePointerType(t3.pointerType)) {
        CurrentPointers.initializeAndAddPointerId(t3.pointerId);
        if (DrawingEditor.#sl.isCancellable()) {
          DrawingEditor.#sl.removeLastElement();
          DrawingEditor.#sl.isEmpty() ? this._endDrawingSession(true) : this._endDraw(null);
        }
      }
    }, { capture: true, passive: false, signal: m2 });
    window.addEventListener("contextmenu", noContextMenu, { signal: m2 });
    a2.addEventListener("pointermove", this._drawMove.bind(this), { signal: m2 });
    a2.addEventListener("touchmove", (t3) => {
      CurrentPointers.isSameTimeStamp(t3.timeStamp) && stopEvent(t3);
    }, { signal: m2 });
    this._addDrawingListeners(a2, m2);
    t2.toggleDrawing();
    e2._editorUndoBar?.hide();
    if (DrawingEditor.#sl) {
      t2.drawLayer.updateProperties(this._currentDrawId, DrawingEditor.#sl.startNew(o2, l2, u2, p2, h2));
      return;
    }
    e2.updateUIForDefaultProperties(this);
    DrawingEditor.#sl = this.createDrawerInstance({ x: o2, y: l2, box: [c2, d2, u2, p2], rotation: h2, parent: t2, isLTR: i2 });
    DrawingEditor.#al = this.getDefaultDrawingOptions();
    this._currentParent = t2;
    const { id: f2, clipPathId: b2 } = t2.drawLayer.draw(this._mergeSVGProperties(DrawingEditor.#al.toSVGProperties(), DrawingEditor.#sl.defaultSVGProperties), true, this._hasClipPath);
    this._currentDrawId = f2;
    DrawingEditor.#ol = this._hasClipPath ? b2 : null;
  }
  static _drawMove(t2) {
    CurrentPointers.isSameTimeStamp(t2.timeStamp);
    if (!DrawingEditor.#sl || !CurrentPointers.isSamePointerId(t2.pointerId)) return;
    if (CurrentPointers.isUsingMultiplePointers()) {
      this._endDraw(t2);
      return;
    }
    let e2;
    const i2 = t2.getCoalescedEvents?.();
    if (i2?.length) {
      const n2 = [];
      for (const e3 of i2) n2.push(...this._getPointerCoords(e3, t2));
      e2 = DrawingEditor.#sl.addPoints(n2);
    } else e2 = DrawingEditor.#sl.add(...this._getPointerCoords(t2));
    this._currentParent.drawLayer.updateProperties(this._currentDrawId, e2);
    CurrentPointers.setTimeStamp(t2.timeStamp);
    stopEvent(t2);
  }
  static _cleanup(t2) {
    if (t2) {
      this._currentDrawId = -1;
      this._currentParent = null;
      DrawingEditor.#sl = null;
      DrawingEditor.#al = null;
      DrawingEditor.#ol = null;
      CurrentPointers.clearTimeStamp();
    }
    if (DrawingEditor.#rl) {
      DrawingEditor.#rl.abort();
      DrawingEditor.#rl = null;
      CurrentPointers.clearPointerIds();
    }
  }
  static _endDraw(t2) {
    const e2 = this._currentParent;
    if (e2) {
      e2.toggleDrawing(true);
      this._cleanup(false);
      e2.drawLayer.updateProperties(this._currentDrawId, t2?.target === e2.div ? DrawingEditor.#sl.end(...this._getPointerCoords(t2)) : DrawingEditor.#sl.end());
      if (this.supportMultipleDrawings) {
        const t3 = DrawingEditor.#sl, i2 = this._currentDrawId, n2 = t3.getLastElement();
        e2.addCommands({ cmd: () => {
          e2.drawLayer.updateProperties(i2, t3.setLastElement(n2));
        }, undo: () => {
          e2.drawLayer.updateProperties(i2, t3.removeLastElement());
        }, mustExec: false, type: b.DRAW_STEP });
        return;
      }
      this.endDrawing(false);
    }
  }
  static endDrawing(t2) {
    const e2 = this._currentParent;
    if (!e2) return null;
    e2.toggleDrawing(true);
    e2.cleanUndoStack(b.DRAW_STEP);
    if (!DrawingEditor.#sl.isEmpty()) {
      const { pageDimensions: [i2, n2], scale: s2 } = e2, r2 = e2.createAndAddNewEditor({ offsetX: 0, offsetY: 0 }, false, { drawId: this._currentDrawId, clipPathId: DrawingEditor.#ol, drawOutlines: DrawingEditor.#sl.getOutlines(i2 * s2, n2 * s2, s2, this._INNER_MARGIN), drawingOptions: DrawingEditor.#al, mustBeCommitted: !t2 });
      this._cleanup(true);
      return r2;
    }
    e2.drawLayer.remove(this._currentDrawId);
    this._cleanup(true);
    return null;
  }
  createDrawingOptions(t2) {
  }
  static deserializeDraw(t2, e2, i2, n2, s2, r2, a2) {
    unreachable("Not implemented");
  }
  static async deserialize(t2, e2, i2) {
    const { rawDims: { pageWidth: n2, pageHeight: s2, pageX: r2, pageY: a2 } } = e2.viewport, o2 = this.deserializeDraw(r2, a2, n2, s2, this._INNER_MARGIN, t2, i2), l2 = await super.deserialize(t2, e2, i2);
    l2.createDrawingOptions(t2);
    l2.#ll({ drawOutlines: o2 });
    l2.#hl();
    l2.onScaleChanging();
    l2.rotate();
    return l2;
  }
  serializeDraw(t2) {
    const [e2, i2] = this.pageTranslation, [n2, s2] = this.pageDimensions;
    return this._drawOutlines.serialize([e2, i2, n2, s2], t2);
  }
  renderAnnotationElement(t2) {
    t2.updateEdited({ rect: this.getPDFRect() });
    return null;
  }
  static canCreateNewEmptyEditor() {
    return false;
  }
}
class Outline {
  static PRECISION = 1e-4;
  focusOutline = null;
  toSVGPath() {
    unreachable("Abstract method `toSVGPath` must be implemented.");
  }
  get box() {
    unreachable("Abstract getter `box` must be implemented.");
  }
  serialize(t2, e2) {
    unreachable("Abstract method `serialize` must be implemented.");
  }
  get defaultSVGProperties() {
    unreachable("Abstract getter `defaultSVGProperties` must be implemented.");
  }
  get defaultProperties() {
    return this.defaultSVGProperties;
  }
  getFocusSVGProperties(t2) {
    return null;
  }
  get focusMustRemoveSelfIntersections() {
    return false;
  }
  updateProperty(t2, e2) {
    return null;
  }
  updateParentDimensions(t2, e2) {
    return null;
  }
  serializeQuadPoints(t2, e2) {
    return null;
  }
  updateRotation(t2) {
    return {};
  }
  getPathResizingSVGProperties(t2) {
    return {};
  }
  getPathResizedSVGProperties(t2) {
    return {};
  }
  getPathTranslatedSVGProperties(t2, e2) {
    return {};
  }
  static _rotateBox([t2, e2, i2, n2], s2) {
    switch (s2) {
      case 90:
        return [1 - e2 - n2, t2, n2, i2];
      case 180:
        return [1 - t2 - i2, 1 - e2 - n2, i2, n2];
      case 270:
        return [e2, 1 - t2 - i2, n2, i2];
    }
    return [t2, e2, i2, n2];
  }
  static _rescale(t2, e2, i2, n2, s2, r2) {
    r2 ||= new Float32Array(t2.length);
    for (let a2 = 0, o2 = t2.length; a2 < o2; a2 += 2) {
      r2[a2] = e2 + t2[a2] * n2;
      r2[a2 + 1] = i2 + t2[a2 + 1] * s2;
    }
    return r2;
  }
  static _rescaleAndSwap(t2, e2, i2, n2, s2, r2) {
    r2 ||= new Float32Array(t2.length);
    for (let a2 = 0, o2 = t2.length; a2 < o2; a2 += 2) {
      r2[a2] = e2 + t2[a2 + 1] * n2;
      r2[a2 + 1] = i2 + t2[a2] * s2;
    }
    return r2;
  }
  static _translate(t2, e2, i2, n2) {
    n2 ||= new Float32Array(t2.length);
    for (let s2 = 0, r2 = t2.length; s2 < r2; s2 += 2) {
      n2[s2] = e2 + t2[s2];
      n2[s2 + 1] = i2 + t2[s2 + 1];
    }
    return n2;
  }
  static svgRound(t2) {
    return Math.round(1e4 * t2);
  }
  static _normalizePoint(t2, e2, i2, n2, s2) {
    switch (s2) {
      case 90:
        return [1 - e2 / i2, t2 / n2];
      case 180:
        return [1 - t2 / i2, 1 - e2 / n2];
      case 270:
        return [e2 / i2, 1 - t2 / n2];
      default:
        return [t2 / i2, e2 / n2];
    }
  }
  static createBezierPoints(t2, e2, i2, n2, s2, r2) {
    return [(t2 + 5 * i2) / 6, (e2 + 5 * n2) / 6, (5 * i2 + s2) / 6, (5 * n2 + r2) / 6, (i2 + s2) / 2, (n2 + r2) / 2];
  }
}
class FreeDrawOutliner {
  #Al;
  #xl = [];
  #Cl;
  #El;
  #Sl = [];
  #Tl = new Float32Array(18);
  #_l;
  #kl;
  #Dl;
  #Pl;
  #Ml;
  #Il;
  #Fl = [];
  static #Bl = 8;
  static #Ol = 2;
  static #Rl = FreeDrawOutliner.#Bl + FreeDrawOutliner.#Ol;
  constructor(t2, e2, i2, n2, s2, r2, a2 = 0) {
    this.#Al = i2;
    this.#Il = s2 * n2;
    this.#El = r2;
    this.#Tl.set([NaN, NaN, NaN, NaN, t2, e2], 6);
    this.#Cl = a2;
    this.#Pl = FreeDrawOutliner.#Bl * n2;
    this.#Dl = FreeDrawOutliner.#Rl * n2;
    this.#Ml = n2;
    this.#Fl.push(t2, e2);
  }
  isEmpty() {
    return isNaN(this.#Tl[8]);
  }
  isCancellable() {
    return this.#Fl.length <= 10;
  }
  removeLastElement() {
    this.#Tl.fill(NaN);
    this.#Sl.length = this.#xl.length = this.#Fl.length = 0;
    return { path: { d: "" } };
  }
  #Ll() {
    const t2 = this.#Tl.subarray(4, 6), e2 = this.#Tl.subarray(16, 18), [i2, n2, s2, r2] = this.#Al;
    return [(this.#_l + (t2[0] - e2[0]) / 2 - i2) / s2, (this.#kl + (t2[1] - e2[1]) / 2 - n2) / r2, (this.#_l + (e2[0] - t2[0]) / 2 - i2) / s2, (this.#kl + (e2[1] - t2[1]) / 2 - n2) / r2];
  }
  add(t2, e2) {
    this.#_l = t2;
    this.#kl = e2;
    const [i2, n2, s2, r2] = this.#Al;
    let [a2, o2, l2, h2] = this.#Tl.subarray(8, 12);
    const c2 = t2 - l2, d2 = e2 - h2, u2 = Math.hypot(c2, d2);
    if (u2 < this.#Dl) return false;
    const p2 = u2 - this.#Pl, g2 = p2 / u2, m2 = g2 * c2, f2 = g2 * d2;
    let b2 = a2, y2 = o2;
    a2 = l2;
    o2 = h2;
    l2 += m2;
    h2 += f2;
    this.#Fl?.push(t2, e2);
    const v2 = m2 / p2, w2 = -f2 / p2 * this.#Il, A2 = v2 * this.#Il;
    this.#Tl.set(this.#Tl.subarray(2, 8), 0);
    this.#Tl.set([l2 + w2, h2 + A2], 4);
    this.#Tl.set(this.#Tl.subarray(14, 18), 12);
    this.#Tl.set([l2 - w2, h2 - A2], 16);
    if (isNaN(this.#Tl[6])) {
      if (0 === this.#Sl.length) {
        this.#Tl.set([a2 + w2, o2 + A2], 2);
        this.#Sl.push(NaN, NaN, NaN, NaN, (a2 + w2 - i2) / s2, (o2 + A2 - n2) / r2);
        this.#Tl.set([a2 - w2, o2 - A2], 14);
        this.#xl.push(NaN, NaN, NaN, NaN, (a2 - w2 - i2) / s2, (o2 - A2 - n2) / r2);
      }
      this.#Tl.set([b2, y2, a2, o2, l2, h2], 6);
      return !this.isEmpty();
    }
    this.#Tl.set([b2, y2, a2, o2, l2, h2], 6);
    if (Math.abs(Math.atan2(y2 - o2, b2 - a2) - Math.atan2(f2, m2)) < Math.PI / 2) {
      [a2, o2, l2, h2] = this.#Tl.subarray(2, 6);
      this.#Sl.push(NaN, NaN, NaN, NaN, ((a2 + l2) / 2 - i2) / s2, ((o2 + h2) / 2 - n2) / r2);
      [a2, o2, b2, y2] = this.#Tl.subarray(14, 18);
      this.#xl.push(NaN, NaN, NaN, NaN, ((b2 + a2) / 2 - i2) / s2, ((y2 + o2) / 2 - n2) / r2);
      return true;
    }
    [b2, y2, a2, o2, l2, h2] = this.#Tl.subarray(0, 6);
    this.#Sl.push(((b2 + 5 * a2) / 6 - i2) / s2, ((y2 + 5 * o2) / 6 - n2) / r2, ((5 * a2 + l2) / 6 - i2) / s2, ((5 * o2 + h2) / 6 - n2) / r2, ((a2 + l2) / 2 - i2) / s2, ((o2 + h2) / 2 - n2) / r2);
    [l2, h2, a2, o2, b2, y2] = this.#Tl.subarray(12, 18);
    this.#xl.push(((b2 + 5 * a2) / 6 - i2) / s2, ((y2 + 5 * o2) / 6 - n2) / r2, ((5 * a2 + l2) / 6 - i2) / s2, ((5 * o2 + h2) / 6 - n2) / r2, ((a2 + l2) / 2 - i2) / s2, ((o2 + h2) / 2 - n2) / r2);
    return true;
  }
  toSVGPath() {
    if (this.isEmpty()) return "";
    const t2 = this.#Sl, e2 = this.#xl;
    if (isNaN(this.#Tl[6]) && !this.isEmpty()) return this.#Nl();
    const i2 = [];
    i2.push(`M${t2[4]} ${t2[5]}`);
    for (let e3 = 6; e3 < t2.length; e3 += 6) isNaN(t2[e3]) ? i2.push(`L${t2[e3 + 4]} ${t2[e3 + 5]}`) : i2.push(`C${t2[e3]} ${t2[e3 + 1]} ${t2[e3 + 2]} ${t2[e3 + 3]} ${t2[e3 + 4]} ${t2[e3 + 5]}`);
    this.#Ul(i2);
    for (let t3 = e2.length - 6; t3 >= 6; t3 -= 6) isNaN(e2[t3]) ? i2.push(`L${e2[t3 + 4]} ${e2[t3 + 5]}`) : i2.push(`C${e2[t3]} ${e2[t3 + 1]} ${e2[t3 + 2]} ${e2[t3 + 3]} ${e2[t3 + 4]} ${e2[t3 + 5]}`);
    this.#Hl(i2);
    return i2.join(" ");
  }
  #Nl() {
    const [t2, e2, i2, n2] = this.#Al, [s2, r2, a2, o2] = this.#Ll();
    return `M${(this.#Tl[2] - t2) / i2} ${(this.#Tl[3] - e2) / n2} L${(this.#Tl[4] - t2) / i2} ${(this.#Tl[5] - e2) / n2} L${s2} ${r2} L${a2} ${o2} L${(this.#Tl[16] - t2) / i2} ${(this.#Tl[17] - e2) / n2} L${(this.#Tl[14] - t2) / i2} ${(this.#Tl[15] - e2) / n2} Z`;
  }
  #Hl(t2) {
    const e2 = this.#xl;
    t2.push(`L${e2[4]} ${e2[5]} Z`);
  }
  #Ul(t2) {
    const [e2, i2, n2, s2] = this.#Al, r2 = this.#Tl.subarray(4, 6), a2 = this.#Tl.subarray(16, 18), [o2, l2, h2, c2] = this.#Ll();
    t2.push(`L${(r2[0] - e2) / n2} ${(r2[1] - i2) / s2} L${o2} ${l2} L${h2} ${c2} L${(a2[0] - e2) / n2} ${(a2[1] - i2) / s2}`);
  }
  newFreeDrawOutline(t2, e2, i2, n2, s2, r2) {
    return new FreeDrawOutline(t2, e2, i2, n2, s2, r2);
  }
  getOutlines() {
    const t2 = this.#Sl, e2 = this.#xl, i2 = this.#Tl, [n2, s2, r2, a2] = this.#Al, o2 = new Float32Array((this.#Fl?.length ?? 0) + 2);
    for (let t3 = 0, e3 = o2.length - 2; t3 < e3; t3 += 2) {
      o2[t3] = (this.#Fl[t3] - n2) / r2;
      o2[t3 + 1] = (this.#Fl[t3 + 1] - s2) / a2;
    }
    o2[o2.length - 2] = (this.#_l - n2) / r2;
    o2[o2.length - 1] = (this.#kl - s2) / a2;
    if (isNaN(i2[6]) && !this.isEmpty()) return this.#zl(o2);
    const l2 = new Float32Array(this.#Sl.length + 24 + this.#xl.length);
    let h2 = t2.length;
    for (let e3 = 0; e3 < h2; e3 += 2) if (isNaN(t2[e3])) l2[e3] = l2[e3 + 1] = NaN;
    else {
      l2[e3] = t2[e3];
      l2[e3 + 1] = t2[e3 + 1];
    }
    h2 = this.#Gl(l2, h2);
    for (let t3 = e2.length - 6; t3 >= 6; t3 -= 6) for (let i3 = 0; i3 < 6; i3 += 2) if (isNaN(e2[t3 + i3])) {
      l2[h2] = l2[h2 + 1] = NaN;
      h2 += 2;
    } else {
      l2[h2] = e2[t3 + i3];
      l2[h2 + 1] = e2[t3 + i3 + 1];
      h2 += 2;
    }
    this.#Vl(l2, h2);
    return this.newFreeDrawOutline(l2, o2, this.#Al, this.#Ml, this.#Cl, this.#El);
  }
  #zl(t2) {
    const e2 = this.#Tl, [i2, n2, s2, r2] = this.#Al, [a2, o2, l2, h2] = this.#Ll(), c2 = new Float32Array(36);
    c2.set([NaN, NaN, NaN, NaN, (e2[2] - i2) / s2, (e2[3] - n2) / r2, NaN, NaN, NaN, NaN, (e2[4] - i2) / s2, (e2[5] - n2) / r2, NaN, NaN, NaN, NaN, a2, o2, NaN, NaN, NaN, NaN, l2, h2, NaN, NaN, NaN, NaN, (e2[16] - i2) / s2, (e2[17] - n2) / r2, NaN, NaN, NaN, NaN, (e2[14] - i2) / s2, (e2[15] - n2) / r2], 0);
    return this.newFreeDrawOutline(c2, t2, this.#Al, this.#Ml, this.#Cl, this.#El);
  }
  #Vl(t2, e2) {
    const i2 = this.#xl;
    t2.set([NaN, NaN, NaN, NaN, i2[4], i2[5]], e2);
    return e2 + 6;
  }
  #Gl(t2, e2) {
    const i2 = this.#Tl.subarray(4, 6), n2 = this.#Tl.subarray(16, 18), [s2, r2, a2, o2] = this.#Al, [l2, h2, c2, d2] = this.#Ll();
    t2.set([NaN, NaN, NaN, NaN, (i2[0] - s2) / a2, (i2[1] - r2) / o2, NaN, NaN, NaN, NaN, l2, h2, NaN, NaN, NaN, NaN, c2, d2, NaN, NaN, NaN, NaN, (n2[0] - s2) / a2, (n2[1] - r2) / o2], e2);
    return e2 + 24;
  }
}
class FreeDrawOutline extends Outline {
  #Al;
  #Wl = new Float32Array(4);
  #Cl;
  #El;
  #Fl;
  #Ml;
  #$l;
  constructor(t2, e2, i2, n2, s2, r2) {
    super();
    this.#$l = t2;
    this.#Fl = e2;
    this.#Al = i2;
    this.#Ml = n2;
    this.#Cl = s2;
    this.#El = r2;
    this.firstPoint = [NaN, NaN];
    this.lastPoint = [NaN, NaN];
    this.#jl(r2);
    const [a2, o2, l2, h2] = this.#Wl;
    for (let e3 = 0, i3 = t2.length; e3 < i3; e3 += 2) {
      t2[e3] = (t2[e3] - a2) / l2;
      t2[e3 + 1] = (t2[e3 + 1] - o2) / h2;
    }
    for (let t3 = 0, i3 = e2.length; t3 < i3; t3 += 2) {
      e2[t3] = (e2[t3] - a2) / l2;
      e2[t3 + 1] = (e2[t3 + 1] - o2) / h2;
    }
  }
  toSVGPath() {
    const t2 = [`M${this.#$l[4]} ${this.#$l[5]}`];
    for (let e2 = 6, i2 = this.#$l.length; e2 < i2; e2 += 6) isNaN(this.#$l[e2]) ? t2.push(`L${this.#$l[e2 + 4]} ${this.#$l[e2 + 5]}`) : t2.push(`C${this.#$l[e2]} ${this.#$l[e2 + 1]} ${this.#$l[e2 + 2]} ${this.#$l[e2 + 3]} ${this.#$l[e2 + 4]} ${this.#$l[e2 + 5]}`);
    t2.push("Z");
    return t2.join(" ");
  }
  serialize([t2, e2, i2, n2], s2) {
    const r2 = i2 - t2, a2 = n2 - e2;
    let o2, l2;
    switch (s2) {
      case 0:
        o2 = Outline._rescale(this.#$l, t2, n2, r2, -a2);
        l2 = Outline._rescale(this.#Fl, t2, n2, r2, -a2);
        break;
      case 90:
        o2 = Outline._rescaleAndSwap(this.#$l, t2, e2, r2, a2);
        l2 = Outline._rescaleAndSwap(this.#Fl, t2, e2, r2, a2);
        break;
      case 180:
        o2 = Outline._rescale(this.#$l, i2, e2, -r2, a2);
        l2 = Outline._rescale(this.#Fl, i2, e2, -r2, a2);
        break;
      case 270:
        o2 = Outline._rescaleAndSwap(this.#$l, i2, n2, -r2, -a2);
        l2 = Outline._rescaleAndSwap(this.#Fl, i2, n2, -r2, -a2);
    }
    return { outline: Array.from(o2), points: [Array.from(l2)] };
  }
  #jl(t2) {
    const i2 = this.#$l;
    let n2 = i2[4], s2 = i2[5];
    const r2 = [n2, s2, n2, s2];
    let a2 = n2, o2 = s2, l2 = n2, h2 = s2;
    const c2 = t2 ? Math.max : Math.min, d2 = new Float32Array(4);
    for (let t3 = 6, u3 = i2.length; t3 < u3; t3 += 6) {
      const u4 = i2[t3 + 4], p2 = i2[t3 + 5];
      if (isNaN(i2[t3])) {
        Util.pointBoundingBox(u4, p2, r2);
        if (o2 > p2) {
          a2 = u4;
          o2 = p2;
        } else o2 === p2 && (a2 = c2(a2, u4));
        if (h2 < p2) {
          l2 = u4;
          h2 = p2;
        } else h2 === p2 && (l2 = c2(l2, u4));
      } else {
        d2.set(e, 0);
        Util.bezierBoundingBox(n2, s2, ...i2.slice(t3, t3 + 6), d2);
        Util.rectBoundingBox(...d2, r2);
        if (o2 > d2[1]) {
          a2 = d2[0];
          o2 = d2[1];
        } else o2 === d2[1] && (a2 = c2(a2, d2[0]));
        if (h2 < d2[3]) {
          l2 = d2[2];
          h2 = d2[3];
        } else h2 === d2[3] && (l2 = c2(l2, d2[2]));
      }
      n2 = u4;
      s2 = p2;
    }
    const u2 = this.#Wl;
    u2[0] = r2[0] - this.#Cl;
    u2[1] = r2[1] - this.#Cl;
    u2[2] = r2[2] - r2[0] + 2 * this.#Cl;
    u2[3] = r2[3] - r2[1] + 2 * this.#Cl;
    this.firstPoint = [a2, o2];
    this.lastPoint = [l2, h2];
  }
  get box() {
    return this.#Wl;
  }
  newOutliner(t2, e2, i2, n2, s2, r2, a2 = 0) {
    return new FreeDrawOutliner(t2, e2, i2, n2, s2, r2, a2);
  }
  updateThickness(t2) {
    const e2 = this.getNewOutline(t2);
    this.#$l = e2.#$l;
    this.#Fl = e2.#Fl;
    this.#Wl.set(e2.#Wl);
    this.firstPoint = e2.firstPoint;
    this.lastPoint = e2.lastPoint;
    return this.#Wl;
  }
  getNewOutline(t2, e2) {
    const [i2, n2, s2, r2] = this.#Wl, [a2, o2, l2, h2] = this.#Al, c2 = s2 * l2, d2 = r2 * h2, u2 = i2 * l2 + a2, p2 = n2 * h2 + o2, g2 = this.#Fl, m2 = this.newOutliner(g2[0] * c2 + u2, g2[1] * d2 + p2, this.#Al, this.#Ml, t2, this.#El, e2 ?? this.#Cl);
    for (let t3 = 2, e3 = g2.length; t3 < e3; t3 += 2) m2.add(g2[t3] * c2 + u2, g2[t3 + 1] * d2 + p2);
    return m2.getOutlines();
  }
}
function getHighlightSVGProperties(t2) {
  return { bbox: t2.box, root: { viewBox: "0 0 1 1" }, rootClass: { highlight: true, free: t2.isFree }, path: { d: t2.toSVGPath() } };
}
function getHighlightFocusSVGProperties(t2, e2) {
  const { focusOutline: i2 } = t2;
  return { bbox: Outline._rotateBox(i2.box, e2), root: { "data-main-rotation": e2 }, rootClass: { highlightOutline: true, free: t2.isFree }, path: { d: i2.toSVGPath() } };
}
class HighlightOutliner {
  #Al;
  #Xl;
  #Kl;
  #Yl = [];
  #ql = [];
  constructor(t2, i2 = 0, n2 = 0, s2 = true) {
    const r2 = e.slice(), a2 = 1e-4;
    for (const { x: e2, y: n3, width: s3, height: o3 } of t2) {
      const t3 = Math.floor((e2 - i2) / a2) * a2, l3 = Math.ceil((e2 + s3 + i2) / a2) * a2, h3 = Math.floor((n3 - i2) / a2) * a2, c3 = Math.ceil((n3 + o3 + i2) / a2) * a2, d3 = [t3, h3, c3, true], u3 = [l3, h3, c3, false];
      this.#Yl.push(d3, u3);
      Util.rectBoundingBox(t3, h3, l3, c3, r2);
    }
    const o2 = r2[2] - r2[0] + 2 * n2, l2 = r2[3] - r2[1] + 2 * n2, h2 = r2[0] - n2, c2 = r2[1] - n2;
    let d2 = s2 ? -1 / 0 : 1 / 0, u2 = 1 / 0;
    const p2 = this.#Yl.at(s2 ? -1 : -2), g2 = [p2[0], p2[2]];
    for (const t3 of this.#Yl) {
      const [e2, i3, n3, r3] = t3;
      if (!r3 && s2) if (i3 < u2) {
        u2 = i3;
        d2 = e2;
      } else i3 === u2 && (d2 = Math.max(d2, e2));
      else if (r3 && !s2) if (i3 < u2) {
        u2 = i3;
        d2 = e2;
      } else i3 === u2 && (d2 = Math.min(d2, e2));
      t3[0] = (e2 - h2) / o2;
      t3[1] = (i3 - c2) / l2;
      t3[2] = (n3 - c2) / l2;
    }
    this.#Al = new Float32Array([h2, c2, o2, l2]);
    this.#Xl = [d2, u2];
    this.#Kl = g2;
  }
  getOutlines() {
    this.#Yl.sort((t3, e2) => t3[0] - e2[0] || t3[1] - e2[1] || t3[2] - e2[2]);
    const t2 = [];
    for (const e2 of this.#Yl) if (e2[3]) {
      t2.push(...this.#Ql(e2));
      this.#Jl(e2);
    } else {
      this.#Zl(e2);
      t2.push(...this.#Ql(e2));
    }
    return this.#th(t2);
  }
  #th(t2) {
    const e2 = [], i2 = /* @__PURE__ */ new Set();
    for (const i3 of t2) {
      const [t3, n3, s2] = i3;
      e2.push([t3, n3, i3], [t3, s2, i3]);
    }
    e2.sort((t3, e3) => t3[1] - e3[1] || t3[0] - e3[0]);
    for (let t3 = 0, n3 = e2.length; t3 < n3; t3 += 2) {
      const n4 = e2[t3][2], s2 = e2[t3 + 1][2];
      n4.push(s2);
      s2.push(n4);
      i2.add(n4);
      i2.add(s2);
    }
    const n2 = [];
    for (; i2.size > 0; ) {
      const t3 = i2.values().next().value;
      let [e3, s2, r2, a2, o2] = t3;
      i2.delete(t3);
      let l2 = e3, h2 = s2;
      const c2 = [e3, r2];
      n2.push(c2);
      for (; ; ) {
        let t4;
        if (i2.has(a2)) t4 = a2;
        else {
          if (!i2.has(o2)) break;
          t4 = o2;
        }
        i2.delete(t4);
        [e3, s2, r2, a2, o2] = t4;
        if (l2 !== e3) {
          c2.push(l2, h2, e3, h2 === s2 ? s2 : r2);
          l2 = e3;
        }
        h2 = h2 === s2 ? r2 : s2;
      }
      c2.push(l2, h2);
    }
    return new HighlightOutline(n2, this.#Al, this.#Xl, this.#Kl);
  }
  #eh(t2) {
    const e2 = this.#ql;
    let i2 = 0, n2 = e2.length - 1;
    for (; i2 <= n2; ) {
      const s2 = i2 + n2 >> 1, r2 = e2[s2][0];
      if (r2 === t2) return s2;
      r2 < t2 ? i2 = s2 + 1 : n2 = s2 - 1;
    }
    return n2 + 1;
  }
  #Jl([, t2, e2]) {
    const i2 = this.#eh(t2);
    this.#ql.splice(i2, 0, [t2, e2]);
  }
  #Zl([, t2, e2]) {
    const i2 = this.#eh(t2);
    for (let n2 = i2; n2 < this.#ql.length; n2++) {
      const [i3, s2] = this.#ql[n2];
      if (i3 !== t2) break;
      if (i3 === t2 && s2 === e2) {
        this.#ql.splice(n2, 1);
        return;
      }
    }
    for (let n2 = i2 - 1; n2 >= 0; n2--) {
      const [i3, s2] = this.#ql[n2];
      if (i3 !== t2) break;
      if (i3 === t2 && s2 === e2) {
        this.#ql.splice(n2, 1);
        return;
      }
    }
  }
  #Ql(t2) {
    const [e2, i2, n2] = t2, s2 = [[e2, i2, n2]], r2 = this.#eh(n2);
    for (let t3 = 0; t3 < r2; t3++) {
      const [i3, n3] = this.#ql[t3];
      for (let t4 = 0, r3 = s2.length; t4 < r3; t4++) {
        const [, a2, o2] = s2[t4];
        if (!(n3 <= a2 || o2 <= i3)) if (a2 >= i3) if (o2 > n3) s2[t4][1] = n3;
        else {
          if (1 === r3) return [];
          s2.splice(t4, 1);
          t4--;
          r3--;
        }
        else {
          s2[t4][2] = i3;
          o2 > n3 && s2.push([e2, n3, o2]);
        }
      }
    }
    return s2;
  }
}
class HighlightOutline extends Outline {
  #Al;
  #ih = null;
  #nh;
  constructor(t2, e2, i2, n2) {
    super();
    this.#nh = t2;
    this.#Al = e2;
    this.firstPoint = i2;
    this.lastPoint = n2;
  }
  static build(t2, e2) {
    const i2 = new HighlightOutliner(t2, 1e-3).getOutlines();
    i2.#ih = t2;
    i2.focusOutline = new HighlightOutliner(t2, 25e-4, 1e-3, e2).getOutlines();
    return i2;
  }
  get isFree() {
    return false;
  }
  get defaultSVGProperties() {
    return getHighlightSVGProperties(this);
  }
  getFocusSVGProperties(t2) {
    return getHighlightFocusSVGProperties(this, t2);
  }
  updateRotation(t2) {
    return { root: { "data-main-rotation": t2 } };
  }
  serializeQuadPoints([t2, e2], [i2, n2]) {
    const s2 = this.#ih, r2 = new Float32Array(8 * s2.length);
    let a2 = 0;
    for (const { x: o2, y: l2, width: h2, height: c2 } of s2) {
      const s3 = o2 * i2 + t2, d2 = (1 - l2) * n2 + e2;
      r2[a2] = r2[a2 + 4] = s3;
      r2[a2 + 1] = r2[a2 + 3] = d2;
      r2[a2 + 2] = r2[a2 + 6] = s3 + h2 * i2;
      r2[a2 + 5] = r2[a2 + 7] = d2 - c2 * n2;
      a2 += 8;
    }
    return r2;
  }
  toSVGPath() {
    const t2 = [];
    for (const e2 of this.#nh) {
      let [i2, n2] = e2;
      t2.push(`M${i2} ${n2}`);
      for (let s2 = 2; s2 < e2.length; s2 += 2) {
        const r2 = e2[s2], a2 = e2[s2 + 1];
        if (r2 === i2) {
          t2.push(`V${a2}`);
          n2 = a2;
        } else if (a2 === n2) {
          t2.push(`H${r2}`);
          i2 = r2;
        }
      }
      t2.push("Z");
    }
    return t2.join(" ");
  }
  serialize([t2, e2, i2, n2], s2) {
    const r2 = [], a2 = i2 - t2, o2 = n2 - e2;
    for (const e3 of this.#nh) {
      const i3 = new Array(e3.length);
      for (let s3 = 0; s3 < e3.length; s3 += 2) {
        i3[s3] = t2 + e3[s3] * a2;
        i3[s3 + 1] = n2 - e3[s3 + 1] * o2;
      }
      r2.push(i3);
    }
    return r2;
  }
  get box() {
    return this.#Al;
  }
}
class FreeHighlightOutliner extends FreeDrawOutliner {
  newFreeDrawOutline(t2, e2, i2, n2, s2, r2) {
    return new FreeHighlightOutline(t2, e2, i2, n2, s2, r2);
  }
}
class FreeHighlightDrawer {
  #sh;
  #Il;
  constructor(t2, e2, i2, n2, s2, r2, a2) {
    this.#sh = new FreeHighlightOutliner(t2, e2, i2, n2, s2, r2, a2);
    this.#Il = s2;
  }
  add(t2, e2) {
    return this.#sh.add(t2, e2) ? { path: { d: this.#sh.toSVGPath() } } : null;
  }
  addPoints(t2) {
    let e2 = false;
    for (let i2 = 0, n2 = t2.length; i2 < n2; i2 += 2) e2 = this.#sh.add(t2[i2], t2[i2 + 1]) || e2;
    return e2 ? { path: { d: this.#sh.toSVGPath() } } : null;
  }
  end(t2, e2) {
    return void 0 === t2 ? null : this.add(t2, e2);
  }
  isEmpty() {
    return this.#sh.isEmpty();
  }
  isCancellable() {
    return this.#sh.isCancellable();
  }
  removeLastElement() {
    return this.#sh.removeLastElement();
  }
  updateProperty(t2, e2) {
    return null;
  }
  getOutlines() {
    const t2 = this.#sh.getOutlines();
    t2.buildFocusOutline(2 * this.#Il);
    return t2;
  }
  get defaultSVGProperties() {
    return { bbox: [0, 0, 1, 1], root: { viewBox: "0 0 1 1" }, rootClass: { highlight: true, free: true }, path: { d: this.#sh.toSVGPath() } };
  }
}
class FreeHighlightOutline extends FreeDrawOutline {
  static #rh = 1.5;
  newOutliner(t2, e2, i2, n2, s2, r2, a2 = 0) {
    return new FreeHighlightOutliner(t2, e2, i2, n2, s2, r2, a2);
  }
  get isFree() {
    return true;
  }
  buildFocusOutline(t2) {
    this.focusOutline = this.getNewOutline(t2 / 2 + FreeHighlightOutline.#rh, 25e-4);
  }
  get defaultSVGProperties() {
    return getHighlightSVGProperties(this);
  }
  getFocusSVGProperties(t2) {
    return getHighlightFocusSVGProperties(this, t2);
  }
  get focusMustRemoveSelfIntersections() {
    return true;
  }
  updateRotation(t2) {
    return { root: { "data-main-rotation": t2 } };
  }
  updateProperty(t2, e2) {
    if ("thickness" !== t2) return null;
    const i2 = this.updateThickness(e2 / 2);
    this.buildFocusOutline(e2);
    return i2;
  }
  getPathResizedSVGProperties() {
    return { path: { d: this.toSVGPath() } };
  }
}
class HighlightDrawingOptions extends DrawingOptions {
  constructor(t2 = null) {
    super();
    super.updateProperties(t2);
  }
  updateSVGProperty(t2, e2) {
    "thickness" !== t2 && super.updateSVGProperty(t2, e2);
  }
  clone() {
    const t2 = new HighlightDrawingOptions();
    t2.updateAll(this);
    return t2;
  }
}
class HighlightEditor extends DrawingEditor {
  #ah = null;
  #oh = 0;
  #lh = null;
  #hh = 0;
  #ch = "";
  #ve = "";
  static _DEFAULT_OPACITY = 1;
  static _DEFAULT_THICKNESS = 12;
  static _defaultDrawingOptions = null;
  static _type = "highlight";
  static _editorType = f.HIGHLIGHT;
  static get _keyboardManager() {
    const t2 = HighlightEditor.prototype;
    return shadow(this, "_keyboardManager", new KeyboardManager([[["ArrowLeft"], t2._moveCaret, { args: [0] }], [["ArrowRight"], t2._moveCaret, { args: [1] }], [["ArrowUp"], t2._moveCaret, { args: [2] }], [["ArrowDown"], t2._moveCaret, { args: [3] }]]));
  }
  constructor(t2) {
    super({ ...t2, name: "highlightEditor" });
    this.#ah = t2.anchorNode || null;
    this.#oh = t2.anchorOffset || 0;
    this.#lh = t2.focusNode || null;
    this.#hh = t2.focusOffset || 0;
    this.#ch = t2.methodOfCreation || (this._drawOutlines?.isFree ? "main_toolbar" : "");
    this.#ve = t2.text || "";
    this._isDraggable = false;
    this.defaultL10nId = "pdfjs-editor-highlight-editor";
    this.rotate();
  }
  static initialize(t2, e2) {
    AnnotationEditor.initialize(t2, e2);
    this._defaultDrawingOptions ||= new HighlightDrawingOptions({ fill: e2.highlightColors?.values().next().value || "#fff066", "fill-opacity": HighlightEditor._DEFAULT_OPACITY, thickness: HighlightEditor._DEFAULT_THICKNESS });
  }
  static getDefaultDrawingOptions(t2) {
    const e2 = this._defaultDrawingOptions.clone();
    e2.updateProperties(t2);
    return e2;
  }
  static get typesMap() {
    return shadow(this, "typesMap", /* @__PURE__ */ new Map([[b.HIGHLIGHT_COLOR, "fill"], [b.HIGHLIGHT_THICKNESS, "thickness"]]));
  }
  static get isDrawer() {
    return false;
  }
  static get _hasClipPath() {
    return true;
  }
  static get _hasDrawClass() {
    return false;
  }
  _addOutlines(t2) {
    const { boxes: e2, drawOutlines: i2 } = t2;
    if (e2 || i2) {
      this._drawingOptions ||= t2.drawingOptions || HighlightEditor.getDefaultDrawingOptions();
      e2 && (t2 = { ...t2, drawOutlines: HighlightOutline.build(e2, "ltr" === this._uiManager.direction) });
      super._addOutlines(t2);
    }
  }
  get colorType() {
    return b.HIGHLIGHT_COLOR;
  }
  get color() {
    return this._drawingOptions.fill;
  }
  get opacity() {
    return this._drawingOptions["fill-opacity"];
  }
  get _opacityName() {
    return "fill-opacity";
  }
  get _drawRotation() {
    return this._drawOutlines?.isFree ? this.rotation : 0;
  }
  get isResizable() {
    return false;
  }
  get _mustBeDisabledOnCommit() {
    return false;
  }
  get _mustFixPosition() {
    return !this._drawOutlines?.isFree;
  }
  get telemetryInitialData() {
    return { action: "added", type: this._drawOutlines.isFree ? "free_highlight" : "highlight", color: this._uiManager.getNonHCMColorName(this.color), thickness: this._drawingOptions.thickness, methodOfCreation: this.#ch };
  }
  get telemetryFinalData() {
    return { type: "highlight", color: this._uiManager.getNonHCMColorName(this.color) };
  }
  static computeTelemetryFinalData(t2) {
    return { numberOfColors: t2.get("color").size };
  }
  translateInPage(t2, e2) {
  }
  get toolbarPosition() {
    return this.#dh(this._drawOutlines.focusOutline.lastPoint);
  }
  get commentButtonPosition() {
    return this.#dh(this._drawOutlines.firstPoint);
  }
  #dh([t2, e2]) {
    const [i2, n2, s2, r2] = this._drawOutlines.box;
    return [(t2 - i2) / s2, (e2 - n2) / r2];
  }
  updateParams(t2, e2) {
    switch (t2) {
      case b.HIGHLIGHT_COLOR:
        this._updateColorAndOpacity(e2, HighlightEditor._DEFAULT_OPACITY, t2);
        this._reportTelemetry({ action: "color_changed", color: this._uiManager.getNonHCMColorName(e2) }, true);
        break;
      case b.HIGHLIGHT_THICKNESS:
        super.updateParams(t2, e2);
        this._reportTelemetry({ action: "thickness_changed", thickness: e2 }, true);
    }
  }
  get propertiesToUpdate() {
    const t2 = super.propertiesToUpdate;
    t2.push([b.HIGHLIGHT_FREE, this._drawOutlines.isFree]);
    return t2;
  }
  get toolbarButtons() {
    if (this._uiManager.highlightColors) {
      this._colorPicker = new ColorPicker({ editor: this });
      return [["colorPicker", this._colorPicker]];
    }
    return super.toolbarButtons;
  }
  fixAndSetPosition() {
    return super.fixAndSetPosition(this._drawRotation);
  }
  getRect(t2, e2) {
    return super.getRect(t2, e2, this._drawRotation);
  }
  onceAdded(t2) {
    this.annotationElementId || this.parent.addUndoableEditor(this);
    t2 && this.div.focus();
  }
  remove() {
    this._reportTelemetry({ action: "deleted" });
    super.remove();
  }
  render() {
    if (this.div) return this.div;
    const t2 = super.render();
    if (this.#ve) {
      t2.setAttribute("aria-label", this.#ve);
      t2.setAttribute("role", "mark");
    }
    this._drawOutlines.isFree ? t2.classList.add("free") : t2.addEventListener("keydown", this.#uh.bind(this), { signal: this._uiManager._signal });
    this.enableEditing();
    return t2;
  }
  #uh(t2) {
    HighlightEditor._keyboardManager.exec(this, t2);
  }
  _moveCaret(t2) {
    this.parent.unselect(this);
    switch (t2) {
      case 0:
      case 2:
        this.#ph(true);
        break;
      case 1:
      case 3:
        this.#ph(false);
    }
  }
  #ph(t2) {
    if (!this.#ah) return;
    const e2 = window.getSelection();
    t2 ? e2.setPosition(this.#ah, this.#oh) : e2.setPosition(this.#lh, this.#hh);
  }
  unselect() {
    super.unselect();
    this._drawOutlines.isFree || this.#ph(false);
  }
  static createDrawerInstance({ x: t2, y: e2, box: i2, parent: n2, isLTR: s2 }) {
    return new FreeHighlightDrawer(t2, e2, i2, n2.scale, this._defaultDrawingOptions.thickness / 2, s2, 1e-3);
  }
  static _getDrawingTarget(t2, { target: e2 }) {
    return e2.closest(".textLayer");
  }
  static _getPointerCoords({ x: t2, y: e2 }) {
    return [t2, e2];
  }
  static _addDrawingListeners(t2, e2) {
    t2.classList.add("free");
    e2.addEventListener("abort", () => t2.classList.remove("free"), { once: true });
    window.addEventListener("blur", () => this._endDraw(null), { signal: e2 });
    window.addEventListener("pointerdown", stopEvent, { capture: true, passive: false, signal: e2 });
  }
  static _endDrawingSession(t2 = false) {
    return this.endDrawing(t2);
  }
  createDrawingOptions({ color: t2, opacity: e2, thickness: i2 }) {
    const { _defaultDrawingOptions: n2, _DEFAULT_OPACITY: s2 } = HighlightEditor;
    this._drawingOptions = HighlightEditor.getDefaultDrawingOptions({ fill: Util.makeHexColor(...t2), "fill-opacity": e2 || s2, thickness: i2 || n2.thickness });
  }
  static deserializeDraw(t2, e2, i2, n2, s2, r2, a2) {
    const { quadPoints: o2 } = r2;
    if (o2) {
      const s3 = [];
      for (let r3 = 0, a3 = o2.length; r3 < a3; r3 += 8) s3.push({ x: (o2[r3] - t2) / i2, y: 1 - (o2[r3 + 1] - e2) / n2, width: (o2[r3 + 2] - o2[r3]) / i2, height: (o2[r3 + 1] - o2[r3 + 5]) / n2 });
      return HighlightOutline.build(s3, "ltr" === a2.direction);
    }
    const l2 = r2.thickness || this._defaultDrawingOptions.thickness, h2 = (r2.inkLists || r2.outlines.points)[0], c2 = new FreeHighlightOutliner(h2[0] - t2, n2 - (h2[1] - e2), [0, 0, i2, n2], 1, l2 / 2, true, 1e-3);
    for (let i3 = 0, s3 = h2.length; i3 < s3; i3 += 2) c2.add(h2[i3] - t2, n2 - (h2[i3 + 1] - e2));
    const d2 = c2.getOutlines();
    d2.buildFocusOutline(l2);
    return d2;
  }
  static async deserialize(t2, e2, i2) {
    let n2 = null;
    if (t2 instanceof HighlightAnnotationElement) {
      const { data: { quadPoints: e3, rect: i3, rotation: s3, id: r2, color: a2, opacity: o2, popupRef: l2, richText: h2, contentsObj: c2, creationDate: d2, modificationDate: u2 }, parent: { page: { pageNumber: p2 } } } = t2;
      n2 = t2 = { annotationType: f.HIGHLIGHT, color: Array.from(a2), opacity: o2, quadPoints: e3, pageIndex: p2 - 1, rect: i3.slice(0), rotation: s3, annotationElementId: r2, id: r2, deleted: false, popupRef: l2, richText: h2, comment: c2?.str || null, creationDate: d2, modificationDate: u2 };
    } else if (t2 instanceof InkAnnotationElement) {
      const { data: { inkLists: e3, rect: i3, rotation: s3, id: r2, color: a2, borderStyle: { rawWidth: o2 }, popupRef: l2, richText: h2, contentsObj: c2, creationDate: d2, modificationDate: u2 }, parent: { page: { pageNumber: p2 } } } = t2;
      n2 = t2 = { annotationType: f.HIGHLIGHT, color: Array.from(a2), thickness: o2, inkLists: e3, pageIndex: p2 - 1, rect: i3.slice(0), rotation: s3, annotationElementId: r2, id: r2, deleted: false, popupRef: l2, richText: h2, comment: c2?.str || null, creationDate: d2, modificationDate: u2 };
    }
    const s2 = await super.deserialize(t2, e2, i2);
    s2._initialData = n2;
    t2.comment && s2.setCommentData(t2);
    return s2;
  }
  serialize(t2 = false) {
    if (this.isEmpty() || t2) return null;
    if (this.deleted) return this.serializeDeleted();
    const e2 = super.serialize(t2);
    Object.assign(e2, { color: AnnotationEditor._colorManager.convert(this._uiManager.getNonHCMColor(this.color)), opacity: this.opacity, thickness: this._drawingOptions.thickness, quadPoints: this._drawOutlines.serializeQuadPoints(this.pageTranslation, this.pageDimensions), outlines: this._drawOutlines.serialize(e2.rect, this._drawRotation) });
    this.addComment(e2);
    if (this.annotationElementId && !this.#tl(e2)) return null;
    e2.id = this.annotationElementId;
    return e2;
  }
  #tl(t2) {
    const { color: e2 } = this._initialData;
    return this.hasEditedComment || t2.color.some((t3, i2) => t3 !== e2[i2]);
  }
  renderAnnotationElement(t2) {
    if (this.deleted) {
      t2.hide();
      return null;
    }
    t2.updateEdited({ rect: this.getPDFRect(), popup: this.comment });
    return null;
  }
}
class InkDrawOutliner {
  #Tl = new Float64Array(6);
  #gh = new Float64Array(2);
  #Co;
  #mh;
  #kr;
  #Il;
  #Fl;
  #fh = "";
  #bh = 0;
  #nh = new InkDrawOutline();
  #yh;
  #vh;
  constructor(t2, e2, i2, n2, s2, r2) {
    this.#yh = i2;
    this.#vh = n2;
    this.#kr = s2;
    this.#Il = r2;
    [t2, e2] = this.#wh(t2, e2);
    const a2 = this.#Co = [NaN, NaN, NaN, NaN, t2, e2];
    this.#Fl = [t2, e2];
    this.#mh = [{ line: a2, points: this.#Fl }];
    this.#Tl.set(a2, 0);
    this.#gh.set([t2, e2], 0);
  }
  updateProperty(t2, e2) {
    "stroke-width" === t2 && (this.#Il = e2);
  }
  #wh(t2, e2) {
    return Outline._normalizePoint(t2, e2, this.#yh, this.#vh, this.#kr);
  }
  isEmpty() {
    return !this.#mh?.length;
  }
  isCancellable() {
    return this.#Fl.length <= 10;
  }
  add(t2, e2) {
    this.#Ah(t2, e2) && this.toSVGPath();
    return { path: { d: this.#xh() } };
  }
  addPoints(t2) {
    let e2 = false;
    for (let i2 = 0, n2 = t2.length; i2 < n2; i2 += 2) if (this.#Ah(t2[i2], t2[i2 + 1])) {
      e2 = true;
      if (this.#Fl.length <= 6) {
        this.toSVGPath();
        e2 = false;
      }
    }
    e2 && this.toSVGPath();
    return { path: { d: this.#xh() } };
  }
  #Ah(t2, e2) {
    [t2, e2] = this.#wh(t2, e2);
    this.#gh.set([t2, e2], 0);
    const [i2, n2, s2, r2] = this.#Tl.subarray(2, 6), a2 = t2 - s2, o2 = e2 - r2;
    if (Math.hypot(this.#yh * a2, this.#vh * o2) <= 2) return false;
    this.#Fl.push(t2, e2);
    if (isNaN(i2)) {
      this.#Tl.set([s2, r2, t2, e2], 2);
      this.#Co.push(NaN, NaN, NaN, NaN, t2, e2);
      return true;
    }
    isNaN(this.#Tl[0]) && this.#Co.splice(6, 6);
    this.#Tl.set([i2, n2, s2, r2, t2, e2], 0);
    this.#Co.push(...Outline.createBezierPoints(i2, n2, s2, r2, t2, e2));
    return true;
  }
  end(t2, e2) {
    return void 0 !== t2 && this.#Ah(t2, e2) || 2 === this.#Fl.length ? { path: { d: this.toSVGPath() } } : { path: { d: this.#fh } };
  }
  startNew(t2, e2, i2, n2, s2) {
    this.#yh = i2;
    this.#vh = n2;
    this.#kr = s2;
    [t2, e2] = this.#wh(t2, e2);
    const r2 = this.#Co = [NaN, NaN, NaN, NaN, t2, e2];
    this.#Fl = [t2, e2];
    this.#gh.set([t2, e2], 0);
    const a2 = this.#mh.at(-1);
    if (a2) {
      a2.line = new Float32Array(a2.line);
      a2.points = new Float32Array(a2.points);
    }
    this.#mh.push({ line: r2, points: this.#Fl });
    this.#Tl.set(r2, 0);
    this.#bh = 0;
    this.toSVGPath();
    return null;
  }
  getLastElement() {
    return this.#mh.at(-1);
  }
  setLastElement(t2) {
    if (!this.#mh) return this.#nh.setLastElement(t2);
    this.#mh.push(t2);
    this.#Co = t2.line;
    this.#Fl = t2.points;
    this.#bh = 0;
    return { path: { d: this.toSVGPath() } };
  }
  removeLastElement() {
    if (!this.#mh) return this.#nh.removeLastElement();
    this.#mh.pop();
    this.#fh = "";
    for (let t2 = 0, e2 = this.#mh.length; t2 < e2; t2++) {
      const { line: e3, points: i2 } = this.#mh[t2];
      this.#Co = e3;
      this.#Fl = i2;
      this.#bh = 0;
      this.toSVGPath();
    }
    return { path: { d: this.#fh } };
  }
  #xh() {
    const t2 = Outline.svgRound(this.#gh[0]), e2 = Outline.svgRound(this.#gh[1]);
    if (2 === this.#Fl.length) {
      const i2 = Outline.svgRound(this.#Co[4]), n2 = Outline.svgRound(this.#Co[5]);
      return `${this.#fh} M ${i2} ${n2} L ${t2} ${e2}`;
    }
    return `${this.#fh} L ${t2} ${e2}`;
  }
  toSVGPath() {
    const t2 = Outline.svgRound(this.#Co[4]), e2 = Outline.svgRound(this.#Co[5]);
    if (2 === this.#Fl.length) {
      this.#fh = `${this.#fh} M ${t2} ${e2} Z`;
      return this.#fh;
    }
    if (this.#Fl.length <= 6) {
      const i3 = this.#fh.lastIndexOf("M");
      this.#fh = `${this.#fh.slice(0, i3)} M ${t2} ${e2}`;
      this.#bh = 6;
    }
    if (4 === this.#Fl.length) {
      const t3 = Outline.svgRound(this.#Co[10]), e3 = Outline.svgRound(this.#Co[11]);
      this.#fh = `${this.#fh} L ${t3} ${e3}`;
      this.#bh = 12;
      return this.#fh;
    }
    const i2 = [];
    if (0 === this.#bh) {
      i2.push(`M ${t2} ${e2}`);
      this.#bh = 6;
    }
    for (let t3 = this.#bh, e3 = this.#Co.length; t3 < e3; t3 += 6) {
      const [e4, n2, s2, r2, a2, o2] = this.#Co.slice(t3, t3 + 6).map(Outline.svgRound);
      i2.push(`C${e4} ${n2} ${s2} ${r2} ${a2} ${o2}`);
    }
    this.#fh += i2.join(" ");
    this.#bh = this.#Co.length;
    return this.#fh;
  }
  getOutlines(t2, e2, i2, n2) {
    const s2 = this.#mh.at(-1);
    s2.line = new Float32Array(s2.line);
    s2.points = new Float32Array(s2.points);
    this.#nh.build(this.#mh, t2, e2, i2, this.#kr, this.#Il, n2);
    this.#Tl = null;
    this.#Co = null;
    this.#mh = null;
    this.#fh = null;
    return this.#nh;
  }
  get defaultSVGProperties() {
    return { root: { viewBox: "0 0 10000 10000" }, rootClass: { draw: true }, bbox: [0, 0, 1, 1] };
  }
}
class InkDrawOutline extends Outline {
  #Wl;
  #Ch = 0;
  #Cl;
  #mh;
  #yh;
  #vh;
  #Eh;
  #kr;
  #Il;
  build(t2, e2, i2, n2, s2, r2, a2) {
    this.#yh = e2;
    this.#vh = i2;
    this.#Eh = n2;
    this.#kr = s2;
    this.#Il = r2;
    this.#Cl = a2 ?? 0;
    this.#mh = t2;
    this.#Sh();
  }
  get thickness() {
    return this.#Il;
  }
  setLastElement(t2) {
    this.#mh.push(t2);
    return { path: { d: this.toSVGPath() } };
  }
  removeLastElement() {
    this.#mh.pop();
    return { path: { d: this.toSVGPath() } };
  }
  toSVGPath() {
    const t2 = [];
    for (const { line: e2 } of this.#mh) {
      t2.push(`M${Outline.svgRound(e2[4])} ${Outline.svgRound(e2[5])}`);
      if (6 !== e2.length) if (12 === e2.length && isNaN(e2[6])) t2.push(`L${Outline.svgRound(e2[10])} ${Outline.svgRound(e2[11])}`);
      else for (let i2 = 6, n2 = e2.length; i2 < n2; i2 += 6) {
        const [n3, s2, r2, a2, o2, l2] = e2.subarray(i2, i2 + 6).map(Outline.svgRound);
        t2.push(`C${n3} ${s2} ${r2} ${a2} ${o2} ${l2}`);
      }
      else t2.push("Z");
    }
    return t2.join("");
  }
  serialize([t2, e2, i2, n2], s2) {
    const r2 = [], a2 = [], [o2, l2, h2, c2] = this.#Th();
    let d2, u2, p2, g2, m2, f2, b2, y2, v2;
    switch (this.#kr) {
      case 0:
        v2 = Outline._rescale;
        d2 = t2;
        u2 = e2 + n2;
        p2 = i2;
        g2 = -n2;
        m2 = t2 + o2 * i2;
        f2 = e2 + (1 - l2 - c2) * n2;
        b2 = t2 + (o2 + h2) * i2;
        y2 = e2 + (1 - l2) * n2;
        break;
      case 90:
        v2 = Outline._rescaleAndSwap;
        d2 = t2;
        u2 = e2;
        p2 = i2;
        g2 = n2;
        m2 = t2 + l2 * i2;
        f2 = e2 + o2 * n2;
        b2 = t2 + (l2 + c2) * i2;
        y2 = e2 + (o2 + h2) * n2;
        break;
      case 180:
        v2 = Outline._rescale;
        d2 = t2 + i2;
        u2 = e2;
        p2 = -i2;
        g2 = n2;
        m2 = t2 + (1 - o2 - h2) * i2;
        f2 = e2 + l2 * n2;
        b2 = t2 + (1 - o2) * i2;
        y2 = e2 + (l2 + c2) * n2;
        break;
      case 270:
        v2 = Outline._rescaleAndSwap;
        d2 = t2 + i2;
        u2 = e2 + n2;
        p2 = -i2;
        g2 = -n2;
        m2 = t2 + (1 - l2 - c2) * i2;
        f2 = e2 + (1 - o2 - h2) * n2;
        b2 = t2 + (1 - l2) * i2;
        y2 = e2 + (1 - o2) * n2;
    }
    for (const { line: t3, points: e3 } of this.#mh) {
      r2.push(v2(t3, d2, u2, p2, g2, s2 ? new Array(t3.length) : null));
      a2.push(v2(e3, d2, u2, p2, g2, s2 ? new Array(e3.length) : null));
    }
    return { lines: r2, points: a2, rect: [m2, f2, b2, y2] };
  }
  static deserialize(t2, e2, i2, n2, s2, { paths: { lines: r2, points: a2 }, rotation: o2, thickness: l2 }) {
    const h2 = [];
    let c2, d2, u2, p2, g2;
    switch (o2) {
      case 0:
        g2 = Outline._rescale;
        c2 = -t2 / i2;
        d2 = e2 / n2 + 1;
        u2 = 1 / i2;
        p2 = -1 / n2;
        break;
      case 90:
        g2 = Outline._rescaleAndSwap;
        c2 = -e2 / n2;
        d2 = -t2 / i2;
        u2 = 1 / n2;
        p2 = 1 / i2;
        break;
      case 180:
        g2 = Outline._rescale;
        c2 = t2 / i2 + 1;
        d2 = -e2 / n2;
        u2 = -1 / i2;
        p2 = 1 / n2;
        break;
      case 270:
        g2 = Outline._rescaleAndSwap;
        c2 = e2 / n2 + 1;
        d2 = t2 / i2 + 1;
        u2 = -1 / n2;
        p2 = -1 / i2;
    }
    if (!r2) {
      r2 = [];
      for (const t3 of a2) {
        const e3 = t3.length;
        if (2 === e3) {
          r2.push(new Float32Array([NaN, NaN, NaN, NaN, t3[0], t3[1]]));
          continue;
        }
        if (4 === e3) {
          r2.push(new Float32Array([NaN, NaN, NaN, NaN, t3[0], t3[1], NaN, NaN, NaN, NaN, t3[2], t3[3]]));
          continue;
        }
        const i3 = new Float32Array(3 * (e3 - 2));
        r2.push(i3);
        let [n3, s3, a3, o3] = t3.subarray(0, 4);
        i3.set([NaN, NaN, NaN, NaN, n3, s3], 0);
        for (let r3 = 4; r3 < e3; r3 += 2) {
          const e4 = t3[r3], l3 = t3[r3 + 1];
          i3.set(Outline.createBezierPoints(n3, s3, a3, o3, e4, l3), 3 * (r3 - 2));
          [n3, s3, a3, o3] = [a3, o3, e4, l3];
        }
      }
    }
    for (let t3 = 0, e3 = r2.length; t3 < e3; t3++) h2.push({ line: g2(r2[t3].map((t4) => t4 ?? NaN), c2, d2, u2, p2), points: g2(a2[t3].map((t4) => t4 ?? NaN), c2, d2, u2, p2) });
    const m2 = new this.prototype.constructor();
    m2.build(h2, i2, n2, 1, o2, l2, s2);
    return m2;
  }
  #_h(t2 = this.#Il) {
    const e2 = this.#Cl + t2 / 2 * this.#Eh;
    return this.#kr % 180 == 0 ? [e2 / this.#yh, e2 / this.#vh] : [e2 / this.#vh, e2 / this.#yh];
  }
  #Th() {
    const [t2, e2, i2, n2] = this.#Wl, [s2, r2] = this.#_h(0);
    return [t2 + s2, e2 + r2, i2 - 2 * s2, n2 - 2 * r2];
  }
  #Sh() {
    const t2 = this.#Wl = i.slice();
    for (const { line: e3 } of this.#mh) {
      if (e3.length <= 12) {
        for (let i3 = 4, n4 = e3.length; i3 < n4; i3 += 6) Util.pointBoundingBox(e3[i3], e3[i3 + 1], t2);
        continue;
      }
      let i2 = e3[4], n3 = e3[5];
      for (let s2 = 6, r2 = e3.length; s2 < r2; s2 += 6) {
        const [r3, a2, o2, l2, h2, c2] = e3.subarray(s2, s2 + 6);
        Util.bezierBoundingBox(i2, n3, r3, a2, o2, l2, h2, c2, t2);
        i2 = h2;
        n3 = c2;
      }
    }
    const [e2, n2] = this.#_h();
    t2[0] = MathClamp(t2[0] - e2, 0, 1);
    t2[1] = MathClamp(t2[1] - n2, 0, 1);
    t2[2] = MathClamp(t2[2] + e2, 0, 1);
    t2[3] = MathClamp(t2[3] + n2, 0, 1);
    t2[2] -= t2[0];
    t2[3] -= t2[1];
  }
  get box() {
    return this.#Wl;
  }
  updateProperty(t2, e2) {
    return "stroke-width" === t2 ? this.#kh(e2) : null;
  }
  #kh(t2) {
    const [e2, i2] = this.#_h();
    this.#Il = t2;
    const [n2, s2] = this.#_h(), [r2, a2] = [n2 - e2, s2 - i2], o2 = this.#Wl;
    o2[0] -= r2;
    o2[1] -= a2;
    o2[2] += 2 * r2;
    o2[3] += 2 * a2;
    return o2;
  }
  updateParentDimensions([t2, e2], i2) {
    const [n2, s2] = this.#_h();
    this.#yh = t2;
    this.#vh = e2;
    this.#Eh = i2;
    const [r2, a2] = this.#_h(), o2 = r2 - n2, l2 = a2 - s2, h2 = this.#Wl;
    h2[0] -= o2;
    h2[1] -= l2;
    h2[2] += 2 * o2;
    h2[3] += 2 * l2;
    return h2;
  }
  updateRotation(t2) {
    this.#Ch = t2;
    return { path: { transform: this.rotationTransform } };
  }
  get viewBox() {
    return this.#Wl.map(Outline.svgRound).join(" ");
  }
  get defaultProperties() {
    const [t2, e2] = this.#Wl;
    return { root: { viewBox: this.viewBox }, path: { "transform-origin": `${Outline.svgRound(t2)} ${Outline.svgRound(e2)}` } };
  }
  get rotationTransform() {
    const [, , t2, e2] = this.#Wl;
    let i2 = 0, n2 = 0, s2 = 0, r2 = 0, a2 = 0, o2 = 0;
    switch (this.#Ch) {
      case 90:
        n2 = e2 / t2;
        s2 = -t2 / e2;
        a2 = t2;
        break;
      case 180:
        i2 = -1;
        r2 = -1;
        a2 = t2;
        o2 = e2;
        break;
      case 270:
        n2 = -e2 / t2;
        s2 = t2 / e2;
        o2 = e2;
        break;
      default:
        return "";
    }
    return `matrix(${i2} ${n2} ${s2} ${r2} ${Outline.svgRound(a2)} ${Outline.svgRound(o2)})`;
  }
  getPathResizingSVGProperties([t2, e2, i2, n2]) {
    const [s2, r2] = this.#_h(), [a2, o2, l2, h2] = this.#Wl;
    if (Math.abs(l2 - s2) <= Outline.PRECISION || Math.abs(h2 - r2) <= Outline.PRECISION) {
      const s3 = t2 + i2 / 2 - (a2 + l2 / 2), r3 = e2 + n2 / 2 - (o2 + h2 / 2);
      return { path: { "transform-origin": `${Outline.svgRound(t2)} ${Outline.svgRound(e2)}`, transform: `${this.rotationTransform} translate(${s3} ${r3})` } };
    }
    const c2 = (i2 - 2 * s2) / (l2 - 2 * s2), d2 = (n2 - 2 * r2) / (h2 - 2 * r2), u2 = l2 / i2, p2 = h2 / n2;
    return { path: { "transform-origin": `${Outline.svgRound(a2)} ${Outline.svgRound(o2)}`, transform: `${this.rotationTransform} scale(${u2} ${p2}) translate(${Outline.svgRound(s2)} ${Outline.svgRound(r2)}) scale(${c2} ${d2}) translate(${Outline.svgRound(-s2)} ${Outline.svgRound(-r2)})` } };
  }
  getPathResizedSVGProperties([t2, e2, i2, n2]) {
    const [s2, r2] = this.#_h(), a2 = this.#Wl, [o2, l2, h2, c2] = a2;
    a2[0] = t2;
    a2[1] = e2;
    a2[2] = i2;
    a2[3] = n2;
    if (Math.abs(h2 - s2) <= Outline.PRECISION || Math.abs(c2 - r2) <= Outline.PRECISION) {
      const s3 = t2 + i2 / 2 - (o2 + h2 / 2), r3 = e2 + n2 / 2 - (l2 + c2 / 2);
      for (const { line: t3, points: e3 } of this.#mh) {
        Outline._translate(t3, s3, r3, t3);
        Outline._translate(e3, s3, r3, e3);
      }
      return { root: { viewBox: this.viewBox }, path: { "transform-origin": `${Outline.svgRound(t2)} ${Outline.svgRound(e2)}`, transform: this.rotationTransform || null, d: this.toSVGPath() } };
    }
    const d2 = (i2 - 2 * s2) / (h2 - 2 * s2), u2 = (n2 - 2 * r2) / (c2 - 2 * r2), p2 = -d2 * (o2 + s2) + t2 + s2, g2 = -u2 * (l2 + r2) + e2 + r2;
    if (1 !== d2 || 1 !== u2 || 0 !== p2 || 0 !== g2) for (const { line: t3, points: e3 } of this.#mh) {
      Outline._rescale(t3, p2, g2, d2, u2, t3);
      Outline._rescale(e3, p2, g2, d2, u2, e3);
    }
    return { root: { viewBox: this.viewBox }, path: { "transform-origin": `${Outline.svgRound(t2)} ${Outline.svgRound(e2)}`, transform: this.rotationTransform || null, d: this.toSVGPath() } };
  }
  getPathTranslatedSVGProperties([t2, e2], i2) {
    const [n2, s2] = i2, r2 = this.#Wl, a2 = t2 - r2[0], o2 = e2 - r2[1];
    if (this.#yh === n2 && this.#vh === s2) for (const { line: t3, points: e3 } of this.#mh) {
      Outline._translate(t3, a2, o2, t3);
      Outline._translate(e3, a2, o2, e3);
    }
    else {
      const t3 = this.#yh / n2, e3 = this.#vh / s2;
      this.#yh = n2;
      this.#vh = s2;
      for (const { line: i3, points: n3 } of this.#mh) {
        Outline._rescale(i3, a2, o2, t3, e3, i3);
        Outline._rescale(n3, a2, o2, t3, e3, n3);
      }
      r2[2] *= t3;
      r2[3] *= e3;
    }
    r2[0] = t2;
    r2[1] = e2;
    return { root: { viewBox: this.viewBox }, path: { d: this.toSVGPath(), "transform-origin": `${Outline.svgRound(t2)} ${Outline.svgRound(e2)}` } };
  }
  get defaultSVGProperties() {
    const t2 = this.#Wl;
    return { root: { viewBox: this.viewBox }, rootClass: { draw: true }, path: { d: this.toSVGPath(), "transform-origin": `${Outline.svgRound(t2[0])} ${Outline.svgRound(t2[1])}`, transform: this.rotationTransform || null }, bbox: t2 };
  }
}
class InkDrawingOptions extends DrawingOptions {
  constructor(t2) {
    super();
    this._viewParameters = t2;
    super.updateProperties({ fill: "none", stroke: AnnotationEditor._defaultLineColor, "stroke-opacity": 1, "stroke-width": 1, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-miterlimit": 10 });
  }
  updateSVGProperty(t2, e2) {
    if ("stroke-width" === t2) {
      e2 ??= this["stroke-width"];
      e2 *= this._viewParameters.realScale;
    }
    super.updateSVGProperty(t2, e2);
  }
  clone() {
    const t2 = new InkDrawingOptions(this._viewParameters);
    t2.updateAll(this);
    return t2;
  }
}
class InkEditor extends DrawingEditor {
  static _type = "ink";
  static _editorType = f.INK;
  static _defaultDrawingOptions = null;
  constructor(t2) {
    super({ ...t2, name: "inkEditor" });
    this._willKeepAspectRatio = true;
    this.defaultL10nId = "pdfjs-editor-ink-editor";
  }
  static initialize(t2, e2) {
    AnnotationEditor.initialize(t2, e2);
    this._defaultDrawingOptions = new InkDrawingOptions(e2.viewParameters);
  }
  static getDefaultDrawingOptions(t2) {
    const e2 = this._defaultDrawingOptions.clone();
    e2.updateProperties(t2);
    return e2;
  }
  static get supportMultipleDrawings() {
    return true;
  }
  static get typesMap() {
    return shadow(this, "typesMap", /* @__PURE__ */ new Map([[b.INK_THICKNESS, "stroke-width"], [b.INK_COLOR, "stroke"], [b.INK_OPACITY, "stroke-opacity"]]));
  }
  static createDrawerInstance({ x: t2, y: e2, box: [, , i2, n2], rotation: s2 }) {
    return new InkDrawOutliner(t2, e2, i2, n2, s2, this._defaultDrawingOptions["stroke-width"]);
  }
  static deserializeDraw(t2, e2, i2, n2, s2, r2) {
    return InkDrawOutline.deserialize(t2, e2, i2, n2, s2, r2);
  }
  static async deserialize(t2, e2, i2) {
    let n2 = null;
    if (t2 instanceof InkAnnotationElement) {
      const { data: { inkLists: e3, rect: i3, rotation: s3, id: r2, color: a2, opacity: o2, borderStyle: { rawWidth: l2 }, popupRef: h2, richText: c2, contentsObj: d2, creationDate: u2, modificationDate: p2 }, parent: { page: { pageNumber: g2 } } } = t2;
      n2 = t2 = { annotationType: f.INK, color: Array.from(a2), thickness: l2, opacity: o2, paths: { points: e3 }, boxes: null, pageIndex: g2 - 1, rect: i3.slice(0), rotation: s3, annotationElementId: r2, id: r2, deleted: false, popupRef: h2, richText: c2, comment: d2?.str || null, creationDate: u2, modificationDate: p2 };
    }
    const s2 = await super.deserialize(t2, e2, i2);
    s2._initialData = n2;
    t2.comment && s2.setCommentData(t2);
    return s2;
  }
  get toolbarButtons() {
    this._colorPicker ||= new BasicColorPicker(this);
    return [["colorPicker", this._colorPicker]];
  }
  get colorType() {
    return b.INK_COLOR;
  }
  get colorAndOpacityType() {
    return b.INK_COLOR_AND_OPACITY;
  }
  get opacityType() {
    return b.INK_OPACITY;
  }
  updateParams(t2, e2) {
    t2 !== b.INK_COLOR_AND_OPACITY ? super.updateParams(t2, e2) : this._updateColorAndOpacity(e2.color, e2.opacity);
  }
  static updateDefaultParams(t2, e2) {
    if (t2 !== b.INK_COLOR_AND_OPACITY) super.updateDefaultParams(t2, e2);
    else {
      super.updateDefaultParams(b.INK_COLOR, e2.color);
      super.updateDefaultParams(b.INK_OPACITY, e2.opacity);
    }
  }
  get color() {
    return this._drawingOptions.stroke;
  }
  get opacity() {
    return this._drawingOptions["stroke-opacity"];
  }
  onScaleChanging() {
    if (!this.parent) return;
    super.onScaleChanging();
    const { _drawId: t2, _drawingOptions: e2, parent: i2 } = this;
    e2.updateSVGProperty("stroke-width");
    i2.drawLayer.updateProperties(t2, e2.toSVGProperties());
  }
  static onScaleChangingWhenDrawing() {
    const t2 = this._currentParent;
    if (t2) {
      super.onScaleChangingWhenDrawing();
      this._defaultDrawingOptions.updateSVGProperty("stroke-width");
      t2.drawLayer.updateProperties(this._currentDrawId, this._defaultDrawingOptions.toSVGProperties());
    }
  }
  createDrawingOptions({ color: t2, thickness: e2, opacity: i2 }) {
    this._drawingOptions = InkEditor.getDefaultDrawingOptions({ stroke: Util.makeHexColor(...t2), "stroke-width": e2, "stroke-opacity": i2 });
  }
  serialize(t2 = false) {
    if (this.isEmpty()) return null;
    if (this.deleted) return this.serializeDeleted();
    const { lines: e2, points: i2 } = this.serializeDraw(t2), { _drawingOptions: { stroke: n2, "stroke-opacity": s2, "stroke-width": r2 } } = this, a2 = Object.assign(super.serialize(t2), { color: AnnotationEditor._colorManager.convert(n2), opacity: s2, thickness: r2, paths: { lines: e2, points: i2 } });
    this.addComment(a2);
    if (t2) {
      a2.isCopy = true;
      return a2;
    }
    if (this.annotationElementId && !this.#tl(a2)) return null;
    a2.id = this.annotationElementId;
    return a2;
  }
  #tl(t2) {
    const { color: e2, thickness: i2, opacity: n2, pageIndex: s2 } = this._initialData;
    return this.hasEditedComment || this._hasBeenMoved || this._hasBeenResized || t2.color.some((t3, i3) => t3 !== e2[i3]) || t2.thickness !== i2 || t2.opacity !== n2 || t2.pageIndex !== s2;
  }
  renderAnnotationElement(t2) {
    if (this.deleted) {
      t2.hide();
      return null;
    }
    const { points: e2, rect: i2 } = this.serializeDraw(false);
    t2.updateEdited({ rect: i2, thickness: this._drawingOptions["stroke-width"], points: e2, popup: this.comment });
    return null;
  }
}
class ContourDrawOutline extends InkDrawOutline {
  toSVGPath() {
    let t2 = super.toSVGPath();
    t2.endsWith("Z") || (t2 += "Z");
    return t2;
  }
}
class SignatureExtractor {
  static #Dh = { maxDim: 512, sigmaSFactor: 0.02, sigmaR: 25, kernelSize: 16 };
  static #Ph(t2, e2, i2, n2) {
    n2 -= e2;
    return 0 === (i2 -= t2) ? n2 > 0 ? 0 : 4 : 1 === i2 ? n2 + 6 : 2 - n2;
  }
  static #Mh = new Int32Array([0, 1, -1, 1, -1, 0, -1, -1, 0, -1, 1, -1, 1, 0, 1, 1]);
  static #Ih(t2, e2, i2, n2, s2, r2, a2) {
    const o2 = this.#Ph(i2, n2, s2, r2);
    for (let s3 = 0; s3 < 8; s3++) {
      const r3 = (-s3 + o2 - a2 + 16) % 8;
      if (0 !== t2[(i2 + this.#Mh[2 * r3]) * e2 + (n2 + this.#Mh[2 * r3 + 1])]) return r3;
    }
    return -1;
  }
  static #Fh(t2, e2, i2, n2, s2, r2, a2) {
    const o2 = this.#Ph(i2, n2, s2, r2);
    for (let s3 = 0; s3 < 8; s3++) {
      const r3 = (s3 + o2 + a2 + 16) % 8;
      if (0 !== t2[(i2 + this.#Mh[2 * r3]) * e2 + (n2 + this.#Mh[2 * r3 + 1])]) return r3;
    }
    return -1;
  }
  static #Bh(t2, e2, i2, n2) {
    const s2 = t2.length, r2 = new Int32Array(s2);
    for (let e3 = 0; e3 < s2; e3++) r2[e3] = t2[e3] <= n2 ? 1 : 0;
    for (let t3 = 1; t3 < i2 - 1; t3++) r2[t3 * e2] = r2[t3 * e2 + e2 - 1] = 0;
    for (let t3 = 0; t3 < e2; t3++) r2[t3] = r2[e2 * i2 - 1 - t3] = 0;
    let a2, o2 = 1;
    const l2 = [];
    for (let t3 = 1; t3 < i2 - 1; t3++) {
      a2 = 1;
      for (let i3 = 1; i3 < e2 - 1; i3++) {
        const n3 = t3 * e2 + i3, s3 = r2[n3];
        if (0 === s3) continue;
        let h2 = t3, c2 = i3;
        if (1 === s3 && 0 === r2[n3 - 1]) {
          o2 += 1;
          c2 -= 1;
        } else {
          if (!(s3 >= 1 && 0 === r2[n3 + 1])) {
            1 !== s3 && (a2 = Math.abs(s3));
            continue;
          }
          o2 += 1;
          c2 += 1;
          s3 > 1 && (a2 = s3);
        }
        const d2 = [i3, t3], u2 = c2 === i3 + 1, p2 = { isHole: u2, points: d2, id: o2, parent: 0 };
        l2.push(p2);
        let g2;
        for (const t4 of l2) if (t4.id === a2) {
          g2 = t4;
          break;
        }
        g2 ? g2.isHole ? p2.parent = u2 ? g2.parent : a2 : p2.parent = u2 ? a2 : g2.parent : p2.parent = u2 ? a2 : 0;
        const m2 = this.#Ih(r2, e2, t3, i3, h2, c2, 0);
        if (-1 === m2) {
          r2[n3] = -o2;
          1 !== r2[n3] && (a2 = Math.abs(r2[n3]));
          continue;
        }
        let f2 = this.#Mh[2 * m2], b2 = this.#Mh[2 * m2 + 1];
        const y2 = t3 + f2, v2 = i3 + b2;
        h2 = y2;
        c2 = v2;
        let w2 = t3, A2 = i3;
        for (; ; ) {
          const s4 = this.#Fh(r2, e2, w2, A2, h2, c2, 1);
          f2 = this.#Mh[2 * s4];
          b2 = this.#Mh[2 * s4 + 1];
          const l3 = w2 + f2, u3 = A2 + b2;
          d2.push(u3, l3);
          const p3 = w2 * e2 + A2;
          0 === r2[p3 + 1] ? r2[p3] = -o2 : 1 === r2[p3] && (r2[p3] = o2);
          if (l3 === t3 && u3 === i3 && w2 === y2 && A2 === v2) {
            1 !== r2[n3] && (a2 = Math.abs(r2[n3]));
            break;
          }
          h2 = w2;
          c2 = A2;
          w2 = l3;
          A2 = u3;
        }
      }
    }
    return l2;
  }
  static #Oh(t2, e2, i2, n2) {
    if (i2 - e2 <= 4) {
      for (let s3 = e2; s3 < i2 - 2; s3 += 2) n2.push(t2[s3], t2[s3 + 1]);
      return;
    }
    const s2 = t2[e2], r2 = t2[e2 + 1], a2 = t2[i2 - 4] - s2, o2 = t2[i2 - 3] - r2, l2 = Math.hypot(a2, o2), h2 = a2 / l2, c2 = o2 / l2, d2 = h2 * r2 - c2 * s2, u2 = o2 / a2, p2 = 1 / l2, g2 = Math.atan(u2), m2 = Math.cos(g2), f2 = Math.sin(g2), b2 = p2 * (Math.abs(m2) + Math.abs(f2)), y2 = p2 * (1 - b2 + b2 ** 2), v2 = Math.max(Math.atan(Math.abs(f2 + m2) * y2), Math.atan(Math.abs(f2 - m2) * y2));
    let w2 = 0, A2 = e2;
    for (let n3 = e2 + 2; n3 < i2 - 2; n3 += 2) {
      const e3 = Math.abs(d2 - h2 * t2[n3 + 1] + c2 * t2[n3]);
      if (e3 > w2) {
        A2 = n3;
        w2 = e3;
      }
    }
    if (w2 > (l2 * v2) ** 2) {
      this.#Oh(t2, e2, A2 + 2, n2);
      this.#Oh(t2, A2, i2, n2);
    } else n2.push(s2, r2);
  }
  static #Rh(t2) {
    const e2 = [], i2 = t2.length;
    this.#Oh(t2, 0, i2, e2);
    e2.push(t2[i2 - 2], t2[i2 - 1]);
    return e2.length <= 4 ? null : e2;
  }
  static #Lh(t2, e2, i2, n2, s2, r2) {
    const a2 = new Float32Array(r2 ** 2), o2 = -2 * n2 ** 2, l2 = r2 >> 1;
    for (let t3 = 0; t3 < r2; t3++) {
      const e3 = (t3 - l2) ** 2;
      for (let i3 = 0; i3 < r2; i3++) a2[t3 * r2 + i3] = Math.exp((e3 + (i3 - l2) ** 2) / o2);
    }
    const h2 = new Float32Array(256), c2 = -2 * s2 ** 2;
    for (let t3 = 0; t3 < 256; t3++) h2[t3] = Math.exp(t3 ** 2 / c2);
    const d2 = t2.length, u2 = new Uint8Array(d2), p2 = new Uint32Array(256);
    for (let n3 = 0; n3 < i2; n3++) for (let s3 = 0; s3 < e2; s3++) {
      const o3 = n3 * e2 + s3, c3 = t2[o3];
      let d3 = 0, g2 = 0;
      for (let o4 = 0; o4 < r2; o4++) {
        const u3 = n3 + o4 - l2;
        if (!(u3 < 0 || u3 >= i2)) for (let i3 = 0; i3 < r2; i3++) {
          const n4 = s3 + i3 - l2;
          if (n4 < 0 || n4 >= e2) continue;
          const p3 = t2[u3 * e2 + n4], m2 = a2[o4 * r2 + i3] * h2[Math.abs(p3 - c3)];
          d3 += p3 * m2;
          g2 += m2;
        }
      }
      p2[u2[o3] = Math.round(d3 / g2)]++;
    }
    return [u2, p2];
  }
  static #Nh(t2) {
    const e2 = new Uint32Array(256);
    for (const i2 of t2) e2[i2]++;
    return e2;
  }
  static #Uh(t2) {
    const e2 = t2.length, i2 = new Uint8ClampedArray(e2 >> 2);
    let n2 = -1 / 0, s2 = 1 / 0;
    for (let e3 = 0, r3 = i2.length; e3 < r3; e3++) {
      const r4 = i2[e3] = t2[e3 << 2];
      n2 = Math.max(n2, r4);
      s2 = Math.min(s2, r4);
    }
    const r2 = 255 / (n2 - s2);
    for (let t3 = 0, e3 = i2.length; t3 < e3; t3++) i2[t3] = (i2[t3] - s2) * r2;
    return i2;
  }
  static #Hh(t2) {
    let e2, i2 = -1 / 0, n2 = -1 / 0;
    const s2 = t2.findIndex((t3) => 0 !== t3);
    let r2 = s2, a2 = s2;
    for (e2 = s2; e2 < 256; e2++) {
      const s3 = t2[e2];
      if (s3 > i2) {
        if (e2 - r2 > n2) {
          n2 = e2 - r2;
          a2 = e2 - 1;
        }
        i2 = s3;
        r2 = e2;
      }
    }
    for (e2 = a2 - 1; e2 >= 0 && !(t2[e2] > t2[e2 + 1]); e2--) ;
    return e2;
  }
  static #zh(t2) {
    const e2 = t2, { width: i2, height: n2 } = t2, { maxDim: s2 } = this.#Dh;
    let r2 = i2, a2 = n2;
    if (i2 > s2 || n2 > s2) {
      let o3 = i2, l3 = n2, h2 = Math.log2(Math.max(i2, n2) / s2);
      const c2 = Math.floor(h2);
      h2 = h2 === c2 ? c2 - 1 : c2;
      for (let i3 = 0; i3 < h2; i3++) {
        r2 = Math.ceil(o3 / 2);
        a2 = Math.ceil(l3 / 2);
        const i4 = new OffscreenCanvas(r2, a2);
        i4.getContext("2d").drawImage(t2, 0, 0, o3, l3, 0, 0, r2, a2);
        o3 = r2;
        l3 = a2;
        t2 !== e2 && t2.close();
        t2 = i4.transferToImageBitmap();
      }
      const d2 = Math.min(s2 / r2, s2 / a2);
      r2 = Math.round(r2 * d2);
      a2 = Math.round(a2 * d2);
    }
    const o2 = new OffscreenCanvas(r2, a2).getContext("2d", { willReadFrequently: true });
    o2.fillStyle = "white";
    o2.fillRect(0, 0, r2, a2);
    o2.filter = "grayscale(1)";
    o2.drawImage(t2, 0, 0, t2.width, t2.height, 0, 0, r2, a2);
    const l2 = o2.getImageData(0, 0, r2, a2).data;
    return [this.#Uh(l2), r2, a2];
  }
  static extractContoursFromText(t2, { fontFamily: e2, fontStyle: i2, fontWeight: n2 }, s2, r2, a2, o2) {
    let l2 = new OffscreenCanvas(1, 1), h2 = l2.getContext("2d", { alpha: false });
    const c2 = h2.font = `${i2} ${n2} 200px ${e2}`, { actualBoundingBoxLeft: d2, actualBoundingBoxRight: u2, actualBoundingBoxAscent: p2, actualBoundingBoxDescent: g2, fontBoundingBoxAscent: m2, fontBoundingBoxDescent: f2, width: b2 } = h2.measureText(t2), y2 = 1.5, v2 = Math.ceil(Math.max(Math.abs(d2) + Math.abs(u2) || 0, b2) * y2), w2 = Math.ceil(Math.max(Math.abs(p2) + Math.abs(g2) || 200, Math.abs(m2) + Math.abs(f2) || 200) * y2);
    l2 = new OffscreenCanvas(v2, w2);
    h2 = l2.getContext("2d", { alpha: true, willReadFrequently: true });
    h2.font = c2;
    h2.filter = "grayscale(1)";
    h2.fillStyle = "white";
    h2.fillRect(0, 0, v2, w2);
    h2.fillStyle = "black";
    h2.fillText(t2, 0.5 * v2 / 2, 1.5 * w2 / 2);
    const A2 = this.#Uh(h2.getImageData(0, 0, v2, w2).data), x2 = this.#Nh(A2), C2 = this.#Hh(x2), E2 = this.#Bh(A2, v2, w2, C2);
    return this.processDrawnLines({ lines: { curves: E2, width: v2, height: w2 }, pageWidth: s2, pageHeight: r2, rotation: a2, innerMargin: o2, mustSmooth: true, areContours: true });
  }
  static process(t2, e2, i2, n2, s2) {
    const [r2, a2, o2] = this.#zh(t2), [l2, h2] = this.#Lh(r2, a2, o2, Math.hypot(a2, o2) * this.#Dh.sigmaSFactor, this.#Dh.sigmaR, this.#Dh.kernelSize), c2 = this.#Hh(h2), d2 = this.#Bh(l2, a2, o2, c2);
    return this.processDrawnLines({ lines: { curves: d2, width: a2, height: o2 }, pageWidth: e2, pageHeight: i2, rotation: n2, innerMargin: s2, mustSmooth: true, areContours: true });
  }
  static processDrawnLines({ lines: t2, pageWidth: e2, pageHeight: i2, rotation: n2, innerMargin: s2, mustSmooth: r2, areContours: a2 }) {
    n2 % 180 != 0 && ([e2, i2] = [i2, e2]);
    const { curves: o2, width: l2, height: h2 } = t2, c2 = t2.thickness ?? 0, d2 = [], u2 = Math.min(e2 / l2, i2 / h2), p2 = u2 / e2, g2 = u2 / i2, m2 = [];
    for (const { points: t3 } of o2) {
      const e3 = r2 ? this.#Rh(t3) : t3;
      if (!e3) continue;
      m2.push(e3);
      const i3 = e3.length, n3 = new Float32Array(i3), s3 = new Float32Array(3 * (2 === i3 ? 2 : i3 - 2));
      d2.push({ line: s3, points: n3 });
      if (2 === i3) {
        n3[0] = e3[0] * p2;
        n3[1] = e3[1] * g2;
        s3.set([NaN, NaN, NaN, NaN, n3[0], n3[1]], 0);
        continue;
      }
      let [a3, o3, l3, h3] = e3;
      a3 *= p2;
      o3 *= g2;
      l3 *= p2;
      h3 *= g2;
      n3.set([a3, o3, l3, h3], 0);
      s3.set([NaN, NaN, NaN, NaN, a3, o3], 0);
      for (let t4 = 4; t4 < i3; t4 += 2) {
        const i4 = n3[t4] = e3[t4] * p2, r3 = n3[t4 + 1] = e3[t4 + 1] * g2;
        s3.set(Outline.createBezierPoints(a3, o3, l3, h3, i4, r3), 3 * (t4 - 2));
        [a3, o3, l3, h3] = [l3, h3, i4, r3];
      }
    }
    if (0 === d2.length) return null;
    const f2 = a2 ? new ContourDrawOutline() : new InkDrawOutline();
    f2.build(d2, e2, i2, 1, n2, a2 ? 0 : c2, s2);
    return { outline: f2, newCurves: m2, areContours: a2, thickness: c2, width: l2, height: h2 };
  }
  static async compressSignature({ outlines: t2, areContours: e2, thickness: i2, width: n2, height: s2 }) {
    let r2, a2 = 1 / 0, o2 = -1 / 0, l2 = 0;
    for (const e3 of t2) {
      l2 += e3.length;
      for (let t3 = 2, i3 = e3.length; t3 < i3; t3++) {
        const i4 = e3[t3] - e3[t3 - 2];
        a2 = Math.min(a2, i4);
        o2 = Math.max(o2, i4);
      }
    }
    r2 = a2 >= -128 && o2 <= 127 ? Int8Array : a2 >= -32768 && o2 <= 32767 ? Int16Array : Int32Array;
    const h2 = t2.length, c2 = 8 + 3 * h2, d2 = new Uint32Array(c2);
    let u2 = 0;
    d2[u2++] = c2 * Uint32Array.BYTES_PER_ELEMENT + (l2 - 2 * h2) * r2.BYTES_PER_ELEMENT;
    d2[u2++] = 0;
    d2[u2++] = n2;
    d2[u2++] = s2;
    d2[u2++] = e2 ? 0 : 1;
    d2[u2++] = Math.max(0, Math.floor(i2 ?? 0));
    d2[u2++] = h2;
    d2[u2++] = r2.BYTES_PER_ELEMENT;
    for (const e3 of t2) {
      d2[u2++] = e3.length - 2;
      d2[u2++] = e3[0];
      d2[u2++] = e3[1];
    }
    const p2 = new CompressionStream("deflate-raw"), g2 = p2.writable.getWriter();
    await g2.ready;
    g2.write(d2);
    const m2 = r2.prototype.constructor;
    for (const e3 of t2) {
      const t3 = new m2(e3.length - 2);
      for (let i3 = 2, n3 = e3.length; i3 < n3; i3++) t3[i3 - 2] = e3[i3] - e3[i3 - 2];
      g2.write(t3);
    }
    g2.close();
    return (await new Response(p2.readable).bytes()).toBase64();
  }
  static async decompressSignature(t2) {
    try {
      const e2 = Uint8Array.fromBase64(t2), { readable: i2, writable: n2 } = new DecompressionStream("deflate-raw"), s2 = n2.getWriter();
      await s2.ready;
      s2.write(e2).then(async () => {
        await s2.ready;
        await s2.close();
      }).catch(() => {
      });
      let r2 = null, a2 = 0;
      for await (const t3 of i2) {
        r2 ||= new Uint8Array(new Uint32Array(t3.buffer, 0, 4)[0]);
        r2.set(t3, a2);
        a2 += t3.length;
      }
      const o2 = new Uint32Array(r2.buffer, 0, r2.length >> 2), l2 = o2[1];
      if (0 !== l2) throw new Error(`Invalid version: ${l2}`);
      const h2 = o2[2], c2 = o2[3], d2 = 0 === o2[4], u2 = o2[5], p2 = o2[6], g2 = o2[7], m2 = [], f2 = (8 + 3 * p2) * Uint32Array.BYTES_PER_ELEMENT;
      let b2;
      switch (g2) {
        case Int8Array.BYTES_PER_ELEMENT:
          b2 = new Int8Array(r2.buffer, f2);
          break;
        case Int16Array.BYTES_PER_ELEMENT:
          b2 = new Int16Array(r2.buffer, f2);
          break;
        case Int32Array.BYTES_PER_ELEMENT:
          b2 = new Int32Array(r2.buffer, f2);
      }
      a2 = 0;
      for (let t3 = 0; t3 < p2; t3++) {
        const e3 = o2[3 * t3 + 8], i3 = new Float32Array(e3 + 2);
        m2.push(i3);
        for (let e4 = 0; e4 < 2; e4++) i3[e4] = o2[3 * t3 + 8 + e4 + 1];
        for (let t4 = 0; t4 < e3; t4++) i3[t4 + 2] = i3[t4] + b2[a2++];
      }
      return { areContours: d2, thickness: u2, outlines: m2, width: h2, height: c2 };
    } catch (t3) {
      warn(`decompressSignature: ${t3}`);
      return null;
    }
  }
}
class SignatureOptions extends DrawingOptions {
  constructor() {
    super();
    super.updateProperties({ fill: AnnotationEditor._defaultLineColor, "stroke-width": 0 });
  }
  clone() {
    const t2 = new SignatureOptions();
    t2.updateAll(this);
    return t2;
  }
}
class DrawnSignatureOptions extends InkDrawingOptions {
  constructor(t2) {
    super(t2);
    super.updateProperties({ stroke: AnnotationEditor._defaultLineColor, "stroke-width": 1 });
  }
  clone() {
    const t2 = new DrawnSignatureOptions(this._viewParameters);
    t2.updateAll(this);
    return t2;
  }
}
class SignatureEditor extends DrawingEditor {
  #Gh = false;
  #Vh = null;
  #Wh = null;
  #$h = null;
  static _type = "signature";
  static _editorType = f.SIGNATURE;
  static _defaultDrawingOptions = null;
  constructor(t2) {
    super({ ...t2, mustBeCommitted: true, name: "signatureEditor" });
    this._willKeepAspectRatio = true;
    this.#Wh = t2.signatureData || null;
    this.#Vh = null;
    this.defaultL10nId = "pdfjs-editor-signature-editor1";
  }
  static initialize(t2, e2) {
    AnnotationEditor.initialize(t2, e2);
    this._defaultDrawingOptions = new SignatureOptions();
    this._defaultDrawnSignatureOptions = new DrawnSignatureOptions(e2.viewParameters);
  }
  static getDefaultDrawingOptions(t2) {
    const e2 = this._defaultDrawingOptions.clone();
    e2.updateProperties(t2);
    return e2;
  }
  static get supportMultipleDrawings() {
    return false;
  }
  static get typesMap() {
    return shadow(this, "typesMap", /* @__PURE__ */ new Map());
  }
  static get isDrawer() {
    return false;
  }
  get telemetryFinalData() {
    return { type: "signature", hasDescription: !!this.#Vh };
  }
  static computeTelemetryFinalData(t2) {
    const e2 = t2.get("hasDescription");
    return { hasAltText: e2.get(true) ?? 0, hasNoAltText: e2.get(false) ?? 0 };
  }
  get isResizable() {
    return true;
  }
  onScaleChanging() {
    null !== this._drawId && super.onScaleChanging();
  }
  render() {
    if (this.div) return this.div;
    let t2, e2;
    const { _isCopy: i2 } = this;
    if (i2) {
      this._isCopy = false;
      t2 = this.x;
      e2 = this.y;
    }
    super.render();
    if (null === this._drawId) if (this.#Wh) {
      const { lines: t3, mustSmooth: e3, areContours: i3, description: n2, uuid: s2, heightInPage: r2 } = this.#Wh, { rawDims: { pageWidth: a2, pageHeight: o2 }, rotation: l2 } = this.parent.viewport, h2 = SignatureExtractor.processDrawnLines({ lines: t3, pageWidth: a2, pageHeight: o2, rotation: l2, innerMargin: SignatureEditor._INNER_MARGIN, mustSmooth: e3, areContours: i3 });
      this.addSignature(h2, r2, n2, s2);
    } else {
      this.div.setAttribute("data-l10n-args", JSON.stringify({ description: "" }));
      this.div.hidden = true;
      this._uiManager.getSignature(this);
    }
    else this.div.setAttribute("data-l10n-args", JSON.stringify({ description: this.#Vh || "" }));
    if (i2) {
      this._isCopy = true;
      this._moveAfterPaste(t2, e2);
    }
    return this.div;
  }
  setUuid(t2) {
    this.#$h = t2;
    this.addEditToolbar();
  }
  getUuid() {
    return this.#$h;
  }
  get description() {
    return this.#Vh;
  }
  set description(t2) {
    this.#Vh = t2;
    if (this.div) {
      this.div.setAttribute("data-l10n-args", JSON.stringify({ description: t2 }));
      super.addEditToolbar().then((e2) => {
        e2?.updateEditSignatureButton(t2);
      });
    }
  }
  getSignaturePreview() {
    const { newCurves: t2, areContours: e2, thickness: i2, width: n2, height: s2 } = this.#Wh, r2 = Math.max(n2, s2);
    return { areContours: e2, outline: SignatureExtractor.processDrawnLines({ lines: { curves: t2.map((t3) => ({ points: t3 })), thickness: i2, width: n2, height: s2 }, pageWidth: r2, pageHeight: r2, rotation: 0, innerMargin: 0, mustSmooth: false, areContours: e2 }).outline };
  }
  get toolbarButtons() {
    return this._uiManager.signatureManager ? [["editSignature", this._uiManager.signatureManager]] : super.toolbarButtons;
  }
  addSignature(t2, e2, i2, n2) {
    const { x: s2, y: r2 } = this, { outline: a2 } = this.#Wh = t2;
    this.#Gh = a2 instanceof ContourDrawOutline;
    this.description = i2;
    let o2;
    if (this.#Gh) o2 = SignatureEditor.getDefaultDrawingOptions();
    else {
      o2 = SignatureEditor._defaultDrawnSignatureOptions.clone();
      o2.updateProperties({ "stroke-width": a2.thickness });
    }
    this._addOutlines({ drawOutlines: a2, drawingOptions: o2 });
    const [, l2] = this.pageDimensions;
    let h2 = e2 / l2;
    h2 = h2 >= 1 ? 0.5 : h2;
    this.width *= h2 / this.height;
    if (this.width >= 1) {
      h2 *= 0.9 / this.width;
      this.width = 0.9;
    }
    this.height = h2;
    this.setDims();
    this.x = s2;
    this.y = r2;
    this.center();
    this._onResized();
    this.onScaleChanging();
    this.rotate();
    this._uiManager.addToAnnotationStorage(this);
    this.setUuid(n2);
    this._reportTelemetry({ action: "pdfjs.signature.inserted", data: { hasBeenSaved: !!n2, hasDescription: !!i2 } });
    this.div.hidden = false;
  }
  getFromImage(t2) {
    const { rawDims: { pageWidth: e2, pageHeight: i2 }, rotation: n2 } = this.parent.viewport;
    return SignatureExtractor.process(t2, e2, i2, n2, SignatureEditor._INNER_MARGIN);
  }
  getFromText(t2, e2) {
    const { rawDims: { pageWidth: i2, pageHeight: n2 }, rotation: s2 } = this.parent.viewport;
    return SignatureExtractor.extractContoursFromText(t2, e2, i2, n2, s2, SignatureEditor._INNER_MARGIN);
  }
  getDrawnSignature(t2) {
    const { rawDims: { pageWidth: e2, pageHeight: i2 }, rotation: n2 } = this.parent.viewport;
    return SignatureExtractor.processDrawnLines({ lines: t2, pageWidth: e2, pageHeight: i2, rotation: n2, innerMargin: SignatureEditor._INNER_MARGIN, mustSmooth: false, areContours: false });
  }
  createDrawingOptions({ areContours: t2, thickness: e2 }) {
    if (t2) this._drawingOptions = SignatureEditor.getDefaultDrawingOptions();
    else {
      this._drawingOptions = SignatureEditor._defaultDrawnSignatureOptions.clone();
      this._drawingOptions.updateProperties({ "stroke-width": e2 });
    }
  }
  serialize(t2 = false) {
    if (this.isEmpty()) return null;
    const { lines: e2, points: i2 } = this.serializeDraw(t2), { _drawingOptions: { "stroke-width": n2 } } = this, s2 = Object.assign(super.serialize(t2), { isSignature: true, areContours: this.#Gh, color: [0, 0, 0], thickness: this.#Gh ? 0 : n2 });
    this.addComment(s2);
    if (t2) {
      s2.paths = { lines: e2, points: i2 };
      s2.uuid = this.#$h;
      s2.isCopy = true;
    } else s2.lines = e2;
    this.#Vh && (s2.accessibilityData = { type: "Figure", alt: this.#Vh });
    return s2;
  }
  static deserializeDraw(t2, e2, i2, n2, s2, r2) {
    return r2.areContours ? ContourDrawOutline.deserialize(t2, e2, i2, n2, s2, r2) : InkDrawOutline.deserialize(t2, e2, i2, n2, s2, r2);
  }
  static async deserialize(t2, e2, i2) {
    const n2 = await super.deserialize(t2, e2, i2);
    n2.#Gh = t2.areContours;
    n2.description = t2.accessibilityData?.alt || "";
    n2.#$h = t2.uuid;
    return n2;
  }
}
class StampEditor extends AnnotationEditor {
  #jh = null;
  #Xh = null;
  #Kh = null;
  #Yh = null;
  #qh = null;
  #Qh = "";
  #Jh = null;
  #Zh = false;
  #tc = null;
  #ec = false;
  #ic = false;
  static _type = "stamp";
  static _editorType = f.STAMP;
  constructor(t2) {
    super({ ...t2, name: "stampEditor" });
    this.#Yh = t2.bitmapUrl;
    this.#qh = t2.bitmapFile;
    this.defaultL10nId = "pdfjs-editor-stamp-editor";
  }
  static initialize(t2, e2) {
    AnnotationEditor.initialize(t2, e2);
  }
  static isHandlingMimeForPasting(t2) {
    return j.has(t2);
  }
  static paste(t2, e2) {
    e2.pasteEditor({ mode: f.STAMP }, { bitmapFile: t2.getAsFile() });
  }
  altTextFinish() {
    this._uiManager.useNewAltTextFlow && (this.div.hidden = false);
    super.altTextFinish();
  }
  get telemetryFinalData() {
    return { type: "stamp", hasAltText: !!this.altTextData?.altText };
  }
  static computeTelemetryFinalData(t2) {
    const e2 = t2.get("hasAltText");
    return { hasAltText: e2.get(true) ?? 0, hasNoAltText: e2.get(false) ?? 0 };
  }
  #nc(t2, e2 = false) {
    if (t2) {
      this.#jh = t2.bitmap;
      if (!e2) {
        this.#Xh = t2.id;
        this.#ec = t2.isSvg;
      }
      t2.file && (this.#Qh = t2.file.name);
      this.#sc();
    } else this.remove();
  }
  #rc() {
    this.#Kh = null;
    this._uiManager.enableWaiting(false);
    if (this.#Jh) if (this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && this.#jh) this.addEditToolbar().then(() => {
      this._editToolbar.hide();
      this._uiManager.editAltText(this, true);
    });
    else {
      if (!this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && this.#jh) {
        this._reportTelemetry({ action: "pdfjs.image.image_added", data: { alt_text_modal: false, alt_text_type: "empty" } });
        try {
          this.mlGuessAltText();
        } catch {
        }
      }
      this.div.focus();
    }
  }
  async mlGuessAltText(t2 = null, e2 = true) {
    if (this.hasAltTextData()) return null;
    const { mlManager: i2 } = this._uiManager;
    if (!i2) throw new Error("No ML.");
    if (!await i2.isEnabledFor("altText")) throw new Error("ML isn't enabled for alt text.");
    const { data: n2, width: s2, height: r2 } = t2 || this.copyCanvas(null, null, true).imageData, a2 = await i2.guess({ name: "altText", request: { data: n2, width: s2, height: r2, channels: n2.length / (s2 * r2) } });
    if (!a2) throw new Error("No response from the AI service.");
    if (a2.error) throw new Error("Error from the AI service.");
    if (a2.cancel) return null;
    if (!a2.output) throw new Error("No valid response from the AI service.");
    const o2 = a2.output;
    await this.setGuessedAltText(o2);
    e2 && !this.hasAltTextData() && (this.altTextData = { alt: o2, decorative: false });
    return o2;
  }
  #ac() {
    if (this.#Xh) {
      this._uiManager.enableWaiting(true);
      this._uiManager.imageManager.getFromId(this.#Xh).then((t3) => this.#nc(t3, true)).finally(() => this.#rc());
      return;
    }
    if (this.#Yh) {
      const t3 = this.#Yh;
      this.#Yh = null;
      this._uiManager.enableWaiting(true);
      this.#Kh = this._uiManager.imageManager.getFromUrl(t3).then((t4) => this.#nc(t4)).finally(() => this.#rc());
      return;
    }
    if (this.#qh) {
      const t3 = this.#qh;
      this.#qh = null;
      this._uiManager.enableWaiting(true);
      this.#Kh = this._uiManager.imageManager.getFromFile(t3).then((t4) => this.#nc(t4)).finally(() => this.#rc());
      return;
    }
    const t2 = document.createElement("input");
    t2.type = "file";
    t2.accept = j.keys().join(",");
    const e2 = this._uiManager._signal;
    this.#Kh = new Promise((i2) => {
      t2.addEventListener("change", async () => {
        if (t2.files && 0 !== t2.files.length) {
          this._uiManager.enableWaiting(true);
          const e3 = await this._uiManager.imageManager.getFromFile(t2.files[0]);
          this._reportTelemetry({ action: "pdfjs.image.image_selected", data: { alt_text_modal: this._uiManager.useNewAltTextFlow } });
          this.#nc(e3);
        } else this.remove();
        i2();
      }, { signal: e2 });
      t2.addEventListener("cancel", () => {
        this.remove();
        i2();
      }, { signal: e2 });
    }).finally(() => this.#rc());
    t2.click();
  }
  remove() {
    if (this.#Xh) {
      this.#jh = null;
      this._uiManager.imageManager.deleteId(this.#Xh);
      this.#Jh?.remove();
      this.#Jh = null;
      if (this.#tc) {
        clearTimeout(this.#tc);
        this.#tc = null;
      }
    }
    super.remove();
  }
  rebuild() {
    if (this.parent) {
      super.rebuild();
      if (null !== this.div) {
        this.#Xh && null === this.#Jh && this.#ac();
        this.isAttachedToDOM || this.parent.add(this);
      }
    } else this.#Xh && this.#ac();
  }
  onceAdded(t2) {
    this._isDraggable = true;
    t2 && this.div.focus();
  }
  isEmpty() {
    return !(this.#Kh || this.#jh || this.#Yh || this.#qh || this.#Xh || this.#Zh);
  }
  get toolbarButtons() {
    return [["altText", this.createAltText()]];
  }
  get isResizable() {
    return true;
  }
  render() {
    if (this.div) return this.div;
    let t2, e2;
    if (this._isCopy) {
      t2 = this.x;
      e2 = this.y;
    }
    super.render();
    this.div.hidden = true;
    this.createAltText();
    this.#Zh || (this.#jh ? this.#sc() : this.#ac());
    this._isCopy && this._moveAfterPaste(t2, e2);
    this._uiManager.addShouldRescale(this);
    return this.div;
  }
  setCanvas(t2, e2) {
    const { id: i2, bitmap: n2 } = this._uiManager.imageManager.getFromCanvas(t2, e2);
    e2.remove();
    if (i2 && this._uiManager.imageManager.isValidId(i2)) {
      this.#Xh = i2;
      n2 && (this.#jh = n2);
      this.#Zh = false;
      this.#sc();
    }
  }
  _onResized() {
    this.onScaleChanging();
  }
  onScaleChanging() {
    if (!this.parent) return;
    null !== this.#tc && clearTimeout(this.#tc);
    this.#tc = setTimeout(() => {
      this.#tc = null;
      this.#oc();
    }, 200);
  }
  #sc() {
    const { div: t2 } = this;
    let { width: e2, height: i2 } = this.#jh;
    const [n2, s2] = this.pageDimensions, r2 = 0.75;
    if (this.width) {
      e2 = this.width * n2;
      i2 = this.height * s2;
    } else if (e2 > r2 * n2 || i2 > r2 * s2) {
      const t3 = Math.min(r2 * n2 / e2, r2 * s2 / i2);
      e2 *= t3;
      i2 *= t3;
    }
    this._uiManager.enableWaiting(false);
    const a2 = this.#Jh = document.createElement("canvas");
    a2.setAttribute("role", "img");
    this.addContainer(a2);
    this.width = e2 / n2;
    this.height = i2 / s2;
    this.setDims();
    this._initialOptions?.isCentered ? this.center() : this.fixAndSetPosition();
    this._initialOptions = null;
    this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && !this.annotationElementId || (t2.hidden = false);
    this.#oc();
    if (!this.#ic) {
      this.parent.addUndoableEditor(this);
      this.#ic = true;
    }
    this._reportTelemetry({ action: "inserted_image" });
    this.#Qh && this.div.setAttribute("aria-description", this.#Qh);
    this.annotationElementId || this._uiManager.a11yAlert(AnnotationEditor._l10nAlert.stamp);
  }
  copyCanvas(t2, e2, i2 = false) {
    t2 ||= 224;
    const { width: n2, height: s2 } = this.#jh, r2 = new OutputScale();
    let a2 = this.#jh, o2 = n2, l2 = s2, h2 = null;
    if (e2) {
      if (n2 > e2 || s2 > e2) {
        const t4 = Math.min(e2 / n2, e2 / s2);
        o2 = Math.floor(n2 * t4);
        l2 = Math.floor(s2 * t4);
      }
      h2 = document.createElement("canvas");
      const t3 = h2.width = Math.ceil(o2 * r2.sx), i3 = h2.height = Math.ceil(l2 * r2.sy);
      this.#ec || (a2 = this.#lc(t3, i3));
      const c3 = h2.getContext("2d");
      c3.filter = this._uiManager.hcmFilter;
      let d2 = "white", u2 = "#cfcfd8";
      if ("none" !== this._uiManager.hcmFilter) u2 = "black";
      else if (ColorScheme.isDarkMode) {
        d2 = "#8f8f9d";
        u2 = "#42414d";
      }
      const p2 = 15, g2 = p2 * r2.sx, m2 = p2 * r2.sy, f2 = new OffscreenCanvas(2 * g2, 2 * m2), b2 = f2.getContext("2d");
      b2.fillStyle = d2;
      b2.fillRect(0, 0, 2 * g2, 2 * m2);
      b2.fillStyle = u2;
      b2.fillRect(0, 0, g2, m2);
      b2.fillRect(g2, m2, g2, m2);
      c3.fillStyle = c3.createPattern(f2, "repeat");
      c3.fillRect(0, 0, t3, i3);
      c3.drawImage(a2, 0, 0, a2.width, a2.height, 0, 0, t3, i3);
    }
    let c2 = null;
    if (i2) {
      let e3, i3;
      if (r2.symmetric && a2.width < t2 && a2.height < t2) {
        e3 = a2.width;
        i3 = a2.height;
      } else {
        a2 = this.#jh;
        if (n2 > t2 || s2 > t2) {
          const r3 = Math.min(t2 / n2, t2 / s2);
          e3 = Math.floor(n2 * r3);
          i3 = Math.floor(s2 * r3);
          this.#ec || (a2 = this.#lc(e3, i3));
        }
      }
      const o3 = new OffscreenCanvas(e3, i3).getContext("2d", { willReadFrequently: true });
      o3.drawImage(a2, 0, 0, a2.width, a2.height, 0, 0, e3, i3);
      c2 = { width: e3, height: i3, data: o3.getImageData(0, 0, e3, i3).data };
    }
    return { canvas: h2, width: o2, height: l2, imageData: c2 };
  }
  #lc(t2, e2) {
    const { width: i2, height: n2 } = this.#jh;
    let s2 = i2, r2 = n2, a2 = this.#jh;
    for (; s2 > 2 * t2 || r2 > 2 * e2; ) {
      const i3 = s2, n3 = r2;
      s2 > 2 * t2 && (s2 = Math.ceil(s2 / 2));
      r2 > 2 * e2 && (r2 = Math.ceil(r2 / 2));
      const o2 = new OffscreenCanvas(s2, r2);
      o2.getContext("2d").drawImage(a2, 0, 0, i3, n3, 0, 0, s2, r2);
      a2 = o2.transferToImageBitmap();
    }
    return a2;
  }
  #oc() {
    const [t2, e2] = this.parentDimensions, { width: i2, height: n2 } = this, s2 = new OutputScale(), r2 = Math.ceil(i2 * t2 * s2.sx), a2 = Math.ceil(n2 * e2 * s2.sy), o2 = this.#Jh;
    if (!o2 || o2.width === r2 && o2.height === a2) return;
    o2.width = r2;
    o2.height = a2;
    const l2 = this.#ec ? this.#jh : this.#lc(r2, a2), h2 = o2.getContext("2d");
    h2.filter = this._uiManager.hcmFilter;
    h2.drawImage(l2, 0, 0, l2.width, l2.height, 0, 0, r2, a2);
  }
  #hc(t2) {
    if (t2) {
      if (this.#ec) {
        const t4 = this._uiManager.imageManager.getSvgUrl(this.#Xh);
        if (t4) return t4;
      }
      const t3 = document.createElement("canvas");
      ({ width: t3.width, height: t3.height } = this.#jh);
      t3.getContext("2d").drawImage(this.#jh, 0, 0);
      return t3.toDataURL();
    }
    if (this.#ec) {
      const [t3, e2] = this.pageDimensions, i2 = Math.round(this.width * t3 * PixelsPerInch.PDF_TO_CSS_UNITS), n2 = Math.round(this.height * e2 * PixelsPerInch.PDF_TO_CSS_UNITS), s2 = new OffscreenCanvas(i2, n2);
      s2.getContext("2d").drawImage(this.#jh, 0, 0, this.#jh.width, this.#jh.height, 0, 0, i2, n2);
      return s2.transferToImageBitmap();
    }
    return structuredClone(this.#jh);
  }
  static async deserialize(t2, e2, i2) {
    let n2 = null, s2 = false;
    if (t2 instanceof StampAnnotationElement) {
      const { data: { rect: r3, rotation: a3, id: o3, structParent: l3, popupRef: h3, richText: c3, contentsObj: d3, creationDate: u3, modificationDate: p3 }, container: m2, parent: { page: { pageNumber: b2 } }, canvas: y2 } = t2;
      let v2, w2;
      if (y2) {
        delete t2.canvas;
        ({ id: v2, bitmap: w2 } = i2.imageManager.getFromCanvas(m2.id, y2));
        y2.remove();
      } else {
        s2 = true;
        t2._hasNoCanvas = true;
      }
      const A2 = (await e2._structTree.getAriaAttributes(`${g}${o3}`))?.get("aria-label") || "";
      n2 = t2 = { annotationType: f.STAMP, bitmapId: v2, bitmap: w2, pageIndex: b2 - 1, rect: r3.slice(0), rotation: a3, annotationElementId: o3, id: o3, deleted: false, accessibilityData: { decorative: false, altText: A2 }, isSvg: false, structParent: l3, popupRef: h3, richText: c3, comment: d3?.str || null, creationDate: u3, modificationDate: p3 };
    }
    const r2 = await super.deserialize(t2, e2, i2), { rect: a2, bitmap: o2, bitmapUrl: l2, bitmapId: h2, isSvg: c2, accessibilityData: d2 } = t2;
    if (s2) {
      i2.addMissingCanvas(t2.id, r2);
      r2.#Zh = true;
    } else if (h2 && i2.imageManager.isValidId(h2)) {
      r2.#Xh = h2;
      o2 && (r2.#jh = o2);
    } else r2.#Yh = l2;
    r2.#ec = c2;
    const [u2, p2] = r2.pageDimensions;
    r2.width = (a2[2] - a2[0]) / u2;
    r2.height = (a2[3] - a2[1]) / p2;
    d2 && (r2.altTextData = d2);
    r2._initialData = n2;
    t2.comment && r2.setCommentData(t2);
    r2.#ic = !!n2;
    return r2;
  }
  serialize(t2 = false, e2 = null) {
    if (this.isEmpty()) return null;
    if (this.deleted) return this.serializeDeleted();
    const i2 = Object.assign(super.serialize(t2), { bitmapId: this.#Xh, isSvg: this.#ec });
    this.addComment(i2);
    if (t2) {
      i2.bitmapUrl = this.#hc(true);
      i2.accessibilityData = this.serializeAltText(true);
      i2.isCopy = true;
      return i2;
    }
    const { decorative: n2, altText: s2 } = this.serializeAltText(false);
    !n2 && s2 && (i2.accessibilityData = { type: "Figure", alt: s2 });
    if (this.annotationElementId) {
      const t3 = this.#tl(i2);
      if (t3.isSame) return null;
      t3.isSameAltText ? delete i2.accessibilityData : i2.accessibilityData.structParent = this._initialData.structParent ?? -1;
      i2.id = this.annotationElementId;
      delete i2.bitmapId;
      return i2;
    }
    if (null === e2) return i2;
    e2.stamps ||= /* @__PURE__ */ new Map();
    const r2 = this.#ec ? (i2.rect[2] - i2.rect[0]) * (i2.rect[3] - i2.rect[1]) : null;
    if (e2.stamps.has(this.#Xh)) {
      if (this.#ec) {
        const t3 = e2.stamps.get(this.#Xh);
        if (r2 > t3.area) {
          t3.area = r2;
          t3.serialized.bitmap.close();
          t3.serialized.bitmap = this.#hc(false);
        }
      }
    } else {
      e2.stamps.set(this.#Xh, { area: r2, serialized: i2 });
      i2.bitmap = this.#hc(false);
    }
    return i2;
  }
  #tl(t2) {
    const { pageIndex: e2, accessibilityData: { altText: i2 } } = this._initialData, n2 = t2.pageIndex === e2, s2 = (t2.accessibilityData?.alt || "") === i2;
    return { isSame: !this.hasEditedComment && !this._hasBeenMoved && !this._hasBeenResized && n2 && s2, isSameAltText: s2 };
  }
  renderAnnotationElement(t2) {
    if (this.deleted) {
      t2.hide();
      return null;
    }
    t2.updateEdited({ rect: this.getPDFRect(), popup: this.comment });
    return null;
  }
}
class AnnotationEditorLayer {
  #Ro;
  #cc = false;
  #dc = null;
  #uc = null;
  #pc = null;
  #gc = /* @__PURE__ */ new Map();
  #mc = false;
  #fc = false;
  #bc = false;
  #yc = null;
  #vc = null;
  #wc = null;
  #Ac = null;
  #xc = null;
  #Cc = -1;
  #v;
  static _initialized = false;
  static #tt = new Map([FreeTextEditor, InkEditor, StampEditor, HighlightEditor, SignatureEditor].map((t2) => [t2._editorType, t2]));
  constructor({ uiManager: t2, pageIndex: e2, div: i2, structTreeLayer: n2, accessibilityManager: s2, annotationLayer: r2, drawLayer: a2, textLayer: o2, viewport: l2, l10n: h2 }) {
    const c2 = [...AnnotationEditorLayer.#tt.values()];
    if (!AnnotationEditorLayer._initialized) {
      AnnotationEditorLayer._initialized = true;
      for (const e3 of c2) e3.initialize(h2, t2);
    }
    t2.registerEditorTypes(c2);
    this.#v = t2;
    this.pageIndex = e2;
    this.div = i2;
    this.#Ro = s2;
    this.#dc = r2;
    this.viewport = l2;
    this.#wc = o2;
    this.drawLayer = a2;
    this._structTree = n2;
    this.#v.addLayer(this);
  }
  get isEmpty() {
    return 0 === this.#gc.size;
  }
  get isInvisible() {
    return this.isEmpty && this.#v.getMode() === f.NONE;
  }
  updateToolbar(t2) {
    this.#v.updateToolbar(t2);
  }
  updateMode(t2 = this.#v.getMode()) {
    this.#Ec();
    switch (t2) {
      case f.NONE:
        this.div.classList.toggle("nonEditing", true);
        this.disableTextSelection();
        this.togglePointerEvents(false);
        this.toggleAnnotationLayerPointerEvents(true);
        this.disableClick();
        return;
      case f.INK:
        this.disableTextSelection();
        this.togglePointerEvents(true);
        this.enableClick();
        break;
      case f.HIGHLIGHT:
        this.enableTextSelection();
        this.togglePointerEvents(false);
        this.disableClick();
        break;
      default:
        this.disableTextSelection();
        this.togglePointerEvents(true);
        this.enableClick();
    }
    this.toggleAnnotationLayerPointerEvents(false);
    const { classList: e2 } = this.div;
    e2.toggle("nonEditing", false);
    if (t2 === f.POPUP) e2.toggle("commentEditing", true);
    else {
      e2.toggle("commentEditing", false);
      for (const i2 of AnnotationEditorLayer.#tt.values()) e2.toggle(`${i2._type}Editing`, t2 === i2._editorType);
    }
    this.div.hidden = false;
  }
  hasTextLayer(t2) {
    return t2 === this.#wc?.div;
  }
  setEditingState(t2) {
    this.#v.setEditingState(t2);
  }
  addCommands(t2) {
    this.#v.addCommands(t2);
  }
  cleanUndoStack(t2) {
    this.#v.cleanUndoStack(t2);
  }
  toggleDrawing(t2 = false) {
    this.div.classList.toggle("drawing", !t2);
  }
  togglePointerEvents(t2 = false) {
    this.div.classList.toggle("disabled", !t2);
  }
  toggleAnnotationLayerPointerEvents(t2 = false) {
    this.#dc?.togglePointerEvents(t2);
  }
  get #Sc() {
    return 0 !== this.#gc.size ? this.#gc.values() : this.#v.getEditors(this.pageIndex);
  }
  async enable() {
    this.#bc = true;
    this.div.tabIndex = 0;
    this.togglePointerEvents(true);
    this.div.classList.toggle("nonEditing", false);
    this.#xc?.abort();
    this.#xc = null;
    const t2 = /* @__PURE__ */ new Set();
    for (const e3 of this.#Sc) {
      e3.enableEditing();
      e3.show(true);
      if (e3.annotationElementId) {
        this.#v.removeChangedExistingAnnotation(e3);
        t2.add(e3.annotationElementId);
      }
    }
    const e2 = this.#dc;
    if (e2) for (const i2 of e2.getEditableAnnotations()) {
      i2.hide();
      if (this.#v.isDeletedAnnotationElement(i2.data.id) || t2.has(i2.data.id)) continue;
      const e3 = await this.deserialize(i2);
      if (e3) {
        this.addOrRebuild(e3);
        e3.enableEditing();
      }
    }
    this.#bc = false;
    this.#v._eventBus.dispatch("editorsrendered", { source: this, pageNumber: this.pageIndex + 1 });
  }
  disable() {
    this.#fc = true;
    this.div.tabIndex = -1;
    this.togglePointerEvents(false);
    this.div.classList.toggle("nonEditing", true);
    if (this.#wc && !this.#xc) {
      this.#xc = new AbortController();
      const t3 = this.#v.combinedSignal(this.#xc);
      this.#wc.div.addEventListener("pointerdown", (t4) => {
        const { clientX: e3, clientY: i3, timeStamp: n2 } = t4;
        if (n2 - this.#Cc > 500) {
          this.#Cc = n2;
          return;
        }
        this.#Cc = -1;
        const { classList: s2 } = this.div;
        s2.toggle("getElements", true);
        const r2 = document.elementsFromPoint(e3, i3);
        s2.toggle("getElements", false);
        if (!this.div.contains(r2[0])) return;
        let a2;
        const o2 = new RegExp(`^${m}[0-9]+$`);
        for (const t5 of r2) if (o2.test(t5.id)) {
          a2 = t5.id;
          break;
        }
        if (!a2) return;
        const l2 = this.#gc.get(a2);
        if (null === l2?.annotationElementId) {
          stopEvent(t4);
          l2.dblclick(t4);
        }
      }, { signal: t3, capture: true });
    }
    const t2 = this.#dc, e2 = [];
    if (t2) {
      const i3 = /* @__PURE__ */ new Map(), n2 = /* @__PURE__ */ new Map();
      for (const t3 of this.#Sc) {
        t3.disableEditing();
        if (t3.annotationElementId) if (null === t3.serialize()) {
          n2.set(t3.annotationElementId, t3);
          this.getEditableAnnotation(t3.annotationElementId)?.show();
          t3.remove();
        } else i3.set(t3.annotationElementId, t3);
        else e2.push(t3);
      }
      for (const e3 of t2.getEditableAnnotations()) {
        const { id: t3 } = e3.data;
        if (this.#v.isDeletedAnnotationElement(t3)) {
          e3.updateEdited({ deleted: true });
          continue;
        }
        let s2 = n2.get(t3);
        if (s2) {
          s2.resetAnnotationElement(e3);
          s2.show(false);
          e3.show();
        } else {
          s2 = i3.get(t3);
          if (s2) {
            this.#v.addChangedExistingAnnotation(s2);
            s2.renderAnnotationElement(e3) && s2.show(false);
          }
          e3.show();
        }
      }
    }
    this.#Ec();
    this.isEmpty && (this.div.hidden = true);
    const { classList: i2 } = this.div;
    for (const t3 of AnnotationEditorLayer.#tt.values()) i2.remove(`${t3._type}Editing`);
    this.disableTextSelection();
    this.toggleAnnotationLayerPointerEvents(true);
    t2?.updateFakeAnnotations(e2);
    this.#fc = false;
  }
  getEditableAnnotation(t2) {
    return this.#dc?.getEditableAnnotation(t2) || null;
  }
  setActiveEditor(t2) {
    this.#v.getActive() !== t2 && this.#v.setActiveEditor(t2);
  }
  enableTextSelection() {
    this.div.tabIndex = -1;
    if (this.#wc?.div && !this.#Ac) {
      this.#Ac = new AbortController();
      const t2 = this.#v.combinedSignal(this.#Ac);
      this.#wc.div.addEventListener("pointerdown", this.#Tc.bind(this), { signal: t2 });
      this.#wc.div.classList.add("highlighting");
    }
  }
  disableTextSelection() {
    this.div.tabIndex = 0;
    if (this.#wc?.div && this.#Ac) {
      this.#Ac.abort();
      this.#Ac = null;
      this.#wc.div.classList.remove("highlighting");
    }
  }
  #Tc(t2) {
    this.#v.unselectAll();
    const { target: e2 } = t2;
    if (e2 === this.#wc.div || ("img" === e2.getAttribute("role") || e2.classList.contains("endOfContent") || e2.classList.contains("textLayerImages") || e2.classList.contains("textLayerImagePlaceholder")) && this.#wc.div.contains(e2)) {
      const { isMac: e3 } = FeatureTest.platform;
      if (0 !== t2.button || t2.ctrlKey && e3) return;
      this.#v.showAllEditors("highlight", true, true);
      HighlightEditor.startDrawing(this, this.#v, "ltr" === this.#v.direction, t2);
      t2.preventDefault();
    }
  }
  enableClick() {
    if (this.#uc) return;
    this.#uc = new AbortController();
    const t2 = this.#v.combinedSignal(this.#uc);
    this.div.addEventListener("pointerdown", this.pointerdown.bind(this), { signal: t2 });
    const e2 = this.pointerup.bind(this);
    this.div.addEventListener("pointerup", e2, { signal: t2 });
    this.div.addEventListener("pointercancel", e2, { signal: t2 });
  }
  disableClick() {
    this.#uc?.abort();
    this.#uc = null;
  }
  attach(t2) {
    this.#gc.set(t2.id, t2);
    const { annotationElementId: e2 } = t2;
    e2 && this.#v.isDeletedAnnotationElement(e2) && this.#v.removeDeletedAnnotationElement(t2);
  }
  detach(t2) {
    this.#gc.delete(t2.id);
    this.#Ro?.removePointerInTextLayer(t2.contentDiv);
    !this.#fc && t2.annotationElementId && this.#v.addDeletedAnnotationElement(t2);
  }
  remove(t2) {
    this.detach(t2);
    this.#v.removeEditor(t2);
    t2.div.remove();
    t2.isAttachedToDOM = false;
  }
  changeParent(t2) {
    if (t2.parent !== this) {
      if (t2.parent && t2.annotationElementId) {
        this.#v.addDeletedAnnotationElement(t2);
        AnnotationEditor.deleteAnnotationElement(t2);
        t2.annotationElementId = null;
      }
      this.attach(t2);
      t2.parent?.detach(t2);
      t2.setParent(this);
      if (t2.div && t2.isAttachedToDOM) {
        t2.div.remove();
        this.div.append(t2.div);
      }
    }
  }
  add(t2) {
    if (t2.parent !== this || !t2.isAttachedToDOM) {
      this.changeParent(t2);
      this.#v.addEditor(t2);
      this.attach(t2);
      if (!t2.isAttachedToDOM) {
        const e2 = t2.render();
        this.div.append(e2);
        t2.isAttachedToDOM = true;
      }
      t2.fixAndSetPosition();
      t2.onceAdded(!this.#bc);
      this.#v.addToAnnotationStorage(t2);
      t2._reportTelemetry(t2.telemetryInitialData);
    }
  }
  moveEditorInDOM(t2) {
    if (!t2.isAttachedToDOM) return;
    const { activeElement: e2 } = document;
    if (t2.div.contains(e2) && !this.#pc) {
      t2._focusEventsAllowed = false;
      this.#pc = setTimeout(() => {
        this.#pc = null;
        if (t2.div.contains(document.activeElement)) t2._focusEventsAllowed = true;
        else {
          t2.div.addEventListener("focusin", () => {
            t2._focusEventsAllowed = true;
          }, { once: true, signal: this.#v._signal });
          e2.focus();
        }
      }, 0);
    }
    t2._structTreeParentId = this.#Ro?.moveElementInDOM(this.div, t2.div, t2.contentDiv, true);
  }
  addOrRebuild(t2) {
    if (t2.needsToBeRebuilt()) {
      t2.parent ||= this;
      t2.rebuild();
      t2.show();
    } else this.add(t2);
  }
  addUndoableEditor(t2) {
    this.addCommands({ cmd: () => t2._uiManager.rebuild(t2), undo: () => {
      t2.remove();
    }, mustExec: false });
  }
  getEditorByUID(t2) {
    for (const e2 of this.#gc.values()) if (e2.uid === t2) return e2;
    return null;
  }
  get #_c() {
    return AnnotationEditorLayer.#tt.get(this.#v.getMode());
  }
  combinedSignal(t2) {
    return this.#v.combinedSignal(t2);
  }
  #kc(t2) {
    const e2 = this.#_c;
    return e2 ? new e2.prototype.constructor(t2) : null;
  }
  canCreateNewEmptyEditor() {
    return this.#_c?.canCreateNewEmptyEditor();
  }
  async pasteEditor(t2, e2) {
    this.updateToolbar(t2);
    await this.#v.updateMode(t2.mode);
    const { offsetX: i2, offsetY: n2 } = this.#Dc(), s2 = this.#v.getId(), r2 = this.#kc({ parent: this, id: s2, x: i2, y: n2, uiManager: this.#v, isCentered: true, ...e2 });
    r2 && this.add(r2);
  }
  async deserialize(t2) {
    return await AnnotationEditorLayer.#tt.get(t2.annotationType ?? t2.annotationEditorType)?.deserialize(t2, this, this.#v) || null;
  }
  createAndAddNewEditor(t2, e2, i2 = {}) {
    const n2 = this.#v.getId(), s2 = this.#kc({ parent: this, id: n2, x: t2.offsetX, y: t2.offsetY, uiManager: this.#v, isCentered: e2, ...i2 });
    s2 && this.add(s2);
    return s2;
  }
  get boundingClientRect() {
    return this.div.getBoundingClientRect();
  }
  #Dc() {
    const { x: t2, y: e2, width: i2, height: n2 } = this.boundingClientRect, s2 = Math.max(0, t2), r2 = Math.max(0, e2), a2 = (s2 + Math.min(window.innerWidth, t2 + i2)) / 2 - t2, o2 = (r2 + Math.min(window.innerHeight, e2 + n2)) / 2 - e2, [l2, h2] = this.viewport.rotation % 180 == 0 ? [a2, o2] : [o2, a2];
    return { offsetX: l2, offsetY: h2 };
  }
  addNewEditor(t2 = {}) {
    this.createAndAddNewEditor(this.#Dc(), true, t2);
  }
  setSelected(t2) {
    this.#v.setSelected(t2);
  }
  toggleSelected(t2) {
    this.#v.toggleSelected(t2);
  }
  unselect(t2) {
    this.#v.unselect(t2);
  }
  pointerup(t2) {
    const { isMac: e2 } = FeatureTest.platform;
    if (0 !== t2.button || t2.ctrlKey && e2) return;
    if (t2.target !== this.div) return;
    if (!this.#mc) return;
    this.#mc = false;
    if (this.#_c?.isDrawer && this.#_c.supportMultipleDrawings) return;
    if (!this.#cc) {
      this.#cc = true;
      return;
    }
    const i2 = this.#v.getMode();
    i2 !== f.STAMP && i2 !== f.POPUP && i2 !== f.SIGNATURE ? this.createAndAddNewEditor(t2, false) : this.#v.unselectAll();
  }
  pointerdown(t2) {
    this.#v.getMode() === f.HIGHLIGHT && this.enableTextSelection();
    if (this.#mc) {
      this.#mc = false;
      return;
    }
    const { isMac: e2 } = FeatureTest.platform;
    if (0 !== t2.button || t2.ctrlKey && e2) return;
    if (t2.target !== this.div) return;
    this.#mc = true;
    if (this.#_c?.isDrawer) {
      this.startDrawingSession(t2);
      return;
    }
    const i2 = this.#v.getActive();
    this.#cc = !i2 || i2.isEmpty();
  }
  startDrawingSession(t2) {
    this.div.focus({ preventScroll: true });
    if (this.#yc) {
      this.#_c.startDrawing(this, this.#v, false, t2);
      return;
    }
    this.#v.setCurrentDrawingSession(this);
    this.#yc = new AbortController();
    const e2 = this.#v.combinedSignal(this.#yc);
    this.div.addEventListener("blur", ({ relatedTarget: t3 }) => {
      if (t3 && !this.div.contains(t3)) {
        this.#vc = null;
        this.commitOrRemove();
      }
    }, { signal: e2 });
    this.#_c.startDrawing(this, this.#v, false, t2);
  }
  pause(t2) {
    if (t2) {
      const { activeElement: t3 } = document;
      this.div.contains(t3) && (this.#vc = t3);
      return;
    }
    this.#vc && setTimeout(() => {
      this.#vc?.focus();
      this.#vc = null;
    }, 0);
  }
  endDrawingSession(t2 = false) {
    if (!this.#yc) return null;
    this.#v.setCurrentDrawingSession(null);
    this.#yc.abort();
    this.#yc = null;
    this.#vc = null;
    return this.#_c.endDrawing(t2);
  }
  findNewParent(t2, e2, i2) {
    const n2 = this.#v.findParent(e2, i2);
    if (null === n2 || n2 === this) return false;
    n2.changeParent(t2);
    return true;
  }
  commitOrRemove() {
    if (this.#yc) {
      this.endDrawingSession();
      return true;
    }
    return false;
  }
  onScaleChanging() {
    this.#yc && this.#_c.onScaleChangingWhenDrawing(this);
  }
  destroy() {
    this.commitOrRemove();
    if (this.#v.getActive()?.parent === this) {
      this.#v.commitOrRemove();
      this.#v.setActiveEditor(null);
    }
    if (this.#pc) {
      clearTimeout(this.#pc);
      this.#pc = null;
    }
    for (const t2 of this.#gc.values()) {
      this.#Ro?.removePointerInTextLayer(t2.contentDiv);
      t2.setParent(null);
      t2.isAttachedToDOM = false;
      t2.div.remove();
    }
    this.div = null;
    this.#gc.clear();
    this.#v.removeLayer(this);
  }
  #Ec() {
    for (const t2 of this.#gc.values()) t2.isEmpty() && t2.remove();
  }
  async render({ viewport: t2 }) {
    this.viewport = t2;
    setLayerDimensions(this.div, t2);
    for (const t3 of this.#v.getEditors(this.pageIndex)) {
      this.add(t3);
      t3.rebuild();
    }
    await this.#v.findClonesForPage(this);
    this.div.hidden = this.isEmpty;
    this.updateMode();
  }
  update({ viewport: t2 }) {
    this.#v.commitOrRemove();
    this.#Ec();
    const e2 = this.viewport.rotation, i2 = t2.rotation;
    this.viewport = t2;
    setLayerDimensions(this.div, { rotation: i2 });
    if (e2 !== i2) for (const t3 of this.#gc.values()) t3.rotate(i2);
  }
  get pageDimensions() {
    const { pageWidth: t2, pageHeight: e2 } = this.viewport.rawDims;
    return [t2, e2];
  }
  get scale() {
    return this.#v.viewParameters.realScale;
  }
}
function compareTextLayers(t2, e2) {
  return t2 === e2 ? 0 : t2.compareDocumentPosition(e2) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
function getTextLayer(t2) {
  return t2 ? t2.nodeType === Node.ELEMENT_NODE ? t2.closest(".textLayer") : t2.parentElement?.closest(".textLayer") || null : null;
}
function isPointBefore(t2, e2, i2, n2) {
  if (t2 === i2) return e2 <= n2;
  const s2 = t2.compareDocumentPosition(i2);
  return !!(s2 & Node.DOCUMENT_POSITION_FOLLOWING) || !(s2 & Node.DOCUMENT_POSITION_PRECEDING) && null;
}
function normalizeEdgeBoundary(t2, e2, i2) {
  if (t2.nodeType !== Node.ELEMENT_NODE || !t2.classList.contains("textLayer") || e2 !== t2.childNodes.length) return { container: t2, offset: e2 };
  let n2 = t2.lastChild;
  n2?.nodeType === Node.ELEMENT_NODE && n2.classList.contains("endOfContent") && (n2 = n2.previousSibling);
  return n2 && i2.contains(n2) ? n2.nodeType === Node.TEXT_NODE ? { container: n2, offset: n2.textContent.length } : { container: n2, offset: n2.childNodes.length } : null;
}
class DrawLayer {
  #io = null;
  #Pc = /* @__PURE__ */ new Map();
  #wc = null;
  #rt = null;
  #Et = null;
  #Mc = null;
  #Ic = /* @__PURE__ */ new Map();
  static #_ = 0;
  static #Fc = 0;
  static #Bc = null;
  static #Oc = /* @__PURE__ */ new Set();
  static #Rc = false;
  static #Lc = /* @__PURE__ */ new Set();
  static #Nc = /* @__PURE__ */ new WeakMap();
  constructor({ filterFactory: t2 = null, pageColors: e2 = null, pageIndex: i2, textLayer: n2 = null }) {
    this.pageIndex = i2;
    this.#rt = t2;
    this.#Et = e2;
    if (n2) {
      const t3 = DrawLayer.#Nc.get(n2);
      if (t3?.selectionDiv) {
        t3.selectionDiv.remove();
        DrawLayer.#Oc.delete(t3.selectionDiv);
      }
      DrawLayer.#Nc.set(n2, { drawLayer: this });
      DrawLayer.#Lc.add(n2);
      this.#wc = n2;
      this.#Mc = new MutationObserver((t4) => {
        if (this.#io && this.#wc?.isConnected && DrawLayer.#Uc()) {
          for (const { addedNodes: e3 } of t4) for (const t5 of e3) if (t5.nodeType === Node.ELEMENT_NODE && t5.classList.contains("endOfContent")) {
            DrawLayer.#Ht();
            return;
          }
        }
      });
      this.#Mc.observe(n2, { childList: true });
      if (null === DrawLayer.#Bc) {
        DrawLayer.#Bc = new AbortController();
        const { signal: t4 } = DrawLayer.#Bc;
        document.addEventListener("selectionchange", DrawLayer.#Ht.bind(DrawLayer), { signal: t4 });
        document.addEventListener("pointerdown", () => {
          DrawLayer.#Rc = true;
        }, { signal: t4 });
        document.addEventListener("pointerup", () => {
          DrawLayer.#Rc = false;
        }, { signal: t4 });
        window.addEventListener("blur", () => {
          DrawLayer.#Rc = false;
        }, { signal: t4 });
      }
    }
  }
  setParent(t2) {
    if (this.#io) {
      if (this.#io !== t2) {
        if (this.#Pc.size > 0) for (const e2 of this.#Pc.values()) {
          e2.remove();
          t2.append(e2);
        }
        this.#io = t2;
      }
    } else {
      this.#io = t2;
      this.#wc?.isConnected && DrawLayer.#Uc() && DrawLayer.#Ht();
    }
  }
  static #Hc(t2) {
    const e2 = this.#Nc.get(t2);
    if (e2?.selectionDiv) {
      e2.selectionDiv.remove();
      this.#Oc.delete(e2.selectionDiv);
      e2.selectionDiv = null;
      e2.path = null;
    }
  }
  static #Uc() {
    const t2 = document.getSelection();
    return !!t2 && !t2.isCollapsed;
  }
  static #zc() {
    return this.#Lc.keys().filter((t2) => t2.isConnected).toArray().sort(compareTextLayers);
  }
  static #Ht() {
    const t2 = document.getSelection();
    if (!t2 || t2.isCollapsed) {
      for (const t3 of this.#Oc) t3.remove();
      this.#Oc.clear();
      return;
    }
    const e2 = /* @__PURE__ */ new WeakMap(), i2 = this.#zc(), n2 = [];
    for (let e3 = 0, s3 = t2.rangeCount; e3 < s3; e3++) {
      const s4 = t2.getRangeAt(e3);
      if (s4.collapsed) continue;
      let { startContainer: r2, startOffset: a2, endContainer: o2, endOffset: l2 } = s4, h2 = getTextLayer(r2), c2 = getTextLayer(o2);
      const d2 = null === h2, u2 = null === c2;
      if (this.#Rc && d2 !== u2) return;
      if (1 === t2.rangeCount) {
        const { anchorNode: e4, anchorOffset: i3, focusNode: n3, focusOffset: s5 } = t2, d3 = getTextLayer(e4), u3 = getTextLayer(n3), p3 = isPointBefore(e4, i3, n3, s5);
        if (d3 && u3 && null !== p3) if (p3) {
          r2 = e4;
          a2 = i3;
          h2 = d3;
          o2 = n3;
          l2 = s5;
          c2 = u3;
        } else {
          r2 = n3;
          a2 = s5;
          h2 = u3;
          o2 = e4;
          l2 = i3;
          c2 = d3;
        }
      }
      const p2 = i2.filter((t3) => s4.intersectsNode(t3));
      if (0 === p2.length) continue;
      let g2 = false;
      if (!h2) {
        h2 = p2[0];
        r2 = h2;
        a2 = 0;
        g2 = true;
      }
      if (!c2) {
        c2 = p2.at(-1);
        o2 = c2;
        l2 = c2.childNodes.length;
        g2 = true;
      }
      if (o2.nodeType === Node.ELEMENT_NODE) {
        if (o2.classList.contains("endOfContent")) {
          const t3 = o2.previousSibling;
          if (!t3) continue;
          o2 = t3;
          l2 = t3.nodeType === Node.TEXT_NODE ? t3.textContent.length : t3.childNodes.length;
        } else if (o2.classList.contains("textLayer") && o2.childNodes.length === l2) {
          const t3 = normalizeEdgeBoundary(o2, l2, c2);
          if (!t3) continue;
          o2 = t3.container;
          l2 = t3.offset;
        }
      }
      if (r2.nodeType === Node.ELEMENT_NODE) {
        const t3 = normalizeEdgeBoundary(r2, a2, h2);
        if (!t3) continue;
        r2 = t3.container;
        a2 = t3.offset;
      }
      if (h2 !== c2 || g2 || !p2.includes(h2)) for (const t3 of p2) {
        const e4 = t3.firstChild;
        if (!e4) continue;
        const i3 = document.createRange();
        t3 === h2 ? i3.setStart(r2, a2) : i3.setStartBefore(e4);
        if (t3 === c2) i3.setEnd(o2, l2);
        else {
          const e5 = t3.lastChild;
          if (!e5) continue;
          if (e5.nodeType === Node.ELEMENT_NODE && e5.classList.contains("endOfContent")) {
            const t4 = e5.previousSibling;
            if (!t4) continue;
            i3.setEndAfter(t4);
          } else i3.setEndAfter(e5);
        }
        i3.collapsed || n2.push([i3, t3]);
      }
      else n2.push([s4, h2]);
    }
    const s2 = new Set(n2.map((t3) => t3[1]));
    for (const t3 of this.#Lc) s2.has(t3) || this.#Hc(t3);
    for (const [t3, i3] of n2) {
      const n3 = DrawLayer.#Nc.get(i3);
      if (!n3) continue;
      let s3 = e2.get(i3);
      if (!s3) {
        const t4 = i3.getBoundingClientRect();
        s3 = (e3, i4, n4, s4) => ({ x: (e3 - t4.x) / t4.width, y: (i4 - t4.y) / t4.height, width: n4 / t4.width, height: s4 / t4.height });
        e2.set(i3, s3);
      }
      const r2 = [];
      for (let { x: e3, y: i4, width: n4, height: a3 } of t3.getClientRects()) if (0 !== n4 && 0 !== a3) {
        ({ x: e3, y: i4, width: n4, height: a3 } = s3(e3, i4, n4, a3));
        1 === n4 && 1 === a3 || r2.push(`M${e3} ${i4} h${n4} v${a3} h-${n4} Z`);
      }
      if (0 === r2.length) continue;
      const a2 = n3.drawLayer;
      let o2 = n3.selectionDiv, l2 = n3.path;
      if (!o2) {
        const t4 = "clip_selection_" + DrawLayer.#Fc++;
        o2 = document.createElement("div");
        o2.className = "selection";
        o2.style.clipPath = `url(#${t4})`;
        const e3 = a2.#rt?.createSelectionStyle(a2.#Et);
        if (e3) for (const [t5, i5] of Object.entries(e3)) o2.style.setProperty(t5, i5);
        const i4 = DrawLayer._svgFactory.create(1, 1, true);
        i4.setAttribute("aria-hidden", "true");
        i4.setAttribute("width", "100%");
        i4.setAttribute("height", "100%");
        const s4 = DrawLayer._svgFactory.createElement("clipPath");
        s4.setAttribute("id", t4);
        s4.setAttribute("clipPathUnits", "objectBoundingBox");
        l2 = DrawLayer._svgFactory.createElement("path");
        s4.append(l2);
        i4.append(s4);
        o2.append(i4);
        n3.path = l2;
        n3.selectionDiv = o2;
      }
      if (a2.#io && o2.parentNode !== a2.#io) {
        a2.#io.append(o2);
        this.#Oc.add(o2);
      }
      l2.setAttribute("d", r2.join(" "));
    }
  }
  static get _svgFactory() {
    return shadow(this, "_svgFactory", new DOMSVGFactory());
  }
  static #Gc(t2, [e2, i2, n2, s2]) {
    const { style: r2 } = t2;
    r2.top = 100 * i2 + "%";
    r2.left = 100 * e2 + "%";
    r2.width = 100 * n2 + "%";
    r2.height = 100 * s2 + "%";
  }
  #Vc() {
    const t2 = DrawLayer._svgFactory.create(1, 1, true);
    this.#io.append(t2);
    t2.setAttribute("aria-hidden", "true");
    return t2;
  }
  #Wc(t2, e2) {
    const i2 = DrawLayer._svgFactory.createElement("clipPath");
    t2.append(i2);
    const n2 = `clip_${e2}`;
    i2.setAttribute("id", n2);
    i2.setAttribute("clipPathUnits", "objectBoundingBox");
    const s2 = DrawLayer._svgFactory.createElement("use");
    i2.append(s2);
    s2.setAttribute("href", `#${e2}`);
    s2.classList.add("clip");
    return n2;
  }
  #$c(t2, e2) {
    for (const [i2, n2] of Object.entries(e2)) null === n2 ? t2.removeAttribute(i2) : t2.setAttribute(i2, n2);
  }
  draw(t2, e2 = false, i2 = false) {
    const n2 = DrawLayer.#_++, s2 = this.#Vc(), r2 = DrawLayer._svgFactory.createElement("defs");
    s2.append(r2);
    const a2 = DrawLayer._svgFactory.createElement("path");
    r2.append(a2);
    const o2 = `path_${n2}`;
    a2.setAttribute("id", o2);
    a2.setAttribute("vector-effect", "non-scaling-stroke");
    e2 && this.#Ic.set(n2, a2);
    const l2 = i2 ? this.#Wc(r2, o2) : null, h2 = DrawLayer._svgFactory.createElement("use");
    s2.append(h2);
    h2.setAttribute("href", `#${o2}`);
    this.updateProperties(s2, t2);
    this.#Pc.set(n2, s2);
    return { id: n2, clipPathId: `url(#${l2})` };
  }
  drawOutline(t2, e2) {
    const i2 = DrawLayer.#_++, n2 = this.#Vc(), s2 = DrawLayer._svgFactory.createElement("defs");
    n2.append(s2);
    const r2 = DrawLayer._svgFactory.createElement("path");
    s2.append(r2);
    const a2 = `path_${i2}`;
    r2.setAttribute("id", a2);
    r2.setAttribute("vector-effect", "non-scaling-stroke");
    let o2;
    if (e2) {
      const t3 = DrawLayer._svgFactory.createElement("mask");
      s2.append(t3);
      o2 = `mask_${i2}`;
      t3.setAttribute("id", o2);
      t3.setAttribute("maskUnits", "objectBoundingBox");
      const e3 = DrawLayer._svgFactory.createElement("rect");
      t3.append(e3);
      e3.setAttribute("width", "1");
      e3.setAttribute("height", "1");
      e3.setAttribute("fill", "white");
      const n3 = DrawLayer._svgFactory.createElement("use");
      t3.append(n3);
      n3.setAttribute("href", `#${a2}`);
      n3.setAttribute("stroke", "none");
      n3.setAttribute("fill", "black");
      n3.setAttribute("fill-rule", "nonzero");
      n3.classList.add("mask");
    }
    const l2 = DrawLayer._svgFactory.createElement("use");
    n2.append(l2);
    l2.setAttribute("href", `#${a2}`);
    o2 && l2.setAttribute("mask", `url(#${o2})`);
    const h2 = l2.cloneNode();
    n2.append(h2);
    l2.classList.add("mainOutline");
    h2.classList.add("secondaryOutline");
    this.updateProperties(n2, t2);
    this.#Pc.set(i2, n2);
    return i2;
  }
  finalizeDraw(t2, e2) {
    this.#Ic.delete(t2);
    this.updateProperties(t2, e2);
  }
  updateProperties(t2, e2) {
    if (!e2) return;
    const { root: i2, bbox: n2, rootClass: s2, path: r2 } = e2, a2 = "number" == typeof t2 ? this.#Pc.get(t2) : t2;
    if (a2) {
      i2 && this.#$c(a2, i2);
      n2 && DrawLayer.#Gc(a2, n2);
      if (s2) {
        const { classList: t3 } = a2;
        for (const [e3, i3] of Object.entries(s2)) t3.toggle(e3, i3);
      }
      if (r2) {
        const t3 = a2.firstElementChild.firstElementChild;
        this.#$c(t3, r2);
      }
    }
  }
  updateParent(t2, e2) {
    if (e2 === this) return;
    const i2 = this.#Pc.get(t2);
    if (i2) {
      e2.#io.append(i2);
      this.#Pc.delete(t2);
      e2.#Pc.set(t2, i2);
    }
  }
  remove(t2) {
    this.#Ic.delete(t2);
    if (null !== this.#io) {
      this.#Pc.get(t2).remove();
      this.#Pc.delete(t2);
    }
  }
  destroy() {
    this.#io = null;
    for (const t2 of this.#Pc.values()) t2.remove();
    this.#Pc.clear();
    this.#Ic.clear();
    this.#Mc?.disconnect();
    this.#Mc = null;
    if (this.#wc) {
      const t2 = DrawLayer.#Nc.get(this.#wc);
      if (t2?.drawLayer === this) {
        DrawLayer.#Hc(this.#wc);
        DrawLayer.#Nc.delete(this.#wc);
        DrawLayer.#Lc.delete(this.#wc);
        if (0 === DrawLayer.#Lc.size) {
          DrawLayer.#Bc?.abort();
          DrawLayer.#Bc = null;
          DrawLayer.#Rc = false;
        }
      }
      this.#wc = null;
    }
  }
}
function percentage(t2) {
  return `${(100 * t2).toFixed(2)}%`;
}
class TextLayerImages {
  #jc = [];
  #Xc = /* @__PURE__ */ new Map();
  #Kc = null;
  #Yc = 0;
  #Er = 0;
  #Cr = 0;
  static #qc = null;
  constructor(t2, e2, i2, n2) {
    this.#Yc = t2;
    this.#jc = e2;
    this.#Er = i2.rawDims.pageWidth;
    this.#Cr = i2.rawDims.pageHeight;
    this.#Kc = n2;
  }
  render() {
    const t2 = document.createElement("div");
    t2.className = "textLayerImages";
    for (let e2 = 0; e2 < this.#jc.length; e2 += 6) {
      const i2 = this.#Qc(this.#jc.subarray(e2, e2 + 6));
      i2 && t2.append(i2);
    }
    t2.addEventListener("contextmenu", (t3) => {
      if (!(t3.target instanceof HTMLCanvasElement)) return;
      const e2 = t3.target, i2 = this.#Xc.get(e2);
      if (!i2) return;
      const n2 = TextLayerImages.#qc?.deref();
      if (n2 === e2) return;
      if (n2) {
        n2.width = 0;
        n2.height = 0;
      }
      TextLayerImages.#qc = new WeakRef(e2);
      const { inverseTransform: s2, x1: r2, y1: a2, width: o2, height: l2 } = i2, h2 = this.#Kc(), c2 = Math.ceil(r2 * h2.width), d2 = Math.ceil(a2 * h2.height), u2 = Math.floor((r2 + o2 / this.#Er) * h2.width), p2 = Math.floor((a2 + l2 / this.#Cr) * h2.height);
      e2.width = u2 - c2;
      e2.height = p2 - d2;
      const g2 = e2.getContext("2d");
      g2.setTransform(...s2);
      g2.translate(-c2, -d2);
      g2.drawImage(h2, 0, 0);
    });
    return t2;
  }
  #Qc([t2, e2, i2, n2, s2, r2]) {
    const a2 = Math.hypot((s2 - t2) * this.#Er, (r2 - e2) * this.#Cr), o2 = Math.hypot((i2 - t2) * this.#Er, (n2 - e2) * this.#Cr);
    if (a2 < this.#Yc || o2 < this.#Yc) return null;
    const l2 = [(s2 - t2) * this.#Er / a2, (r2 - e2) * this.#Cr / a2, (i2 - t2) * this.#Er / o2, (n2 - e2) * this.#Cr / o2, 0, 0], h2 = Util.inverseTransform(l2), c2 = document.createElement("canvas");
    c2.className = "textLayerImagePlaceholder";
    c2.width = 0;
    c2.height = 0;
    Object.assign(c2.style, { opacity: 0, position: "absolute", left: percentage(t2), top: percentage(e2), width: percentage(a2 / this.#Er), height: percentage(o2 / this.#Cr), transformOrigin: "0% 0%", transform: `matrix(${l2.join(",")})` });
    this.#Xc.set(c2, { inverseTransform: h2, width: a2, height: o2, x1: t2, y1: e2 });
    return c2;
  }
}
globalThis._pdfjsTestingUtils = { HighlightOutliner };
globalThis.pdfjsLib = { AbortException, AnnotationEditorLayer, AnnotationEditorParamsType: b, AnnotationEditorType: f, AnnotationEditorUIManager, AnnotationLayer, AnnotationMode: p, AnnotationType: T, applyOpacity, build: Nt, ColorPicker, createValidAbsoluteUrl, CSSConstants, DOMSVGFactory, DrawLayer, FeatureTest, fetchData, findContrastColor, getDocument, getFilenameFromUrl, getPdfFilenameFromUrl, getRGB, getRGBA, getUuid, GlobalWorkerOptions, ImageKind: S, InvalidPDFException, isDataScheme, isPdfFile, isValidExplicitDest: ut, makeArr, makeMap, makeObj, makeSet, MathClamp, noContextMenu, normalizeUnicode, OPS: F, OutputScale, PasswordException, PasswordResponses: U, PDFDataRangeTransport, PDFDateString, PDFWorker, PermissionFlag: y, PixelsPerInch, RenderingCancelledException, renderRichText, ResponseException, setLayerDimensions, shadow, SignatureExtractor, stopEvent, SupportedImageMimeTypes: j, TextLayer, TextLayerImages, TouchManager, updateUrlHash, Util, VerbosityLevel: I, version: Lt, XfaLayer };
export { AbortException, AnnotationEditorLayer, b as AnnotationEditorParamsType, f as AnnotationEditorType, AnnotationEditorUIManager, AnnotationLayer, p as AnnotationMode, T as AnnotationType, CSSConstants, ColorPicker, DOMSVGFactory, DrawLayer, FeatureTest, GlobalWorkerOptions, S as ImageKind, InvalidPDFException, MathClamp, F as OPS, OutputScale, PDFDataRangeTransport, PDFDateString, PDFWorker, PasswordException, U as PasswordResponses, y as PermissionFlag, PixelsPerInch, RenderingCancelledException, ResponseException, SignatureExtractor, j as SupportedImageMimeTypes, TextLayer, TextLayerImages, TouchManager, Util, I as VerbosityLevel, XfaLayer, applyOpacity, Nt as build, createValidAbsoluteUrl, fetchData, findContrastColor, getDocument, getFilenameFromUrl, getPdfFilenameFromUrl, getRGB, getRGBA, getUuid, isDataScheme, isPdfFile, ut as isValidExplicitDest, makeArr, makeMap, makeObj, makeSet, noContextMenu, normalizeUnicode, renderRichText, setLayerDimensions, shadow, stopEvent, updateUrlHash, Lt as version };
