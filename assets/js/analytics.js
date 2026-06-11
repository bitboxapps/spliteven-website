/* ═══════════════════════════════════════════════════════════════
   SplitEven — Google Analytics 4 (GA4) tracking
   Property : SplitEven Website (separate from Firebase / mobile)
   Measurement ID : G-MQ4SSX7V8P
   Added : 2026-06-11

   Tracks:
     • page_view  — fired automatically on every page load
     • store_click — fired when a user clicks a store CTA button
         params:  store = 'google_play' | 'app_store'
═══════════════════════════════════════════════════════════════ */

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-MQ4SSX7V8P');

/**
 * logStoreClick — call this from onclick on every store button.
 * @param {string} store  'google_play' or 'app_store'
 */
function logStoreClick(store) {
    gtag('event', 'store_click', {
        store: store
    });
}
