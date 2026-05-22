/**
 * Spencer OS — Supabase client bootstrap
 *
 * Fetches Supabase URL + anon key from /api/config (served by serve.py from
 * environment variables — never hardcoded here).
 *
 * Exposes:
 *   window._supa       — the live Supabase client (set after config loads)
 *   window._supaReady  — a Promise that resolves to the client
 */
(function () {
  'use strict';

  if (typeof window.supabase === 'undefined') {
    console.error('[Spencer OS] Supabase SDK not loaded — check CDN script in index.html');
    window._supaReady = Promise.resolve(null);
    return;
  }

  /* ── Fetch config from serve.py, then initialise client ─────────────────── */
  window._supaReady = fetch('/api/config')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (cfg) {
      if (!cfg.supaUrl || !cfg.supaKey) throw new Error('Incomplete config from /api/config');
      var client = window.supabase.createClient(cfg.supaUrl, cfg.supaKey);
      window._supa = client;
      console.log('[Spencer OS] Supabase connected ✓');
      _migrateOnce(client);
      return client;
    })
    .catch(function (err) {
      console.warn('[Spencer OS] Supabase init failed:', err.message,
                   '— running in localStorage-only mode');
      return null;
    });

  /* ── One-time migration: push existing sos_* localStorage keys ───────────
     ignoreDuplicates: true so we never overwrite data from another device.  */
  function _migrateOnce(db) {
    if (localStorage.getItem('_supa_migrated_v1')) return;

    var rows = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || !key.startsWith('sos_')) continue;
      try {
        rows.push({
          key:        key,
          value:      JSON.parse(localStorage.getItem(key)),
          updated_at: new Date().toISOString(),
        });
      } catch (e) { /* skip malformed */ }
    }

    if (rows.length === 0) {
      localStorage.setItem('_supa_migrated_v1', '1');
      return;
    }

    db.from('kv_store')
      .upsert(rows, { onConflict: 'key', ignoreDuplicates: true })
      .then(function (res) {
        if (res.error) {
          console.warn('[Spencer OS] Migration error:', res.error.message);
        } else {
          localStorage.setItem('_supa_migrated_v1', '1');
          console.log('[Spencer OS] Migrated ' + rows.length + ' keys to Supabase ✓');
        }
      });
  }
})();
