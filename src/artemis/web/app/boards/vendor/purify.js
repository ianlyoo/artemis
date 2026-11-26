const module = { exports: {} };
const exports = module.exports;
/*! @license DOMPurify 3.4.17 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.17/LICENSE */
(function(e, t) {
  typeof exports == `object` && typeof module < `u` ? module.exports = t() : typeof define == `function` && define.amd ? define([], t) : (e = typeof globalThis < `u` ? globalThis : e || self, e.DOMPurify = t());
})(void 0, function() {
  "use strict";
  function e(e2, t2) {
    this.v = e2, this.k = t2;
  }
  function t(e2, t2) {
    (t2 == null || t2 > e2.length) && (t2 = e2.length);
    for (var n2 = 0, r2 = Array(t2); n2 < t2; n2++) r2[n2] = e2[n2];
    return r2;
  }
  function n(e2) {
    if (Array.isArray(e2)) return e2;
  }
  function r(e2, t2) {
    var n2 = e2 == null ? null : typeof Symbol < `u` && e2[Symbol.iterator] || e2[`@@iterator`];
    if (n2 != null) {
      var r2, i2, a2, o2, s2 = [], c2 = true, l2 = false;
      try {
        if (a2 = (n2 = n2.call(e2)).next, t2 === 0) {
          if (Object(n2) !== n2) return;
          c2 = false;
        } else for (; !(c2 = (r2 = a2.call(n2)).done) && (s2.push(r2.value), s2.length !== t2); c2 = true) ;
      } catch (e3) {
        l2 = true, i2 = e3;
      } finally {
        try {
          if (!c2 && n2.return != null && (o2 = n2.return(), Object(o2) !== o2)) return;
        } finally {
          if (l2) throw i2;
        }
      }
      return s2;
    }
  }
  function i() {
    throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
  }
  /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
  function a(e2, t2) {
    return n(e2) || r(e2, t2) || o(e2, t2) || i();
  }
  function o(e2, n2) {
    if (e2) {
      if (typeof e2 == `string`) return t(e2, n2);
      var r2 = {}.toString.call(e2).slice(8, -1);
      return r2 === `Object` && e2.constructor && (r2 = e2.constructor.name), r2 === `Map` || r2 === `Set` ? Array.from(e2) : r2 === `Arguments` || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r2) ? t(e2, n2) : void 0;
    }
  }
  function s(t2) {
    var n2, r2;
    function i2(n3, r3) {
      try {
        var o2 = t2[n3](r3), s2 = o2.value, c2 = s2 instanceof e;
        Promise.resolve(c2 ? s2.v : s2).then(function(e2) {
          if (c2) {
            var r4 = n3 === `return` && s2.k ? n3 : `next`;
            if (!s2.k || e2.done) return i2(r4, e2);
            e2 = t2[r4](e2).value;
          }
          a2(!!o2.done, e2);
        }, function(e2) {
          i2(`throw`, e2);
        });
      } catch (e2) {
        a2(2, e2);
      }
    }
    function a2(e2, t3) {
      e2 === 2 ? n2.reject(t3) : n2.resolve({ value: t3, done: e2 }), (n2 = n2.next) ? i2(n2.key, n2.arg) : r2 = null;
    }
    this._invoke = function(e2, t3) {
      return new Promise(function(a3, o2) {
        var s2 = { key: e2, arg: t3, resolve: a3, reject: o2, next: null };
        r2 ? r2 = r2.next = s2 : (n2 = r2 = s2, i2(e2, t3));
      });
    }, typeof t2.return != `function` && (this.return = void 0);
  }
  s.prototype[typeof Symbol == `function` && Symbol.asyncIterator || `@@asyncIterator`] = function() {
    return this;
  }, s.prototype.next = function(e2) {
    return this._invoke(`next`, e2);
  }, s.prototype.throw = function(e2) {
    return this._invoke(`throw`, e2);
  }, s.prototype.return = function(e2) {
    return this._invoke(`return`, e2);
  };
  let c = Object.entries, l = Object.setPrototypeOf, u = Object.isFrozen, d = Object.getPrototypeOf, f = Object.getOwnPropertyDescriptor, p = Object.freeze, m = Object.seal, h = Object.create, ee = typeof Reflect < `u` && Reflect, g = ee.apply, te = ee.construct;
  p || (p = function(e2) {
    return e2;
  }), m || (m = function(e2) {
    return e2;
  }), g || (g = function(e2, t2) {
    var n2 = [...arguments].slice(2);
    return e2.apply(t2, n2);
  }), te || (te = function(e2) {
    return new e2(...[...arguments].slice(1));
  });
  let _ = E(Array.prototype.forEach);
  Array.prototype.indexOf;
  let ne = E(Array.prototype.lastIndexOf), re = E(Array.prototype.pop), ie = E(Array.prototype.push), ae = E(Array.prototype.slice), oe = E(Array.prototype.splice), v = Array.isArray, se = D(Set), ce = E(Set.prototype.add), le = E(Set.prototype.has), y = E(String.prototype.toLowerCase), ue = E(String.prototype.toString), de = E(String.prototype.match), fe = E(String.prototype.replace), pe = E(String.prototype.indexOf), me = E(String.prototype.trim), he = E(Number.prototype.toString), b = E(Boolean.prototype.toString), x = typeof BigInt > `u` ? null : E(BigInt.prototype.toString), ge = typeof Symbol > `u` ? null : E(Symbol.prototype.toString), S = E(Object.prototype.hasOwnProperty), C = E(Object.prototype.toString), w = E(RegExp.prototype.test), T = D(TypeError);
  function E(e2) {
    return function(t2) {
      t2 instanceof RegExp && (t2.lastIndex = 0);
      var n2 = [...arguments].slice(1);
      return g(e2, t2, n2);
    };
  }
  function D(e2) {
    return function() {
      return te(e2, [...arguments]);
    };
  }
  function O(e2, t2) {
    let n2 = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : y;
    if (l && l(e2, null), !v(t2)) return e2;
    let r2 = t2.length;
    for (; r2--; ) {
      let i2 = t2[r2];
      if (typeof i2 == `string`) {
        let e3 = n2(i2);
        e3 !== i2 && (u(t2) || (t2[r2] = e3), i2 = e3);
      }
      e2[i2] = true;
    }
    return e2;
  }
  function _e(e2) {
    for (let t2 = 0; t2 < e2.length; t2++) S(e2, t2) || (e2[t2] = null);
    return e2;
  }
  function k(e2) {
    let t2 = h(null);
    for (let r2 of c(e2)) {
      var n2 = a(r2, 2);
      let i2 = n2[0], o2 = n2[1];
      S(e2, i2) && (t2[i2] = v(o2) ? _e(o2) : o2 && typeof o2 == `object` && o2.constructor === Object ? k(o2) : o2);
    }
    return t2;
  }
  function ve(e2) {
    switch (typeof e2) {
      case `string`:
        return e2;
      case `number`:
        return he(e2);
      case `boolean`:
        return b(e2);
      case `bigint`:
        return x ? x(e2) : `0`;
      case `symbol`:
        return ge ? ge(e2) : `Symbol()`;
      case `undefined`:
        return C(e2);
      case `function`:
      case `object`: {
        if (e2 === null) return C(e2);
        let t2 = e2, n2 = A(t2, `toString`);
        if (typeof n2 == `function`) {
          let e3 = n2(t2);
          return typeof e3 == `string` ? e3 : C(e3);
        }
        return C(e2);
      }
      default:
        return C(e2);
    }
  }
  function A(e2, t2) {
    for (; e2 !== null; ) {
      let n3 = f(e2, t2);
      if (n3) {
        if (n3.get) return E(n3.get);
        if (typeof n3.value == `function`) return E(n3.value);
      }
      e2 = d(e2);
    }
    function n2() {
      return null;
    }
    return n2;
  }
  function ye(e2, t2) {
    for (; e2 !== null; ) {
      let n2 = f(e2, t2);
      if (n2) return n2.get ? E(n2.get) : null;
      e2 = d(e2);
    }
    return null;
  }
  function be(e2) {
    try {
      return w(e2, ``), true;
    } catch (e3) {
      return false;
    }
  }
  let xe = p(`a.abbr.acronym.address.area.article.aside.audio.b.bdi.bdo.big.blink.blockquote.body.br.button.canvas.caption.center.cite.code.col.colgroup.content.data.datalist.dd.decorator.del.details.dfn.dialog.dir.div.dl.dt.element.em.fieldset.figcaption.figure.font.footer.form.h1.h2.h3.h4.h5.h6.head.header.hgroup.hr.html.i.img.input.ins.kbd.label.legend.li.main.map.mark.marquee.menu.menuitem.meter.nav.nobr.ol.optgroup.option.output.p.picture.pre.progress.q.rp.rt.ruby.s.samp.search.section.select.shadow.slot.small.source.spacer.span.strike.strong.style.sub.summary.sup.table.tbody.td.template.textarea.tfoot.th.thead.time.tr.track.tt.u.ul.var.video.wbr`.split(`.`)), Se = p(`svg.a.altglyph.altglyphdef.altglyphitem.animatecolor.animatemotion.animatetransform.circle.clippath.defs.desc.ellipse.enterkeyhint.exportparts.filter.font.g.glyph.glyphref.hkern.image.inputmode.line.lineargradient.marker.mask.metadata.mpath.part.path.pattern.polygon.polyline.radialgradient.rect.stop.style.switch.symbol.text.textpath.title.tref.tspan.view.vkern`.split(`.`)), Ce = p([`feBlend`, `feColorMatrix`, `feComponentTransfer`, `feComposite`, `feConvolveMatrix`, `feDiffuseLighting`, `feDisplacementMap`, `feDistantLight`, `feDropShadow`, `feFlood`, `feFuncA`, `feFuncB`, `feFuncG`, `feFuncR`, `feGaussianBlur`, `feImage`, `feMerge`, `feMergeNode`, `feMorphology`, `feOffset`, `fePointLight`, `feSpecularLighting`, `feSpotLight`, `feTile`, `feTurbulence`]), we = p([`animate`, `color-profile`, `cursor`, `discard`, `font-face`, `font-face-format`, `font-face-name`, `font-face-src`, `font-face-uri`, `foreignobject`, `hatch`, `hatchpath`, `mesh`, `meshgradient`, `meshpatch`, `meshrow`, `missing-glyph`, `script`, `set`, `solidcolor`, `unknown`, `use`]), Te = p(`math.menclose.merror.mfenced.mfrac.mglyph.mi.mlabeledtr.mmultiscripts.mn.mo.mover.mpadded.mphantom.mroot.mrow.ms.mspace.msqrt.mstyle.msub.msup.msubsup.mtable.mtd.mtext.mtr.munder.munderover.mprescripts`.split(`.`)), Ee = p([`maction`, `maligngroup`, `malignmark`, `mlongdiv`, `mscarries`, `mscarry`, `msgroup`, `mstack`, `msline`, `msrow`, `semantics`, `annotation`, `annotation-xml`, `mprescripts`, `none`]), De = p([`#text`]), Oe = p(`accept.action.align.alt.autocapitalize.autocomplete.autopictureinpicture.autoplay.background.bgcolor.border.capture.cellpadding.cellspacing.checked.cite.class.clear.color.cols.colspan.command.commandfor.controls.controlslist.coords.crossorigin.datetime.decoding.default.dir.disabled.disablepictureinpicture.disableremoteplayback.download.draggable.enctype.enterkeyhint.exportparts.face.for.headers.height.hidden.high.href.hreflang.id.inert.inputmode.integrity.ismap.kind.label.lang.list.loading.loop.low.max.maxlength.media.method.min.minlength.multiple.muted.name.nonce.noshade.novalidate.nowrap.open.optimum.part.pattern.placeholder.playsinline.popover.popovertarget.popovertargetaction.poster.preload.pubdate.radiogroup.readonly.rel.required.rev.reversed.role.rows.rowspan.spellcheck.scope.selected.shape.size.sizes.slot.span.srclang.start.src.srcset.step.style.summary.tabindex.title.translate.type.usemap.valign.value.width.wrap.xmlns`.split(`.`)), ke = p(`accent-height.accumulate.additive.alignment-baseline.amplitude.ascent.attributename.attributetype.azimuth.basefrequency.baseline-shift.begin.bias.by.class.clip.clippathunits.clip-path.clip-rule.color.color-interpolation.color-interpolation-filters.color-profile.color-rendering.cx.cy.d.dx.dy.diffuseconstant.direction.display.divisor.dominant-baseline.dur.edgemode.elevation.end.exponent.fill.fill-opacity.fill-rule.filter.filterunits.flood-color.flood-opacity.font-family.font-size.font-size-adjust.font-stretch.font-style.font-variant.font-weight.fx.fy.g1.g2.glyph-name.glyphref.gradientunits.gradienttransform.height.href.id.image-rendering.in.in2.intercept.k.k1.k2.k3.k4.kerning.keypoints.keysplines.keytimes.lang.lengthadjust.letter-spacing.kernelmatrix.kernelunitlength.lighting-color.local.marker-end.marker-mid.marker-start.markerheight.markerunits.markerwidth.maskcontentunits.maskunits.max.mask.mask-type.media.method.mode.min.name.numoctaves.offset.operator.opacity.order.orient.orientation.origin.overflow.paint-order.path.pathlength.patterncontentunits.patterntransform.patternunits.pointer-events.points.preservealpha.preserveaspectratio.primitiveunits.r.rx.ry.radius.refx.refy.repeatcount.repeatdur.restart.result.rotate.scale.seed.shape-rendering.slope.specularconstant.specularexponent.spreadmethod.startoffset.stddeviation.stitchtiles.stop-color.stop-opacity.stroke-dasharray.stroke-dashoffset.stroke-linecap.stroke-linejoin.stroke-miterlimit.stroke-opacity.stroke.stroke-width.style.surfacescale.systemlanguage.tabindex.tablevalues.targetx.targety.transform.transform-origin.text-anchor.text-decoration.text-orientation.text-rendering.textlength.type.u1.u2.unicode.values.vector-effect.viewbox.visibility.version.vert-adv-y.vert-origin-x.vert-origin-y.width.word-spacing.wrap.writing-mode.xchannelselector.ychannelselector.x.x1.x2.xmlns.y.y1.y2.z.zoomandpan`.split(`.`)), Ae = p(`accent.accentunder.align.bevelled.close.columnalign.columnlines.columnspacing.columnspan.denomalign.depth.dir.display.displaystyle.encoding.fence.frame.height.href.id.largeop.length.linethickness.lquote.lspace.mathbackground.mathcolor.mathsize.mathvariant.maxsize.minsize.movablelimits.notation.numalign.open.rowalign.rowlines.rowspacing.rowspan.rspace.rquote.scriptlevel.scriptminsize.scriptsizemultiplier.selection.separator.separators.stretchy.subscriptshift.supscriptshift.symmetric.voffset.width.xmlns`.split(`.`)), je = p([`xlink:href`, `xml:id`, `xlink:title`, `xml:space`, `xmlns:xlink`]), Me = m(/{{[\w\W]*|^[\w\W]*}}/g), Ne = m(/<%[\w\W]*|^[\w\W]*%>/g), Pe = m(/\${[\w\W]*/g), Fe = m(/^data-[\-\w.\u00B7-\uFFFF]+$/), Ie = m(/^aria-[\-\w]+$/), Le = m(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i), Re = m(/^(?:\w+script|data):/i), ze = m(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g), Be = m(/^html$/i), Ve = m(/^[a-z][.\w]*(-[.\w]+)+$/i), He = m(/<[/\w!]/g), Ue = m(/<[/\w]/g), We = m(/<\/no(script|embed|frames)/i), Ge = m(/\/>/i), j = { element: 1, attribute: 2, text: 3, cdataSection: 4, entityReference: 5, entityNode: 6, processingInstruction: 7, comment: 8, document: 9, documentType: 10, documentFragment: 11, notation: 12 }, Ke = p(O({}, [`style`, `script`, `xmp`, `iframe`, `noembed`, `noframes`, `plaintext`, `noscript`])), qe = function() {
    return typeof window > `u` ? null : window;
  }, Je = function(e2, t2) {
    if (typeof e2 != `object` || typeof e2.createPolicy != `function`) return null;
    let n2 = null, r2 = `data-tt-policy-suffix`;
    t2 && t2.hasAttribute(r2) && (n2 = t2.getAttribute(r2));
    let i2 = `dompurify` + (n2 ? `#` + n2 : ``);
    try {
      return e2.createPolicy(i2, { createHTML(e3) {
        return e3;
      }, createScriptURL(e3) {
        return e3;
      } });
    } catch (e3) {
      return console.warn(`TrustedTypes policy ` + i2 + ` could not be created.`), null;
    }
  }, Ye = function() {
    return { afterSanitizeAttributes: [], afterSanitizeElements: [], afterSanitizeShadowDOM: [], beforeSanitizeAttributes: [], beforeSanitizeElements: [], beforeSanitizeShadowDOM: [], uponSanitizeAttribute: [], uponSanitizeElement: [], uponSanitizeShadowNode: [] };
  }, M = function(e2, t2, n2, r2) {
    return S(e2, t2) && v(e2[t2]) ? O(r2.base ? k(r2.base) : {}, e2[t2], r2.transform) : n2;
  }, Xe = function(e2, t2, n2) {
    let r2 = S(e2, t2) ? e2[t2] : void 0;
    return r2 && typeof r2 == `object` ? k(r2) : n2();
  };
  function Ze() {
    let e2 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : qe(), t2 = (e3) => Ze(e3);
    if (t2.version = `3.4.17`, t2.removed = [], !e2 || !e2.document || e2.document.nodeType !== j.document || !e2.Element) return t2.isSupported = false, t2;
    let n2 = e2.document, r2 = n2, i2 = r2.currentScript;
    e2.DocumentFragment;
    let a2 = e2.HTMLTemplateElement, o2 = e2.Node, s2 = e2.Element, l2 = e2.NodeFilter;
    e2.NamedNodeMap === void 0 && (e2.NamedNodeMap || e2.MozNamedAttrMap), e2.HTMLFormElement;
    let u2 = e2.DOMParser, d2 = e2.trustedTypes, f2 = s2.prototype, ee2 = A(f2, `cloneNode`), g2 = A(f2, `remove`), te2 = A(f2, `removeAttributeNode`), he2 = A(f2, `nextSibling`), b2 = A(f2, `childNodes`), x2 = A(f2, `parentNode`), ge2 = A(f2, `shadowRoot`), C2 = A(f2, `attributes`), E2 = o2 && o2.prototype ? A(o2.prototype, `nodeType`) : null, D2 = o2 && o2.prototype ? A(o2.prototype, `nodeName`) : null, _e2 = o2 && o2.prototype ? A(o2.prototype, `ownerDocument`) : null, N = function(e3) {
      return E2 ? E2(e3) : e3.nodeType;
    }, Qe = function(e3) {
      return D2 ? D2(e3) : e3.nodeName;
    }, $e = ye(f2, `namespaceURI`), et = function(e3) {
      return $e ? $e(e3) : e3.namespaceURI;
    };
    if (typeof a2 == `function`) {
      let e3 = n2.createElement(`template`);
      e3.content && e3.content.ownerDocument && (n2 = e3.content.ownerDocument);
    }
    let P, F = ``, tt, nt = false, rt = 0, it = function() {
      if (rt > 0) throw T(`A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.`);
    }, at = function(e3) {
      it(), rt++;
      try {
        return P.createHTML(e3);
      } finally {
        rt--;
      }
    }, ot = function(e3) {
      it(), rt++;
      try {
        return P.createScriptURL(e3);
      } finally {
        rt--;
      }
    }, st = function() {
      return nt || (tt = Je(d2, i2), nt = true), tt;
    }, ct = n2, lt = ct.implementation, ut = ct.createNodeIterator, dt = ct.createDocumentFragment, ft = ct.getElementsByTagName, pt = r2.importNode, I = Ye();
    t2.isSupported = typeof c == `function` && typeof x2 == `function` && lt && lt.createHTMLDocument !== void 0;
    let mt = Me, ht = Ne, gt = Pe, _t = Fe, vt = Ie, yt = Re, bt = ze, xt = Ve, St = Le, L = null, Ct = O({}, [...xe, ...Se, ...Ce, ...Te, ...De]), R = null, wt = O({}, [...Oe, ...ke, ...Ae, ...je]), z = Object.seal(h(null, { tagNameCheck: { writable: true, configurable: false, enumerable: true, value: null }, attributeNameCheck: { writable: true, configurable: false, enumerable: true, value: null }, allowCustomizedBuiltInElements: { writable: true, configurable: false, enumerable: true, value: false } })), Tt = null, Et = null, B = Object.seal(h(null, { tagCheck: { writable: true, configurable: false, enumerable: true, value: null }, attributeCheck: { writable: true, configurable: false, enumerable: true, value: null } })), Dt = true, Ot = true, kt = false, At = true, V = false, H = true, U = false, jt = false, Mt = null, Nt = null, Pt = false, W = false, Ft = false, It = false, Lt = true, Rt = false, zt = `user-content-`, Bt = true, Vt = false, G = null, K = {}, q = null, Ht = O({}, `annotation-xml.audio.colgroup.desc.foreignobject.head.iframe.math.mi.mn.mo.ms.mtext.noembed.noframes.noscript.plaintext.script.selectedcontent.style.svg.template.thead.title.video.xmp`.split(`.`)), Ut = null, Wt = O({}, [`audio`, `video`, `img`, `source`, `image`, `track`]), Gt = null, Kt = O({}, [`alt`, `class`, `for`, `id`, `label`, `name`, `pattern`, `placeholder`, `role`, `summary`, `title`, `value`, `style`, `xmlns`]), qt = `http://www.w3.org/1998/Math/MathML`, Jt = `http://www.w3.org/2000/svg`, J = `http://www.w3.org/1999/xhtml`, Yt = J, Xt = false, Zt = null, Qt = O({}, [qt, Jt, J], ue), $t = p([`mi`, `mo`, `mn`, `ms`, `mtext`]), en = O({}, $t), tn = p([`annotation-xml`]), nn = O({}, tn), rn = O({}, [`title`, `style`, `font`, `a`, `script`]), an = null, on = [`application/xhtml+xml`, `text/html`], Y = null, sn = null, cn = n2.createElement(`form`), ln = function(e3) {
      return e3 instanceof RegExp || e3 instanceof Function;
    }, un = function() {
      let e3 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      if (sn && sn === e3) return;
      (!e3 || typeof e3 != `object`) && (e3 = {}), e3 = k(e3), an = on.indexOf(e3.PARSER_MEDIA_TYPE) === -1 ? `text/html` : e3.PARSER_MEDIA_TYPE, Y = an === `application/xhtml+xml` ? ue : y, L = M(e3, `ALLOWED_TAGS`, Ct, { transform: Y }), R = M(e3, `ALLOWED_ATTR`, wt, { transform: Y }), Zt = M(e3, `ALLOWED_NAMESPACES`, Qt, { transform: ue }), Gt = M(e3, `ADD_URI_SAFE_ATTR`, Kt, { transform: Y, base: Kt }), Ut = M(e3, `ADD_DATA_URI_TAGS`, Wt, { transform: Y, base: Wt }), q = M(e3, `FORBID_CONTENTS`, Ht, { transform: Y }), Tt = M(e3, `FORBID_TAGS`, k({}), { transform: Y }), Et = M(e3, `FORBID_ATTR`, k({}), { transform: Y }), K = S(e3, `USE_PROFILES`) ? e3.USE_PROFILES && typeof e3.USE_PROFILES == `object` ? k(e3.USE_PROFILES) : e3.USE_PROFILES : false, Dt = e3.ALLOW_ARIA_ATTR !== false, Ot = e3.ALLOW_DATA_ATTR !== false, kt = e3.ALLOW_UNKNOWN_PROTOCOLS || false, At = e3.ALLOW_SELF_CLOSE_IN_ATTR !== false, V = e3.SAFE_FOR_TEMPLATES || false, H = e3.SAFE_FOR_XML !== false, U = e3.WHOLE_DOCUMENT || false, W = e3.RETURN_DOM || false, Ft = e3.RETURN_DOM_FRAGMENT || false, It = e3.RETURN_TRUSTED_TYPE || false, Pt = e3.FORCE_BODY || false, Lt = e3.SANITIZE_DOM !== false, Rt = e3.SANITIZE_NAMED_PROPS || false, Bt = e3.KEEP_CONTENT !== false, Vt = e3.IN_PLACE || false, St = be(e3.ALLOWED_URI_REGEXP) ? e3.ALLOWED_URI_REGEXP : Le, Yt = typeof e3.NAMESPACE == `string` ? e3.NAMESPACE : J, en = Xe(e3, `MATHML_TEXT_INTEGRATION_POINTS`, () => O({}, $t)), nn = Xe(e3, `HTML_INTEGRATION_POINTS`, () => O({}, tn));
      let t3 = Xe(e3, `CUSTOM_ELEMENT_HANDLING`, () => h(null));
      if (z = h(null), S(t3, `tagNameCheck`) && ln(t3.tagNameCheck) && (z.tagNameCheck = t3.tagNameCheck), S(t3, `attributeNameCheck`) && ln(t3.attributeNameCheck) && (z.attributeNameCheck = t3.attributeNameCheck), S(t3, `allowCustomizedBuiltInElements`) && typeof t3.allowCustomizedBuiltInElements == `boolean` && (z.allowCustomizedBuiltInElements = t3.allowCustomizedBuiltInElements), m(z), V && (Ot = false), Ft && (W = true), K && (L = O({}, De), R = h(null), K.html === true && (O(L, xe), O(R, Oe)), K.svg === true && (O(L, Se), O(R, ke), O(R, je)), K.svgFilters === true && (O(L, Ce), O(R, ke), O(R, je)), K.mathMl === true && (O(L, Te), O(R, Ae), O(R, je))), B.tagCheck = null, B.attributeCheck = null, S(e3, `ADD_TAGS`) && (typeof e3.ADD_TAGS == `function` ? B.tagCheck = e3.ADD_TAGS : v(e3.ADD_TAGS) && (L === Ct && (L = k(L)), O(L, e3.ADD_TAGS, Y))), S(e3, `ADD_ATTR`) && (typeof e3.ADD_ATTR == `function` ? B.attributeCheck = e3.ADD_ATTR : v(e3.ADD_ATTR) && (R === wt && (R = k(R)), O(R, e3.ADD_ATTR, Y))), S(e3, `ADD_FORBID_CONTENTS`) && v(e3.ADD_FORBID_CONTENTS) && (q === Ht && (q = k(q)), O(q, e3.ADD_FORBID_CONTENTS, Y)), Bt && (L[`#text`] = true), U && O(L, [`html`, `head`, `body`]), L.table && (O(L, [`tbody`]), delete Tt.tbody), e3.TRUSTED_TYPES_POLICY) {
        if (typeof e3.TRUSTED_TYPES_POLICY.createHTML != `function`) throw T(`TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.`);
        if (typeof e3.TRUSTED_TYPES_POLICY.createScriptURL != `function`) throw T(`TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.`);
        let t4 = P;
        P = e3.TRUSTED_TYPES_POLICY;
        try {
          F = at(``);
        } catch (e4) {
          throw P = t4, e4;
        }
      } else e3.TRUSTED_TYPES_POLICY === null ? (P = void 0, F = ``) : (P === void 0 && (P = st()), P && typeof F == `string` && (F = at(``)));
      p && p(e3), sn = e3;
    }, dn = O({}, [...Se, ...Ce, ...we]), fn = O({}, [...Te, ...Ee]), pn = function(e3, t3, n3) {
      return t3.namespaceURI === J ? e3 === `svg` : t3.namespaceURI === qt ? e3 === `svg` && (n3 === `annotation-xml` || en[n3]) : !!dn[e3];
    }, mn = function(e3, t3, n3) {
      return t3.namespaceURI === J ? e3 === `math` : t3.namespaceURI === Jt ? e3 === `math` && nn[n3] : !!fn[e3];
    }, hn = function(e3, t3, n3) {
      return t3.namespaceURI === Jt && !nn[n3] || t3.namespaceURI === qt && !en[n3] ? false : !fn[e3] && (rn[e3] || !dn[e3]);
    }, gn = function(e3) {
      let t3 = et(e3), n3 = y(Qe(e3)), r3 = x2(e3), i3, a3;
      return r3 && N(r3) === j.element ? (i3 = { namespaceURI: et(r3) }, a3 = y(Qe(r3))) : (i3 = { namespaceURI: Yt }, a3 = `template`), Zt[t3] ? t3 === Jt ? pn(n3, i3, a3) : t3 === qt ? mn(n3, i3, a3) : t3 === J ? hn(n3, i3, a3) : !!(an === `application/xhtml+xml` && Zt[t3]) : false;
    }, X = function(e3) {
      ie(t2.removed, { element: e3 });
      try {
        x2(e3).removeChild(e3);
      } catch (t3) {
        if (g2(e3), !x2(e3)) throw T(`a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place`);
      }
    }, _n = function(e3, t3, n3) {
      try {
        te2(e3, t3);
      } catch (t4) {
        try {
          e3.removeAttribute(n3);
        } catch (e4) {
        }
      }
    }, vn = function(e3) {
      Sn(e3);
      let t3 = b2(e3);
      t3 && _(ae(t3), (e4) => {
        try {
          g2(e4);
        } catch (e5) {
        }
      });
      let n3 = N(e3) === j.element ? C2(e3) : null;
      if (n3) for (let t4 = n3.length - 1; t4 >= 0; --t4) {
        let r3 = n3[t4], i3 = r3 && r3.name;
        typeof i3 == `string` && _n(e3, r3, i3);
      }
    }, yn = function(e3, n3, r3) {
      if (!r3) try {
        r3 = n3.getAttributeNode(e3);
      } catch (e4) {
        r3 = null;
      }
      ie(t2.removed, { attribute: r3 || null, from: n3 });
      try {
        r3 ? te2(n3, r3) : n3.removeAttribute(e3);
      } catch (t3) {
        try {
          n3.removeAttribute(e3);
        } catch (e4) {
        }
      }
      if (e3 === `is`) {
        if (W || Ft) try {
          X(n3);
        } catch (e4) {
        }
        else try {
          n3.setAttribute(e3, ``);
        } catch (e4) {
        }
      }
    }, bn = function(e3) {
      let t3 = C2(e3);
      if (t3) for (let n3 = t3.length - 1; n3 >= 0; --n3) {
        let r3 = t3[n3], i3 = r3 && r3.name;
        typeof i3 != `string` || R[Y(i3)] || _n(e3, r3, i3);
      }
    }, xn = function(e3, t3) {
      let n3 = arguments.length > 2 && arguments[2] !== void 0 && arguments[2], r3 = [e3];
      for (; r3.length > 0; ) {
        let e4 = r3.pop();
        if (t3(e4) === false) continue;
        if (n3 && N(e4) === j.element) {
          let t4 = ge2(e4);
          Z(t4) && r3.push(t4);
        }
        let i3 = b2(e4);
        if (i3) for (let e5 = i3.length - 1; e5 >= 0; --e5) r3.push(i3[e5]);
      }
    }, Sn = function(e3) {
      xn(e3, (e4) => {
        N(e4) === j.element && bn(e4);
      });
    }, Cn = function(e3) {
      let t3 = [];
      return xn(e3, (e4) => {
        t3.push(e4);
      }, true), t3;
    }, wn = function(e3, t3) {
      let n3 = se();
      _(Cn(e3), (e4) => {
        N(e4) === j.element && ce(n3, e4);
      }), _(t3, (e4) => {
        N(e4) === j.element && !le(n3, e4) && bn(e4);
      });
    }, Tn = function(e3, n3) {
      let r3 = false;
      return _(t2.removed, (t3) => {
        t3.element && (r3 = r3 || t3.element === e3, Sn(t3.element));
      }), wn(e3, n3), r3;
    }, En = function(e3, t3) {
      let n3 = G, r3 = null, i3 = () => (r3 || (r3 = se(), _(t3, (e4) => {
        ce(r3, e4);
      })), r3);
      for (let t4 = 0; ; t4++) {
        let r4 = Cn(e3), a3 = [e3], o3 = false;
        if (_(r4, (e4) => {
          N(e4) === j.documentFragment ? ie(a3, e4) : !o3 && !le(n3, e4) && (o3 = le(i3(), e4));
        }), !o3) return;
        if (t4 >= 8) throw T(`the tree kept changing during in-place sanitization; refusing to return it`);
        _(a3, (t5, n4) => {
          Dn(t5, n4 > 0, e3, i3());
        });
      }
    }, Dn = function(e3, t3, n3, r3) {
      let i3 = Mn(e3), a3;
      for (; a3 = i3.nextNode(); ) le(r3, a3) && !le(G, a3) && (t3 && Q(I.uponSanitizeShadowNode, a3, null), Hn(a3, n3), Yn(a3, n3), Z(a3.content) && Xn(a3.content));
    }, On = function(e3) {
      G && ce(G, e3);
    }, kn = function(e3, t3) {
      return H ? e3 === `patchsrc` || e3 === `for` && t3 !== `label` && t3 !== `output` : false;
    }, An = function(e3) {
      H && xn(e3, (e4) => {
        let t3 = N(e4);
        if (t3 === j.processingInstruction || t3 === j.comment && w(Ue, e4.data)) {
          try {
            g2(e4);
          } catch (e5) {
          }
          return false;
        }
        if (t3 === j.element) {
          let t4 = e4, n3 = Y(Qe(e4));
          try {
            t4.hasAttribute && t4.hasAttribute(`patchsrc`) && t4.removeAttribute(`patchsrc`), t4.hasAttribute && t4.hasAttribute(`for`) && kn(`for`, n3) && t4.removeAttribute(`for`);
          } catch (e5) {
          }
        }
        return true;
      });
    }, jn = function(e3) {
      let t3 = null, r3 = null;
      if (Pt) e3 = `<remove></remove>` + e3;
      else {
        let t4 = de(e3, /^[\r\n\t ]+/);
        r3 = t4 && t4[0];
      }
      an === `application/xhtml+xml` && Yt === J && (e3 = `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>` + e3 + `</body></html>`);
      let i3 = P ? at(e3) : e3;
      if (Yt === J) try {
        t3 = new u2().parseFromString(i3, an);
      } catch (e4) {
      }
      if (!t3 || !t3.documentElement) {
        t3 = lt.createDocument(Yt, `template`, null);
        try {
          t3.documentElement.innerHTML = Xt ? F : i3;
        } catch (e4) {
        }
      }
      let a3 = t3.body || t3.documentElement;
      return e3 && r3 && a3.insertBefore(n2.createTextNode(r3), a3.childNodes[0] || null), Yt === J ? ft.call(t3, U ? `html` : `body`)[0] : U ? t3.documentElement : a3;
    }, Mn = function(e3) {
      let t3 = _e2 ? _e2(e3) : e3.ownerDocument;
      return ut.call(t3 || e3, e3, l2.SHOW_ELEMENT | l2.SHOW_COMMENT | l2.SHOW_TEXT | l2.SHOW_PROCESSING_INSTRUCTION | l2.SHOW_CDATA_SECTION, null);
    }, Nn = function(e3) {
      return e3 = fe(e3, mt, ` `), e3 = fe(e3, ht, ` `), e3 = fe(e3, gt, ` `), e3;
    }, Pn = function(e3) {
      var t3;
      Fn(e3);
      let n3 = (t3 = e3.querySelectorAll) == null ? void 0 : t3.call(e3, `template`);
      n3 && _(n3, (e4) => {
        Z(e4.content) && Pn(e4.content);
      });
    }, Fn = function(e3) {
      e3.normalize();
      let t3 = _e2 ? _e2(e3) : e3.ownerDocument, n3 = ut.call(t3 || e3, e3, l2.SHOW_TEXT | l2.SHOW_COMMENT | l2.SHOW_CDATA_SECTION | l2.SHOW_PROCESSING_INSTRUCTION, null), r3 = n3.nextNode();
      for (; r3; ) r3.data = Nn(r3.data), r3 = n3.nextNode();
    }, In = function(e3) {
      let t3 = D2 ? D2(e3) : null;
      return typeof t3 != `string` || Y(t3) !== `form` ? false : typeof e3.nodeName != `string` || typeof e3.textContent != `string` || typeof e3.removeChild != `function` || e3.attributes !== C2(e3) || typeof e3.removeAttribute != `function` || typeof e3.removeAttributeNode != `function` || typeof e3.getAttributeNode != `function` || typeof e3.setAttribute != `function` || typeof e3.namespaceURI != `string` || typeof e3.insertBefore != `function` || typeof e3.hasChildNodes != `function` || e3.nodeType !== E2(e3) || e3.childNodes !== b2(e3);
    }, Z = function(e3) {
      if (!E2 || typeof e3 != `object` || !e3) return false;
      try {
        return E2(e3) === j.documentFragment;
      } catch (e4) {
        return false;
      }
    }, Ln = function(e3) {
      if (!E2 || typeof e3 != `object` || !e3) return false;
      try {
        return typeof E2(e3) == `number`;
      } catch (e4) {
        return false;
      }
    };
    function Q(e3, n3, r3) {
      e3.length !== 0 && _(e3, (e4) => {
        e4.call(t2, n3, r3, sn);
      });
    }
    let Rn = function(e3, t3) {
      return !!(H && e3.hasChildNodes() && !Ln(e3.firstElementChild) && w(He, e3.textContent) && w(He, e3.innerHTML) || H && Ke[t3] && N(e3) === j.element && et(e3) === J && (Ln(e3.firstElementChild) || typeof e3.textContent == `string` && w(He, e3.textContent)) || e3.nodeType === j.processingInstruction || H && e3.nodeType === j.comment && w(Ue, e3.data));
    }, zn = function(e3, t3) {
      return e3 instanceof RegExp ? w(e3, t3) : e3 instanceof Function && !!e3(t3, ...[...arguments].slice(2));
    }, Bn = function(e3, t3, n3) {
      if (!Tt[t3] && Gn(t3) && zn(z.tagNameCheck, t3)) return false;
      if (Bt && !q[t3] && !q[y(t3)]) {
        let t4 = x2(e3), r3 = b2(e3);
        if (r3 && t4) {
          let i3 = r3.length;
          for (let a3 = i3 - 1; a3 >= 0; --a3) {
            let i4 = e3 === n3 ? ee2(r3[a3], true) : r3[a3];
            t4.insertBefore(i4, he2(e3));
          }
        }
      }
      return X(e3), true;
    }, Vn = function(e3, t3, n3, r3) {
      return e3.length === 0 ? t3 : t3 === n3 || t3 === r3 ? k(t3) : t3;
    }, $ = function(e3, t3) {
      return e3 === t3 || x2(e3) !== null ? false : (Vt && Sn(e3), true);
    }, Hn = function(e3, n3) {
      if (On(e3), Q(I.beforeSanitizeElements, e3, null), $(e3, n3)) return true;
      if (In(e3)) return X(e3), true;
      let r3 = Y(Qe(e3));
      if (L = Vn(I.uponSanitizeElement, L, Ct, Mt), Q(I.uponSanitizeElement, e3, { tagName: r3, allowedTags: L }), $(e3, n3)) return true;
      if (Rn(e3, r3)) return X(e3), true;
      if (Tt[r3] || !(B.tagCheck instanceof Function && B.tagCheck(r3)) && !L[r3]) {
        let t3 = Bn(e3, r3, n3);
        return t3 === false && (Q(I.afterSanitizeElements, e3, null), $(e3, n3)) ? true : t3;
      }
      if (N(e3) === j.element && !gn(e3) || (r3 === `noscript` || r3 === `noembed` || r3 === `noframes`) && w(We, e3.innerHTML)) return X(e3), true;
      if (V && e3.nodeType === j.text) {
        let n4 = Nn(e3.textContent);
        e3.textContent !== n4 && (ie(t2.removed, { element: e3.cloneNode() }), e3.textContent = n4);
      }
      return Q(I.afterSanitizeElements, e3, null), $(e3, n3);
    }, Un = function(e3, t3, r3) {
      if (Et[t3] || kn(t3, e3) || Lt && (t3 === `id` || t3 === `name`) && (r3 in n2 || r3 in cn)) return false;
      let i3 = R[t3] || B.attributeCheck instanceof Function && B.attributeCheck(t3, e3);
      return Ot && w(_t, t3) || Dt && w(vt, t3) ? true : i3 ? Gt[t3] || w(St, fe(r3, bt, ``)) || (t3 === `src` || t3 === `xlink:href` || t3 === `href`) && e3 !== `script` && pe(r3, `data:`) === 0 && Ut[e3] || kt && !w(yt, fe(r3, bt, ``)) ? true : !r3 : Gn(e3) && zn(z.tagNameCheck, e3) && zn(z.attributeNameCheck, t3, e3) || t3 === `is` && z.allowCustomizedBuiltInElements && zn(z.tagNameCheck, r3);
    }, Wn = O({}, [`annotation-xml`, `color-profile`, `font-face`, `font-face-format`, `font-face-name`, `font-face-src`, `font-face-uri`, `missing-glyph`]), Gn = function(e3) {
      return !Wn[y(e3)] && w(xt, e3);
    }, Kn = function(e3, t3, n3, r3) {
      if (P && typeof d2 == `object` && typeof d2.getAttributeType == `function` && !n3) switch (d2.getAttributeType(e3, t3)) {
        case `TrustedHTML`:
          return at(r3);
        case `TrustedScriptURL`:
          return ot(r3);
      }
      return r3;
    }, qn = function(e3, t3, n3, r3) {
      try {
        return n3 ? e3.setAttributeNS(n3, t3, r3) : e3.setAttribute(t3, r3), !In(e3) || (X(e3), false);
      } catch (n4) {
        return yn(t3, e3), false;
      }
    }, Jn = function(e3, t3) {
      return H && w(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, t3) ? true : y(e3) === `attributename` && de(t3, `href`) !== null;
    }, Yn = function(e3, n3) {
      if (Q(I.beforeSanitizeAttributes, e3, null), $(e3, n3)) return;
      let r3 = e3.attributes;
      if (!r3 || In(e3)) return;
      R = Vn(I.uponSanitizeAttribute, R, wt, Nt);
      let i3 = { attrName: ``, attrValue: ``, keepAttr: true, allowedAttributes: R, forceKeepAttr: void 0 }, a3 = r3.length, o3 = Y(e3.nodeName);
      for (; a3--; ) {
        let n4 = r3[a3], s3 = n4.name, c2 = n4.namespaceURI, l3 = n4.value, u3 = Y(s3), d3 = l3, f3 = s3 === `value` ? d3 : me(d3), p2 = false;
        i3.attrName = u3, i3.attrValue = f3, i3.keepAttr = true, i3.forceKeepAttr = void 0, Q(I.uponSanitizeAttribute, e3, i3), f3 = i3.attrValue, Rt && (u3 === `id` || u3 === `name`) && pe(f3, zt) !== 0 && (yn(s3, e3, n4), f3 = zt + f3, p2 = true), Jn(s3, f3) ? yn(s3, e3, n4) : i3.forceKeepAttr || (i3.keepAttr ? !At && w(Ge, f3) ? yn(s3, e3, n4) : (V && (f3 = Nn(f3)), Un(o3, u3, f3) ? (f3 = Kn(o3, u3, c2, f3), f3 !== d3 && qn(e3, s3, c2, f3) && p2 && re(t2.removed)) : yn(s3, e3, n4)) : yn(s3, e3, n4));
      }
      Q(I.afterSanitizeAttributes, e3, null), $(e3, n3);
    }, Xn = function(e3) {
      let t3 = null, n3 = Mn(e3);
      for (Q(I.beforeSanitizeShadowDOM, e3, null); t3 = n3.nextNode(); ) if (Q(I.uponSanitizeShadowNode, t3, null), Hn(t3, e3), Yn(t3, e3), Z(t3.content) && Xn(t3.content), N(t3) === j.element) {
        let e4 = ge2(t3);
        Z(e4) && (Zn(e4), Xn(e4));
      }
      V && Fn(e3), Q(I.afterSanitizeShadowDOM, e3, null);
    }, Zn = function(e3) {
      let t3 = [{ node: e3, shadow: null }];
      for (; t3.length > 0; ) {
        let e4 = t3.pop();
        if (e4.shadow) {
          Xn(e4.shadow);
          continue;
        }
        let n3 = e4.node, r3 = N(n3) === j.element, i3 = b2(n3);
        if (i3) for (let e5 = i3.length - 1; e5 >= 0; --e5) t3.push({ node: i3[e5], shadow: null });
        if (r3) {
          let e5 = D2 ? D2(n3) : null;
          if (typeof e5 == `string` && Y(e5) === `template`) {
            let e6 = n3.content;
            Z(e6) && t3.push({ node: e6, shadow: null });
          }
        }
        if (r3) {
          let e5 = ge2(n3);
          Z(e5) && t3.push({ node: null, shadow: e5 }, { node: e5, shadow: null });
        }
      }
    };
    return t2.sanitize = function(e3) {
      let n3 = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, i3 = null, a3 = null, o3 = null, s3 = null;
      if (Xt = !e3, Xt && (e3 = `<!-->`), typeof e3 != `string` && !Ln(e3) && (e3 = ve(e3), typeof e3 != `string`)) throw T(`dirty is not a string, aborting`);
      if (!t2.isSupported) return e3;
      jt ? (L = Mt, R = Nt) : un(n3), (I.uponSanitizeElement.length > 0 || I.uponSanitizeAttribute.length > 0) && (L = k(L)), I.uponSanitizeAttribute.length > 0 && (R = k(R)), t2.removed = [];
      let c2 = Vt && typeof e3 != `string` && Ln(e3), l3 = [], u3 = G;
      if (c2) {
        An(e3);
        let t3 = Qe(e3);
        if (typeof t3 == `string`) {
          let n4 = Y(t3);
          if (!L[n4] || Tt[n4]) throw vn(e3), T(`root node is forbidden and cannot be sanitized in-place`);
        }
        if (In(e3)) throw vn(e3), T(`root node is clobbered and cannot be sanitized in-place`);
        l3 = Cn(e3), G = se();
      } else if (Ln(e3)) i3 = jn(`<!---->`), a3 = i3.ownerDocument.importNode(e3, true), a3.nodeType === j.element && a3.nodeName === `BODY` || a3.nodeName === `HTML` ? i3 = a3 : i3.appendChild(a3), Zn(i3);
      else {
        if (!W && !V && !U && e3.indexOf(`<`) === -1) return P && It ? at(e3) : e3;
        if (i3 = jn(e3), !i3) return W ? null : It ? F : ``;
      }
      i3 && Pt && X(i3.firstChild);
      let d3 = c2 ? e3 : i3;
      try {
        c2 && Zn(e3);
        let t3 = Mn(d3);
        for (; o3 = t3.nextNode(); ) Hn(o3, d3), Yn(o3, d3), Z(o3.content) && Xn(o3.content);
        c2 && En(e3, l3);
      } catch (t3) {
        throw c2 && (vn(e3), Tn(e3, l3)), t3;
      } finally {
        G = u3;
      }
      if (c2) {
        if (Tn(e3, l3)) throw T(`a node selected for removal could not be safely returned; refusing to sanitize in place`);
        return V && Pn(e3), e3;
      }
      if (W) {
        if (V && Pn(i3), Ft) for (s3 = dt.call(i3.ownerDocument); i3.firstChild; ) s3.appendChild(i3.firstChild);
        else s3 = i3;
        return (R.shadowroot || R.shadowrootmode) && (s3 = pt.call(r2, s3, true)), s3;
      }
      let f3 = U ? i3.outerHTML : i3.innerHTML;
      return U && L[`!doctype`] && i3.ownerDocument && i3.ownerDocument.doctype && i3.ownerDocument.doctype.name && w(Be, i3.ownerDocument.doctype.name) && (f3 = `<!DOCTYPE ` + i3.ownerDocument.doctype.name + `>
` + f3), V && (f3 = Nn(f3)), P && It ? at(f3) : f3;
    }, t2.setConfig = function() {
      let e3 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      un(e3), jt = true, Mt = L, Nt = R;
    }, t2.clearConfig = function() {
      sn = null, jt = false, Mt = null, Nt = null, P = tt, F = ``;
    }, t2.isValidAttribute = function(e3, t3, n3) {
      sn || un({});
      let r3 = Y(e3), i3 = Y(t3);
      return typeof n3 == `string` && (Jn(t3, n3) || !At && w(Ge, n3)) ? false : Un(r3, i3, n3);
    }, t2.addHook = function(e3, t3) {
      typeof t3 == `function` && S(I, e3) && ie(I[e3], t3);
    }, t2.removeHook = function(e3, t3) {
      if (S(I, e3)) {
        if (t3 !== void 0) {
          let n3 = ne(I[e3], t3);
          return n3 === -1 ? void 0 : oe(I[e3], n3, 1)[0];
        }
        return re(I[e3]);
      }
    }, t2.removeHooks = function(e3) {
      S(I, e3) && (I[e3] = []);
    }, t2.removeAllHooks = function() {
      I = Ye();
    }, t2;
  }
  return Ze();
});
export default module.exports;
