// ==UserScript==
// @name         sboxskins nameid harvester
// @namespace    https://sboxskins.gg
// @version      1.0.1
// @description  Grabs S&box item_nameids from Steam Market pages (in your real, logged-in browser — no bot detection) and sends them to sboxskins.gg so buy/sell order books fill in. Passive capture on any item page, plus a "Harvest all missing" command that walks the whole backlog with a persistent progress bar.
// @author       sboxskins.gg
// @match        https://steamcommunity.com/market/*
// @connect      sboxskins.gg
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @downloadURL  https://sboxskins.gg/sbox-nameid-harvester.user.js
// @updateURL    https://sboxskins.gg/sbox-nameid-harvester.user.js
// ==/UserScript==

(function () {
  "use strict";

  var APP = "590830";
  var API = "https://sboxskins.gg";
  var LISTING_RE = new RegExp("/market/listings/" + APP + "/([^/?#]+)");
  var DELAY_MS = 3500;        // pause between items (polite to Steam)
  var READ_TIMEOUT_MS = 10000; // how long to wait for a page's nameid to render
  var POST_TIMEOUT_MS = 15000; // network timeout so nothing can hang forever

  function log() {
    try { console.log.apply(console, ["[sbox-harvester]"].concat([].slice.call(arguments))); } catch (e) {}
  }

  // Belt + suspenders: also capture the nameid from the order-book AJAX call.
  var capturedNameid = null;
  function hookUrl(u) {
    try { var m = String(u).match(/itemordershistogram[^"']*item_nameid=(\d+)/); if (m) capturedNameid = m[1]; } catch (e) {}
  }
  try { var _open = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (mth, u) { hookUrl(u); return _open.apply(this, arguments); }; } catch (e) {}
  try { if (window.fetch) { var _f = window.fetch; window.fetch = function (u) { hookUrl(u); return _f.apply(this, arguments); }; } } catch (e) {}

  function getKeyQuiet() { return (GM_getValue("sbox_admin_key", "") || "").trim(); }
  function ensureKey() {
    var k = getKeyQuiet();
    if (!k) {
      k = window.prompt("sboxskins admin key (ANALYTICS_KEY).\nStored only in Tampermonkey on this machine; only ever sent to sboxskins.gg.");
      if (k) { k = k.trim(); GM_setValue("sbox_admin_key", k); }
    }
    return k || "";
  }

  function getQ() { try { return JSON.parse(sessionStorage.getItem("sbox_harvest_q") || "null"); } catch (e) { return null; } }
  function setQ(q) { sessionStorage.setItem("sbox_harvest_q", JSON.stringify(q)); }
  function clearQ() { sessionStorage.removeItem("sbox_harvest_q"); }

  // Persistent top bar, rebuilt from the queue on every page so progress is always visible.
  function banner() {
    try {
      var q = getQ();
      var el = document.getElementById("sbox-harv-banner");
      if (!q) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement("div");
        el.id = "sbox-harv-banner";
        el.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;right:0;background:#6d28d9;color:#fff;padding:8px 14px;font:600 13px/1.35 Arial,sans-serif;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.45)";
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = "sboxskins harvester — " + (q.done || 0) + " / " + q.total + " done" + (q.list.length ? (" · now: " + q.list[0]) : "") + ".  Leave this tab open.";
    } catch (e) {}
  }

  function toast(msg, color) {
    try {
      var d = document.createElement("div");
      d.textContent = msg;
      d.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;background:" + (color || "#6d28d9") + ";color:#fff;padding:10px 14px;border-radius:8px;font:600 13px/1.35 Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);max-width:340px";
      (document.body || document.documentElement).appendChild(d);
      setTimeout(function () { d.remove(); }, 5000);
    } catch (e) {}
  }

  function currentHash() { var m = LISTING_RE.exec(location.pathname); return m ? decodeURIComponent(m[1]) : null; }

  function readNameidOnce() {
    if (capturedNameid) return capturedNameid;
    var s = document.documentElement.innerHTML, k = "Market_LoadOrderSpread(", i = s.indexOf(k);
    if (i < 0) return null;
    var j = s.indexOf(")", i); if (j < 0) return null;
    var id = s.slice(i + k.length, j).trim();
    return /^[0-9]+$/.test(id) ? id : null;
  }
  function readNameid(cb) {
    var start = Date.now();
    (function poll() {
      var id = readNameidOnce();
      if (id) { cb(id); return; }
      if (Date.now() - start > READ_TIMEOUT_MS) { cb(null); return; }
      setTimeout(poll, 1200);
    })();
  }

  function sendNameid(hash, nameid, cb) {
    var key = getKeyQuiet();
    if (!key) { log("no key set; skipping POST for", hash); cb(false); return; }
    var done = false;
    function once(ok) { if (done) return; done = true; cb(ok); }
    GM_xmlhttpRequest({
      method: "POST", url: API + "/api/admin/item-nameid", timeout: POST_TIMEOUT_MS,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      data: JSON.stringify({ hash: hash, nameid: nameid }),
      onload: function (r) { if (r.status === 401) GM_setValue("sbox_admin_key", ""); log("POST", hash, "->", r.status); once(r.status >= 200 && r.status < 300); },
      onerror: function () { log("POST error", hash); once(false); },
      ontimeout: function () { log("POST timeout", hash); once(false); },
    });
  }

  function gotoHash(h) { location.href = "https://steamcommunity.com/market/listings/" + APP + "/" + encodeURIComponent(h); }

  function advance(q) {
    banner();
    if (q.list.length) { log("advancing in", DELAY_MS, "ms;", q.list.length, "left"); setTimeout(function () { gotoHash(q.list[0]); }, DELAY_MS); }
    else { clearQ(); banner(); toast("Harvest complete — " + q.done + " nameids sent. 🎉", "#15803d"); log("complete:", q.done, "sent"); }
  }

  function startHarvest() {
    var key = ensureKey(); if (!key) return;
    toast("Fetching missing-nameid list…");
    GM_xmlhttpRequest({
      method: "GET", url: API + "/api/admin/items-missing-nameid", timeout: POST_TIMEOUT_MS,
      headers: { Authorization: "Bearer " + key },
      onload: function (r) {
        if (r.status === 401) { GM_setValue("sbox_admin_key", ""); toast("Admin key rejected.", "#b91c1c"); return; }
        var data; try { data = JSON.parse(r.responseText); } catch (e) { toast("Bad response from sboxskins.", "#b91c1c"); return; }
        var list = (data.items || []).map(function (it) { return it.steamMarketId; }).filter(Boolean);
        if (!list.length) { toast("Nothing to harvest — every item already has a nameid. 🎉", "#15803d"); return; }
        setQ({ list: list, total: list.length, done: 0 });
        log("starting harvest of", list.length, "items");
        toast("Harvesting " + list.length + " items — a bar appears up top. Leave this tab open.");
        gotoHash(list[0]);
      },
      onerror: function () { toast("Could not reach sboxskins.", "#b91c1c"); },
      ontimeout: function () { toast("sboxskins request timed out.", "#b91c1c"); },
    });
  }

  function onListingPage() {
    var hash = currentHash(); if (!hash) return;
    var q = getQ();
    var harvesting = !!(q && q.list && q.list.length && q.list[0] === hash);
    banner();
    log("listing page:", hash, "| harvesting:", harvesting);
    readNameid(function (nameid) {
      try {
        if (harvesting) {
          var fin = function (ok) {
            q.done = (q.done || 0) + 1; q.list.shift(); setQ(q); banner();
            toast("[" + q.done + "/" + q.total + "] " + (ok ? "✓ " : "⚠ ") + hash);
            advance(q);
          };
          if (nameid) sendNameid(hash, nameid, fin);
          else { log("no nameid found for", hash, "— skipping"); fin(false); }
        } else if (nameid) {
          sendNameid(hash, nameid, function (ok) { if (ok) toast("✓ nameid sent for " + hash, "#15803d"); });
        }
      } catch (e) {
        log("error on", hash, e);
        if (harvesting) { q.list.shift(); setQ(q); advance(q); }
      }
    });
  }

  GM_registerMenuCommand("Harvest all missing nameids → sboxskins", startHarvest);
  GM_registerMenuCommand("Reset sboxskins admin key", function () { GM_setValue("sbox_admin_key", ""); toast("Admin key cleared."); });

  banner();
  if (LISTING_RE.test(location.pathname)) onListingPage();
})();
