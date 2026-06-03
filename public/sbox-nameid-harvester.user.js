// ==UserScript==
// @name         sboxskins nameid harvester
// @namespace    https://sboxskins.gg
// @version      1.0.0
// @description  Grabs S&box item_nameids from Steam Market pages (in your real, logged-in browser — no bot detection) and sends them to sboxskins.gg so buy/sell order books fill in. Captures passively on any item page, plus a "Harvest all missing" command that walks the whole backlog.
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

  var APP = "590830"; // S&box
  var API = "https://sboxskins.gg";
  var LISTING_RE = new RegExp("/market/listings/" + APP + "/([^/?#]+)");
  var DELAY_MS = 4000; // pause between items during a batch harvest (be polite to Steam)

  // ---------- admin key (stored locally in Tampermonkey, only sent to sboxskins.gg) ----------
  function getKey() {
    var k = GM_getValue("sbox_admin_key", "");
    if (!k) {
      k = window.prompt(
        "sboxskins admin key (ANALYTICS_KEY).\nStored only in Tampermonkey on this machine; only ever sent to sboxskins.gg.",
      );
      if (k) GM_setValue("sbox_admin_key", k.trim());
    }
    return (k || "").trim();
  }

  function toast(msg, color) {
    try {
      var d = document.createElement("div");
      d.textContent = msg;
      d.style.cssText =
        "position:fixed;z-index:2147483647;right:16px;bottom:16px;background:" +
        (color || "#6d28d9") +
        ";color:#fff;padding:10px 14px;border-radius:8px;font:600 13px/1.35 Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);max-width:340px";
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 5000);
    } catch (e) { /* page may not be ready */ }
  }

  // ---------- read the nameid the page already rendered (real browser => it's there) ----------
  function readNameid() {
    var s = document.documentElement.innerHTML;
    var k = "Market_LoadOrderSpread(";
    var i = s.indexOf(k);
    if (i < 0) return null;
    var j = s.indexOf(")", i);
    if (j < 0) return null;
    var id = s.slice(i + k.length, j).trim();
    return /^[0-9]+$/.test(id) ? id : null;
  }

  function currentHash() {
    var m = LISTING_RE.exec(location.pathname);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function sendNameid(hash, nameid, cb) {
    var key = getKey();
    if (!key) { toast("No admin key set — cancelled.", "#b91c1c"); if (cb) cb(false); return; }
    GM_xmlhttpRequest({
      method: "POST",
      url: API + "/api/admin/item-nameid",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      data: JSON.stringify({ hash: hash, nameid: nameid }),
      onload: function (r) {
        if (r.status === 401) { GM_setValue("sbox_admin_key", ""); toast("Admin key rejected — cleared; will re-ask.", "#b91c1c"); }
        if (cb) cb(r.status >= 200 && r.status < 300, r);
      },
      onerror: function () { if (cb) cb(false); },
    });
  }

  // ---------- batch harvest queue (sessionStorage survives same-tab navigation) ----------
  function getQ() { try { return JSON.parse(sessionStorage.getItem("sbox_harvest_q") || "null"); } catch (e) { return null; } }
  function setQ(q) { sessionStorage.setItem("sbox_harvest_q", JSON.stringify(q)); }
  function clearQ() { sessionStorage.removeItem("sbox_harvest_q"); }

  function gotoHash(hash) {
    location.href = "https://steamcommunity.com/market/listings/" + APP + "/" + encodeURIComponent(hash);
  }

  function startHarvest() {
    var key = getKey();
    if (!key) return;
    toast("Fetching the missing-nameid list…");
    GM_xmlhttpRequest({
      method: "GET",
      url: API + "/api/admin/items-missing-nameid",
      headers: { Authorization: "Bearer " + key },
      onload: function (r) {
        if (r.status === 401) { GM_setValue("sbox_admin_key", ""); toast("Admin key rejected.", "#b91c1c"); return; }
        var data;
        try { data = JSON.parse(r.responseText); } catch (e) { toast("Bad response from sboxskins.", "#b91c1c"); return; }
        var list = (data.items || []).map(function (it) { return it.steamMarketId; }).filter(Boolean);
        if (!list.length) { toast("Nothing to harvest — every item already has a nameid. 🎉", "#15803d"); return; }
        setQ({ list: list, total: list.length, done: 0 });
        toast("Harvesting " + list.length + " items. This tab will walk through them — don't close it.");
        gotoHash(list[0]);
      },
      onerror: function () { toast("Could not reach sboxskins.", "#b91c1c"); },
    });
  }

  function advance(q) {
    if (q.list.length) { setTimeout(function () { gotoHash(q.list[0]); }, DELAY_MS); }
    else { clearQ(); toast("Harvest complete — " + q.done + " nameids sent. 🎉", "#15803d"); }
  }

  function onListingPage() {
    var hash = currentHash();
    if (!hash) return;
    // Give the page a moment to render the inline Market_LoadOrderSpread() call.
    setTimeout(function () {
      var q = getQ();
      var harvesting = q && q.list && q.list.length && q.list[0] === hash;
      var nameid = readNameid();

      if (harvesting) {
        var finish = function (ok) {
          q.done = (q.done || 0) + 1;
          q.list.shift();
          setQ(q);
          toast("[" + q.done + "/" + q.total + "] " + (ok ? "✓ " : "⚠ ") + hash);
          advance(q);
        };
        if (nameid) sendNameid(hash, nameid, finish);
        else finish(false); // couldn't read it; skip + continue
      } else if (nameid) {
        // passive: seed nameids for items you open while browsing normally
        sendNameid(hash, nameid, function (ok) { if (ok) toast("✓ nameid sent for " + hash, "#15803d"); });
      }
    }, 2500);
  }

  GM_registerMenuCommand("Harvest all missing nameids → sboxskins", startHarvest);
  GM_registerMenuCommand("Reset sboxskins admin key", function () { GM_setValue("sbox_admin_key", ""); toast("Admin key cleared."); });

  if (LISTING_RE.test(location.pathname)) onListingPage();
})();
