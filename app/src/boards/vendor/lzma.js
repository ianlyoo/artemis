const host = {};
(function() {
  var e = (function() {
    "use strict";
    function r(e2, r2) {
      postMessage({ action: nr, cbn: r2, result: e2 });
    }
    function o(e2) {
      var r2 = [];
      return r2[e2 - 1] = void 0, r2;
    }
    function n(e2, r2) {
      return i(e2[0] + r2[0], e2[1] + r2[1]);
    }
    function t(e2, r2) {
      var o2, n2;
      return e2[0] == r2[0] && e2[1] == r2[1] ? 0 : (o2 = 0 > e2[1], n2 = 0 > r2[1], o2 && !n2 ? -1 : !o2 && n2 ? 1 : d(e2, r2)[1] < 0 ? -1 : 1);
    }
    function i(e2, r2) {
      var o2, n2;
      for (r2 %= 18446744073709552e3, e2 %= 18446744073709552e3, o2 = r2 % ir, n2 = Math.floor(e2 / ir) * ir, r2 = r2 - o2 + n2, e2 = e2 - n2 + o2; 0 > e2; ) e2 += ir, r2 -= ir;
      for (; e2 > 4294967295; ) e2 -= ir, r2 += ir;
      for (r2 %= 18446744073709552e3; r2 > 9223372032559809e3; ) r2 -= 18446744073709552e3;
      for (; -9223372036854776e3 > r2; ) r2 += 18446744073709552e3;
      return [e2, r2];
    }
    function u(e2) {
      return e2 >= 0 ? [e2, 0] : [e2 + ir, -ir];
    }
    function s(e2) {
      return e2[0] >= 2147483648 ? ~~Math.max(Math.min(e2[0] - ir, 2147483647), -2147483648) : ~~Math.max(Math.min(e2[0], 2147483647), -2147483648);
    }
    function d(e2, r2) {
      return i(e2[0] - r2[0], e2[1] - r2[1]);
    }
    function c(e2, r2) {
      return e2.ab = r2, e2.cb = 0, e2.O = r2.length, e2;
    }
    function m(e2) {
      return e2.cb >= e2.O ? -1 : 255 & e2.ab[e2.cb++];
    }
    function a(e2) {
      return e2.ab = o(32), e2.O = 0, e2;
    }
    function _(e2) {
      var r2 = e2.ab;
      return r2.length = e2.O, r2;
    }
    function f(e2, r2, o2, n2) {
      p(r2, o2, e2.ab, e2.O, n2), e2.O += n2;
    }
    function p(e2, r2, o2, n2, t2) {
      for (var i2 = 0; t2 > i2; ++i2) o2[n2 + i2] = e2[r2 + i2];
    }
    function D(e2, r2, o2) {
      var n2, t2, i2, s2, d2 = "", c2 = [];
      for (t2 = 0; 5 > t2; ++t2) {
        if (i2 = m(r2), -1 == i2) throw Error("truncated input");
        c2[t2] = i2 << 24 >> 24;
      }
      if (n2 = N({}), !z(n2, c2)) throw Error("corrupted input");
      for (t2 = 0; 64 > t2; t2 += 8) {
        if (i2 = m(r2), -1 == i2) throw Error("truncated input");
        i2 = i2.toString(16), 1 == i2.length && (i2 = "0" + i2), d2 = i2 + "" + d2;
      }
      /^0+$|^f+$/i.test(d2) ? e2.N = ur : (s2 = parseInt(d2, 16), e2.N = s2 > 4294967295 ? ur : u(s2)), e2.Q = B(n2, r2, o2, e2.N);
    }
    function l(e2, r2) {
      return e2.S = a({}), D(e2, c({}, r2), e2.S), e2;
    }
    function g(e2, r2, o2) {
      var n2 = e2.D - r2 - 1;
      for (0 > n2 && (n2 += e2.c); 0 != o2; --o2) n2 >= e2.c && (n2 = 0), e2.x[e2.D++] = e2.x[n2++], e2.D >= e2.c && w(e2);
    }
    function v(e2, r2) {
      (null == e2.x || e2.c != r2) && (e2.x = o(r2)), e2.c = r2, e2.D = 0, e2.w = 0;
    }
    function w(e2) {
      var r2 = e2.D - e2.w;
      r2 && (f(e2.V, e2.x, e2.w, r2), e2.D >= e2.c && (e2.D = 0), e2.w = e2.D);
    }
    function R(e2, r2) {
      var o2 = e2.D - r2 - 1;
      return 0 > o2 && (o2 += e2.c), e2.x[o2];
    }
    function h(e2, r2) {
      e2.x[e2.D++] = r2, e2.D >= e2.c && w(e2);
    }
    function P(e2) {
      w(e2), e2.V = null;
    }
    function C(e2) {
      return e2 -= 2, 4 > e2 ? e2 : 3;
    }
    function S(e2) {
      return 4 > e2 ? 0 : 10 > e2 ? e2 - 3 : e2 - 6;
    }
    function M(e2, r2) {
      return e2.h = r2, e2.bb = null, e2.X = 1, e2;
    }
    function L(e2) {
      if (!e2.X) throw Error("bad state");
      if (e2.bb) throw Error("No encoding");
      return y(e2), e2.X;
    }
    function y(e2) {
      var r2 = I(e2.h);
      if (-1 == r2) throw Error("corrupted input");
      e2.$ = ur, e2.Z = e2.h.d, (r2 || t(e2.h.U, sr) >= 0 && t(e2.h.d, e2.h.U) >= 0) && (w(e2.h.b), P(e2.h.b), e2.h.a.K = null, e2.X = 0);
    }
    function B(e2, r2, o2, n2) {
      return e2.a.K = r2, P(e2.b), e2.b.V = o2, b(e2), e2.f = 0, e2.l = 0, e2.T = 0, e2.R = 0, e2._ = 0, e2.U = n2, e2.d = sr, e2.I = 0, M({}, e2);
    }
    function I(e2) {
      var r2, o2, i2, d2, c2, m2;
      if (m2 = s(e2.d) & e2.P, Q(e2.a, e2.q, (e2.f << 4) + m2)) {
        if (Q(e2.a, e2.E, e2.f)) i2 = 0, Q(e2.a, e2.s, e2.f) ? (Q(e2.a, e2.u, e2.f) ? (Q(e2.a, e2.r, e2.f) ? (o2 = e2._, e2._ = e2.R) : o2 = e2.R, e2.R = e2.T) : o2 = e2.T, e2.T = e2.l, e2.l = o2) : Q(e2.a, e2.n, (e2.f << 4) + m2) || (e2.f = 7 > e2.f ? 9 : 11, i2 = 1), i2 || (i2 = x(e2.o, e2.a, m2) + 2, e2.f = 7 > e2.f ? 8 : 11);
        else if (e2._ = e2.R, e2.R = e2.T, e2.T = e2.l, i2 = 2 + x(e2.C, e2.a, m2), e2.f = 7 > e2.f ? 7 : 10, c2 = q(e2.j[C(i2)], e2.a), c2 >= 4) {
          if (d2 = (c2 >> 1) - 1, e2.l = (2 | 1 & c2) << d2, 14 > c2) e2.l += J(e2.J, e2.l - c2 - 1, e2.a, d2);
          else if (e2.l += U(e2.a, d2 - 4) << 4, e2.l += F(e2.t, e2.a), 0 > e2.l) return -1 == e2.l ? 1 : -1;
        } else e2.l = c2;
        if (t(u(e2.l), e2.d) >= 0 || e2.l >= e2.m) return -1;
        g(e2.b, e2.l, i2), e2.d = n(e2.d, u(i2)), e2.I = R(e2.b, 0);
      } else r2 = Z(e2.k, s(e2.d), e2.I), e2.I = 7 > e2.f ? T(r2, e2.a) : $(r2, e2.a, R(e2.b, e2.l)), h(e2.b, e2.I), e2.f = S(e2.f), e2.d = n(e2.d, dr);
      return 0;
    }
    function N(e2) {
      e2.b = {}, e2.a = {}, e2.q = o(192), e2.E = o(12), e2.s = o(12), e2.u = o(12), e2.r = o(12), e2.n = o(192), e2.j = o(4), e2.J = o(114), e2.t = K({}, 4), e2.C = G({}), e2.o = G({}), e2.k = {};
      for (var r2 = 0; 4 > r2; ++r2) e2.j[r2] = K({}, 6);
      return e2;
    }
    function b(e2) {
      e2.b.w = 0, e2.b.D = 0, X(e2.q), X(e2.n), X(e2.E), X(e2.s), X(e2.u), X(e2.r), X(e2.J), H(e2.k);
      for (var r2 = 0; 4 > r2; ++r2) X(e2.j[r2].B);
      A(e2.C), A(e2.o), X(e2.t.B), V(e2.a);
    }
    function z(e2, r2) {
      var o2, n2, t2, i2, u2, s2, d2;
      if (5 > r2.length) return 0;
      for (d2 = 255 & r2[0], t2 = d2 % 9, s2 = ~~(d2 / 9), i2 = s2 % 5, u2 = ~~(s2 / 5), o2 = 0, n2 = 0; 4 > n2; ++n2) o2 += (255 & r2[1 + n2]) << 8 * n2;
      return o2 > 99999999 || !W(e2, t2, i2, u2) ? 0 : O(e2, o2);
    }
    function O(e2, r2) {
      return 0 > r2 ? 0 : (e2.z != r2 && (e2.z = r2, e2.m = Math.max(e2.z, 1), v(e2.b, Math.max(e2.m, 4096))), 1);
    }
    function W(e2, r2, o2, n2) {
      if (r2 > 8 || o2 > 4 || n2 > 4) return 0;
      E(e2.k, o2, r2);
      var t2 = 1 << n2;
      return k(e2.C, t2), k(e2.o, t2), e2.P = t2 - 1, 1;
    }
    function k(e2, r2) {
      for (; r2 > e2.e; ++e2.e) e2.G[e2.e] = K({}, 3), e2.H[e2.e] = K({}, 3);
    }
    function x(e2, r2, o2) {
      if (!Q(r2, e2.M, 0)) return q(e2.G[o2], r2);
      var n2 = 8;
      return n2 += Q(r2, e2.M, 1) ? 8 + q(e2.L, r2) : q(e2.H[o2], r2);
    }
    function G(e2) {
      return e2.M = o(2), e2.G = o(16), e2.H = o(16), e2.L = K({}, 8), e2.e = 0, e2;
    }
    function A(e2) {
      X(e2.M);
      for (var r2 = 0; e2.e > r2; ++r2) X(e2.G[r2].B), X(e2.H[r2].B);
      X(e2.L.B);
    }
    function E(e2, r2, n2) {
      var t2, i2;
      if (null == e2.F || e2.g != n2 || e2.y != r2) for (e2.y = r2, e2.Y = (1 << r2) - 1, e2.g = n2, i2 = 1 << e2.g + e2.y, e2.F = o(i2), t2 = 0; i2 > t2; ++t2) e2.F[t2] = j({});
    }
    function Z(e2, r2, o2) {
      return e2.F[((r2 & e2.Y) << e2.g) + ((255 & o2) >>> 8 - e2.g)];
    }
    function H(e2) {
      var r2, o2;
      for (o2 = 1 << e2.g + e2.y, r2 = 0; o2 > r2; ++r2) X(e2.F[r2].v);
    }
    function T(e2, r2) {
      var o2 = 1;
      do
        o2 = o2 << 1 | Q(r2, e2.v, o2);
      while (256 > o2);
      return o2 << 24 >> 24;
    }
    function $(e2, r2, o2) {
      var n2, t2, i2 = 1;
      do
        if (t2 = o2 >> 7 & 1, o2 <<= 1, n2 = Q(r2, e2.v, (1 + t2 << 8) + i2), i2 = i2 << 1 | n2, t2 != n2) {
          for (; 256 > i2; ) i2 = i2 << 1 | Q(r2, e2.v, i2);
          break;
        }
      while (256 > i2);
      return i2 << 24 >> 24;
    }
    function j(e2) {
      return e2.v = o(768), e2;
    }
    function K(e2, r2) {
      return e2.A = r2, e2.B = o(1 << r2), e2;
    }
    function q(e2, r2) {
      var o2, n2 = 1;
      for (o2 = e2.A; 0 != o2; --o2) n2 = (n2 << 1) + Q(r2, e2.B, n2);
      return n2 - (1 << e2.A);
    }
    function F(e2, r2) {
      var o2, n2, t2 = 1, i2 = 0;
      for (n2 = 0; e2.A > n2; ++n2) o2 = Q(r2, e2.B, t2), t2 <<= 1, t2 += o2, i2 |= o2 << n2;
      return i2;
    }
    function J(e2, r2, o2, n2) {
      var t2, i2, u2 = 1, s2 = 0;
      for (i2 = 0; n2 > i2; ++i2) t2 = Q(o2, e2, r2 + u2), u2 <<= 1, u2 += t2, s2 |= t2 << i2;
      return s2;
    }
    function Q(e2, r2, o2) {
      var n2, t2 = r2[o2];
      return n2 = (e2.i >>> 11) * t2, (-2147483648 ^ n2) > (-2147483648 ^ e2.p) ? (e2.i = n2, r2[o2] = t2 + (2048 - t2 >>> 5) << 16 >> 16, -16777216 & e2.i || (e2.p = e2.p << 8 | m(e2.K), e2.i <<= 8), 0) : (e2.i -= n2, e2.p -= n2, r2[o2] = t2 - (t2 >>> 5) << 16 >> 16, -16777216 & e2.i || (e2.p = e2.p << 8 | m(e2.K), e2.i <<= 8), 1);
    }
    function U(e2, r2) {
      var o2, n2, t2 = 0;
      for (o2 = r2; 0 != o2; --o2) e2.i >>>= 1, n2 = e2.p - e2.i >>> 31, e2.p -= e2.i & n2 - 1, t2 = t2 << 1 | 1 - n2, -16777216 & e2.i || (e2.p = e2.p << 8 | m(e2.K), e2.i <<= 8);
      return t2;
    }
    function V(e2) {
      e2.p = 0, e2.i = -1;
      for (var r2 = 0; 5 > r2; ++r2) e2.p = e2.p << 8 | m(e2.K);
    }
    function X(e2) {
      for (var r2 = e2.length - 1; r2 >= 0; --r2) e2[r2] = 1024;
    }
    function Y(e2) {
      for (var r2, o2, n2, t2 = 0, i2 = 0, u2 = e2.length, s2 = [], d2 = []; u2 > t2; ++t2, ++i2) {
        if (r2 = 255 & e2[t2], 128 & r2) if (192 == (224 & r2)) {
          if (t2 + 1 >= u2) return e2;
          if (o2 = 255 & e2[++t2], 128 != (192 & o2)) return e2;
          d2[i2] = (31 & r2) << 6 | 63 & o2;
        } else {
          if (224 != (240 & r2)) return e2;
          if (t2 + 2 >= u2) return e2;
          if (o2 = 255 & e2[++t2], 128 != (192 & o2)) return e2;
          if (n2 = 255 & e2[++t2], 128 != (192 & n2)) return e2;
          d2[i2] = (15 & r2) << 12 | (63 & o2) << 6 | 63 & n2;
        }
        else {
          if (!r2) return e2;
          d2[i2] = r2;
        }
        16383 == i2 && (s2.push(String.fromCharCode.apply(String, d2)), i2 = -1);
      }
      return i2 > 0 && (d2.length = i2, s2.push(String.fromCharCode.apply(String, d2))), s2.join("");
    }
    function er(e2) {
      return e2[1] + e2[0];
    }
    function rr(e2, o2, n2) {
      function t2() {
        try {
          for (var e3, r2 = 0, u3 = (/* @__PURE__ */ new Date()).getTime(); L(c2.d.Q); ) if (++r2 % 1e3 == 0 && (/* @__PURE__ */ new Date()).getTime() - u3 > 200) return s2 && (i2 = er(c2.d.Q.h.d) / d2, n2(i2)), tr(t2, 0), 0;
          n2(1), e3 = Y(_(c2.d.S)), tr(o2.bind(null, e3), 0);
        } catch (m3) {
          o2(null, m3);
        }
      }
      var i2, u2, s2, d2, c2 = {}, m2 = void 0 === o2 && void 0 === n2;
      if ("function" != typeof o2 && (u2 = o2, o2 = n2 = 0), n2 = n2 || function(e3) {
        return void 0 !== u2 ? r(s2 ? e3 : -1, u2) : void 0;
      }, o2 = o2 || function(e3, r2) {
        return void 0 !== u2 ? postMessage({ action: or, cbn: u2, result: e3, error: r2 }) : void 0;
      }, m2) {
        for (c2.d = l({}, e2); L(c2.d.Q); ) ;
        return Y(_(c2.d.S));
      }
      try {
        c2.d = l({}, e2), d2 = er(c2.d.N), s2 = d2 > -1, n2(0);
      } catch (a2) {
        return o2(null, a2);
      }
      tr(t2, 0);
    }
    var or = 2, nr = 3, tr = "function" == typeof setImmediate ? setImmediate : setTimeout, ir = 4294967296, ur = [4294967295, -ir], sr = [0, 0], dr = [1, 0];
    return "undefined" == typeof onmessage || "undefined" != typeof window && void 0 !== window.document || !(function() {
      onmessage = function(r2) {
        r2 && r2.W && r2.W.action == or && e.decompress(r2.W.W, r2.W.cbn);
      };
    })(), { decompress: rr };
  })();
  this.LZMA = this.LZMA_WORKER = e;
}).call(host);
export default host.LZMA;
