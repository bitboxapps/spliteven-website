/* ═══════════════════════════════════════════════════════════════
   SplitEven — iOS Waitlist Modal
   Single source of truth for all pages (index.html, blog pages).
   Requires: Firebase app-compat + firestore-compat SDKs loaded first.
═══════════════════════════════════════════════════════════════ */

// ── Firebase init ────────────────────────────────────────────────
var db = null;
(function () {
    var firebaseConfig = {
        apiKey:            "AIzaSyAwoD7bU2sduJ1RWHKHvjJRK0BzZ52su-0",
        authDomain:        "split-even-prod.firebaseapp.com",
        projectId:         "split-even-prod",
        storageBucket:     "split-even-prod.firebasestorage.app",
        messagingSenderId: "137123762020",
        appId:             "1:137123762020:web:75b47566ecacccfedeb471"
    };
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
    } catch (e) {
        console.warn('Firebase not configured — waitlist submissions will be skipped.');
    }
})();

// ── Modal controls ───────────────────────────────────────────────
function openWaitlistModal(e) {
    if (e) e.preventDefault();
    document.getElementById('waitlistModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
        var el = document.getElementById('modalEmail');
        if (el) el.focus();
    }, 280);
}

function closeWaitlistModal() {
    document.getElementById('waitlistModal').classList.remove('active');
    document.body.style.overflow = '';
}

function handleModalOverlayClick(e) {
    if (e.target === document.getElementById('waitlistModal')) {
        closeWaitlistModal();
    }
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeWaitlistModal();
});

// ── Form submission ──────────────────────────────────────────────
// Handles both 'modal' (all pages) and 'section' (index.html only)
async function handleWaitlistSubmit(e, source) {
    e.preventDefault();

    var isSection = (source === 'section');
    var emailEl   = document.getElementById(isSection ? 'sectionEmail'        : 'modalEmail');
    var betaEl    = document.getElementById(isSection ? 'sectionBeta'         : 'modalBeta');
    var btnEl     = document.getElementById(isSection ? 'sectionSubmitBtn'    : 'modalSubmitBtn');
    var formEl    = document.getElementById(isSection ? 'waitlistSectionForm' : 'modalFormWrapper');
    var successEl = document.getElementById(isSection ? 'waitlistSectionSuccess' : 'modalSuccess');

    var email = emailEl.value.trim();
    var beta  = betaEl.checked;
    if (!email) return;

    btnEl.disabled    = true;
    btnEl.textContent = 'Joining...';

    try {
        if (db) {
            await db.collection('ios_waitlist').add({
                email:      email,
                betaTester: beta,
                source:     source,
                createdAt:  firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        formEl.style.display = 'none';
        successEl.classList.add('show');
    } catch (err) {
        console.error('Waitlist submission error:', err);
        btnEl.disabled    = false;
        btnEl.textContent = isSection ? 'Join the iOS Waitlist →' : 'Get Notified for iOS →';
        alert('Something went wrong. Please try again.');
    }
}

// ── Auto-open via #open-waitlist hash ────────────────────────────
// (This script sits at end of <body> so DOM is already ready)
if (window.location.hash === '#open-waitlist') {
    openWaitlistModal(null);
    if (history.replaceState) history.replaceState(null, '', window.location.pathname);
}
