/*
 * dc-lite.js — tiny standalone renderer for the reference screens.
 * Supports exactly what these files use: {{ path }} holes, <sc-for>, <sc-if>,
 * onClick handlers, a Component class with state/setState and lifecycle.
 * Reference only: the real app should be rebuilt in React/Next, not with this.
 */
(function () {
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, p);
    if (this.__render && !window.__dcSilent) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }

  function renderNode(node, scope, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      var list = lookup((node.getAttribute('list') || '').replace(/[{}]/g, ''), scope) || [];
      var as = node.getAttribute('as') || 'item';
      list.forEach(function (item, idx) {
        var s = Object.create(scope); s[as] = item; s.$index = idx;
        node.childNodes.forEach(function (c) { renderNode(c, s, out); });
      });
      return;
    }
    if (tag === 'sc-if') {
      if (lookup((node.getAttribute('value') || '').replace(/[{}]/g, ''), scope)) {
        node.childNodes.forEach(function (c) { renderNode(c, scope, out); });
      }
      return;
    }
    var el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.tagName)
      : document.createElement(node.tagName);
    Array.prototype.forEach.call(node.attributes, function (a) {
      var name = a.name, val = a.value;
      if (/^hint-/.test(name)) return;
      var m = val.match(WHOLE);
      if (/^on[a-z]+$/.test(name)) {
        if (m) {
          var fn = lookup(m[1], scope);
          if (typeof fn === 'function') {
            var isField = /^(input|textarea)$/.test(tag);
            if (name === 'onchange' && isField) {
              // Typing updates state silently so the field keeps focus; the next action re-renders.
              el.addEventListener('input', function (e) { window.__dcSilent = true; try { fn(e); } finally { window.__dcSilent = false; } });
            } else {
              el.addEventListener(name.slice(2), fn);
            }
          }
        }
        return;
      }
      if (name === 'href') val = val.replace(/\.dc\.html$/, '.html');
      el.setAttribute(name, interp(val, scope));
    });
    var src = tag === 'template' ? node.content : node;
    src.childNodes.forEach(function (c) { renderNode(c, scope, el); });
    if ((tag === 'input' || tag === 'textarea') && node.hasAttribute('value')) el.value = interp(node.getAttribute('value'), scope);
    out.appendChild(el);
  }

  function boot() {
    var host = document.querySelector('x-dc');
    var scriptEl = document.querySelector('script[data-dc-script]');
    if (!host || !scriptEl) return;
    var helmet = host.querySelector('helmet');
    if (helmet) { Array.prototype.slice.call(helmet.childNodes).forEach(function (n) { document.head.appendChild(n); }); helmet.remove(); }
    var tpl = document.createElement('div');
    Array.prototype.slice.call(host.childNodes).forEach(function (n) { tpl.appendChild(n); });
    var Component = new Function('DCLogic', scriptEl.textContent + '\nreturn Component;')(DCLogic);
    var inst = new Component({});
    var mount = document.createElement('div');
    mount.className = 'dc-root';
    host.replaceWith(mount);
    inst.__render = function () {
      var frag = document.createDocumentFragment();
      var vals = inst.renderVals() || {};
      tpl.childNodes.forEach(function (c) { renderNode(c, vals, frag); });
      mount.replaceChildren(frag);
    };
    inst.__render();
    if (inst.componentDidMount) inst.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
