/* ═══════════════════════════════════════════════════════════════
   SplitEven — Split Summary Page
   Fetches a shared_receipts document by ?id= param and renders
   the read-only summary UI matching the Android Summary screen.
   Requires: Firebase app-compat + firestore-compat SDKs loaded first.
   Added: 2026-04-26
═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── Environment detection ──────────────────────────────────
       When served from localhost (python3 -m http.server or any
       local server) the page connects to split-even-dev Firestore
       so the dev Android app's share tokens resolve correctly.
       On getspliteven.com the page uses split-even-prod as normal.
       No code change needed when deploying — hostname does the work.
       Added: 2026-04-26
    ───────────────────────────────────────────────────────────── */
    var IS_LOCAL = (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    );

    /*
     * Dev config — split-even-dev Firebase project.
     * The dev project has no web app registered, so appId is omitted.
     * App Check is skipped for localhost; shared_receipts is public read
     * so no token enforcement is applied anyway.
     */
    var DEV_CONFIG = {
        apiKey:            'AIzaSyAuaNSSclg6CRF-7BYohoaIpLQYKZOJrEY',
        authDomain:        'split-even-dev.firebaseapp.com',
        projectId:         'split-even-dev',
        storageBucket:     'split-even-dev.firebasestorage.app',
        messagingSenderId: '247093432780'
    };

    /*
     * Prod config — split-even-prod Firebase project.
     * App Check (reCAPTCHA v3) is activated on prod only.
     */
    var PROD_CONFIG = {
        apiKey:            'AIzaSyAwoD7bU2sduJ1RWHKHvjJRK0BzZ52su-0',
        authDomain:        'split-even-prod.firebaseapp.com',
        projectId:         'split-even-prod',
        storageBucket:     'split-even-prod.firebasestorage.app',
        messagingSenderId: '137123762020',
        appId:             '1:137123762020:web:75b47566ecacccfedeb471'
    };

    var db = null;
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(IS_LOCAL ? DEV_CONFIG : PROD_CONFIG);
            if (!IS_LOCAL) {
                firebase.appCheck().activate(
                    '6LfhLZosAAAAANYRHWQWpd6vmjR4TBd6XKGzhJMs',
                    true
                );
            }
        }
        db = firebase.firestore();
    } catch (e) {
        console.warn('Firebase init failed:', e);
    }

    /* ── Helpers ────────────────────────────────────────────── */

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    function formatCurrency(amount, currency) {
        var sym = currency || '$';
        return sym + Number(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        var date;
        if (timestamp && typeof timestamp.toDate === 'function') {
            date = timestamp.toDate();
        } else if (timestamp && timestamp.seconds) {
            date = new Date(timestamp.seconds * 1000);
        } else {
            date = new Date(timestamp);
        }
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function isExpired(timestamp) {
        if (!timestamp) return false;
        var expMs = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
        return Date.now() > expMs;
    }

    function escapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    /* ── Donut chart ────────────────────────────────────────── */
    function buildDonutChart(splits) {
        if (!splits || splits.length === 0) return;
        var ring = document.getElementById('donutRing');
        if (!ring) return;
        /* Build conic-gradient stops from each person's percentage.
           percentage is 0-100, conic-gradient needs 0-360 degrees. */
        var current = 0;
        var stops = splits.map(function (split) {
            var pct = Math.max(0, Math.min(100, split.percentage || 0));
            var end = current + (pct / 100) * 360;
            var stop = split.friendColor + ' ' + current.toFixed(2) + 'deg ' + end.toFixed(2) + 'deg';
            current = end;
            return stop;
        });
        /* Fill any rounding gap with the last colour */
        if (current < 360) {
            var last = splits[splits.length - 1];
            stops.push((last ? last.friendColor : '#E5E7EB') + ' ' + current.toFixed(2) + 'deg 360deg');
        }
        ring.style.background = 'conic-gradient(' + stops.join(', ') + ')';
    }

    /* ── Legend ─────────────────────────────────────────────── */
    function buildLegend(splits) {
        var legend = document.getElementById('chartLegend');
        if (!legend) return;
        legend.innerHTML = splits.map(function (split) {
            var pct = parseFloat((split.percentage || 0).toFixed(1));
            return '<div class="legend-item">' +
                '<div class="legend-dot" style="background:' + escapeHtml(split.friendColor) + '"></div>' +
                '<span class="legend-name">' + escapeHtml(split.friendName) + '</span>' +
                '<span class="legend-pct">' + pct + '%</span>' +
                '</div>';
        }).join('');
    }

    /* ── Breakdown rows ─────────────────────────────────────── */
    function buildBreakdownRows(splits, currency) {
        var container = document.getElementById('breakdownRows');
        if (!container) return;
        container.innerHTML = splits.map(function (split, index) {
            var itemCount = (split.items || []).length;
            var itemLabel = itemCount === 1 ? 'item' : 'items';
            var pct = parseFloat((split.percentage || 0).toFixed(1));
            var initials = escapeHtml(split.friendInitials || '??');
            var color = escapeHtml(split.friendColor || '#6366F1');
            return '<div class="card breakdown-row" onclick="openPersonBreakdown(' + index + ')" role="button" aria-label="View ' + escapeHtml(split.friendName) + ' breakdown">' +
                '<div class="avatar" style="background:' + color + '">' + initials + '</div>' +
                '<div class="row-info">' +
                    '<div class="row-name">' + escapeHtml(split.friendName) + '</div>' +
                    '<div class="row-items">' + itemCount + ' ' + itemLabel + '</div>' +
                '</div>' +
                '<div class="row-right">' +
                    '<div class="row-amount" style="color:' + color + '">' + formatCurrency(split.total, currency) + '</div>' +
                    '<div class="row-pct">' + pct + '%</div>' +
                '</div>' +
                '<svg class="row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>';
        }).join('');
    }

    /* ── Bill breakdown card HTML ───────────────────────────── */
    function buildBreakdownCardHtml(data, currency) {
        var html = '<div class="breakdown-card">';

        /* Items Subtotal */
        var itemsSubtotal = data.subtotal || data.itemsTotal || 0;
        html += breakdownLineHtml('Items Subtotal', formatCurrency(itemsSubtotal, currency), false);

        /* Tax & Charges — parent line with combined total, + prefix */
        var tax           = data.tax           || 0;
        var tip           = data.tip           || 0;
        var serviceCharge = data.serviceCharge || 0;
        var discount      = data.discount      || 0;
        var taxAndCharges = tax + tip + serviceCharge;
        html += breakdownLineHtml('Tax & Charges', '+ ' + formatCurrency(taxAndCharges, currency), false);

        /* Sub-items — always shown even when $0.00, indented */
        html += breakdownSubLineHtml('Tax',            formatCurrency(tax,           currency));
        html += breakdownSubLineHtml('Tip',            formatCurrency(tip,           currency));
        html += breakdownSubLineHtml('Service Charge', formatCurrency(serviceCharge, currency));

        /* Discount — only when > 0, shown in green with − prefix */
        if (discount > 0) {
            html += breakdownLineHtml('Discount', '- ' + formatCurrency(discount, currency), true);
        }

        html += '<hr class="breakdown-divider">';
        html += '<div class="breakdown-line total-line"><span class="label">Total Amount</span><span class="value">' + formatCurrency(data.total, currency) + '</span></div>';
        html += '</div>';
        return html;
    }

    function breakdownLineHtml(label, value, isDiscount) {
        var cls = isDiscount ? ' discount' : '';
        return '<div class="breakdown-line' + cls + '"><span class="label">' + escapeHtml(label) + '</span><span class="value">' + value + '</span></div>';
    }

    function breakdownSubLineHtml(label, value) {
        return '<div class="breakdown-sub-line"><span class="sub-label">' + escapeHtml(label) + '</span><span class="sub-value">' + value + '</span></div>';
    }

    /* ── Items list HTML ────────────────────────────────────── */
    function buildItemListHtml(items, currency, showQty) {
        if (!items || items.length === 0) return '';
        var rows = items.map(function (item) {
            var qtyHtml = (showQty && item.quantity && item.quantity !== 1)
                ? '<span class="item-row-qty">×' + Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 1) + '</span>'
                : '';
            return '<div class="item-row">' +
                '<span class="item-row-name">' + escapeHtml(item.name) + qtyHtml + '</span>' +
                '<span class="item-row-price">' + formatCurrency(item.lineTotal || item.splitPrice, currency) + '</span>' +
                '</div>';
        }).join('');
        return '<div class="item-list">' + rows + '</div>';
    }

    /* ── Total breakdown modal ──────────────────────────────── */
    var _data = null;

    window.openTotalBreakdown = function () {
        if (!_data) return;
        var currency = _data.currency;
        var body = '';

        /* Items list */
        if (_data.receiptItems && _data.receiptItems.length > 0) {
            body += '<p class="sheet-section-label">Item Summary (' + _data.receiptItems.length + ')</p>';
            body += buildItemListHtml(_data.receiptItems, currency, true);
        }

        /* Bill breakdown */
        body += '<p class="sheet-section-label" style="margin-top:12px">Bill Breakdown</p>';
        body += buildBreakdownCardHtml(_data, currency);

        /* Header — stacked layout: title on one line, amount below in primary colour */
        var header = document.querySelector('#totalModal .sheet-header');
        header.classList.add('sheet-header--stacked');
        document.getElementById('totalSheetAvatar').style.display = 'none';
        document.getElementById('totalSheetTitle').textContent = 'Total Amount';
        var amountEl = document.getElementById('totalSheetAmount');
        amountEl.textContent = formatCurrency(_data.total, currency);
        amountEl.style.color = '#6366F1'; /* --primary */
        amountEl.style.fontSize = '1.35rem';

        document.getElementById('totalSheetBody').innerHTML = body;
        document.getElementById('totalModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    /* ── Per-person breakdown modal ─────────────────────────── */
    window.openPersonBreakdown = function (index) {
        if (!_data) return;
        var split = _data.splits[index];
        if (!split) return;
        var currency = _data.currency;
        var body = '';

        /* Items list */
        var itemCount = (split.items || []).length;
        if (itemCount > 0) {
            body += '<p class="sheet-section-label">Item Summary (' + itemCount + ')</p>';
            body += buildItemListHtml(split.items, currency, false);
        }

        /* Charges breakdown */
        body += '<p class="sheet-section-label" style="margin-top:12px">Bill Breakdown</p>';
        body += buildBreakdownCardHtml({
            subtotal:          split.itemsTotal,
            tax:               split.taxShare,
            tip:               split.tipShare,
            serviceCharge:     split.serviceChargeShare,
            discount:          split.discountShare,
            total:             split.total
        }, currency);

        /* Header — avatar left, name + amount stacked in middle, X right */
        var personHeader = document.querySelector('#personModal .sheet-header');
        personHeader.className = 'sheet-header'; /* reset any stale classes */
        personHeader.innerHTML =
            '<div class="person-header-avatar" style="background:' + escapeHtml(split.friendColor) + '">' +
                escapeHtml(split.friendInitials || '??') +
            '</div>' +
            '<div class="person-header-info">' +
                '<div class="person-header-name">' + escapeHtml(split.friendName) + '</div>' +
                '<div class="person-header-amount" style="color:' + escapeHtml(split.friendColor) + '">' +
                    formatCurrency(split.total, currency) +
                '</div>' +
            '</div>' +
            '<button class="sheet-close" onclick="closeModal(\'personModal\')" aria-label="Close">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
                    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
                '</svg>' +
            '</button>';

        document.getElementById('personSheetBody').innerHTML = body;
        document.getElementById('personModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    /* ── Receipt image fullscreen ───────────────────────────── */
    window.openReceiptImage = function () {
        if (!_data || !_data.imageUrl) return;
        document.getElementById('receiptFullImg').src = _data.imageUrl;
        document.getElementById('receiptImageOverlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    /* ── Close helpers ──────────────────────────────────────── */
    window.closeModal = function (id) {
        document.getElementById(id).classList.remove('active');
        /* Only restore scroll if no other modals are open */
        var anyOpen = document.querySelector('.modal-overlay.active, .receipt-overlay.active');
        if (!anyOpen) document.body.style.overflow = '';
    };

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            ['totalModal', 'personModal'].forEach(function (id) {
                document.getElementById(id).classList.remove('active');
            });
            document.getElementById('receiptImageOverlay').classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    /* ── State helpers ──────────────────────────────────────── */
    function showLoading() {
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('summaryContent').style.display = 'none';
    }

    function showError(expired) {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('summaryContent').style.display = 'none';
        var el = document.getElementById('errorState');
        el.style.display = 'block';
        document.getElementById('errorTitle').textContent = expired
            ? 'This link has expired'
            : 'Split summary not found';
        document.getElementById('errorMsg').textContent = expired
            ? 'Share links are valid for 30 days. Ask the person who shared this to generate a new link from the SplitEven app.'
            : 'This link may be invalid or the split may have been removed.';
    }

    function showSummary(data) {
        _data = data;
        var currency = data.currency || '$';
        var splits   = data.splits  || [];

        /* Page title */
        document.title = escapeHtml(data.merchantName) + ' – Split Summary | SplitEven';

        /* Merchant card */
        document.getElementById('merchantName').textContent = data.merchantName || 'Unknown';
        document.getElementById('merchantDate').textContent = formatDate(data.date);
        var addrEl = document.getElementById('merchantAddress');
        if (data.merchantAddress) {
            addrEl.textContent = data.merchantAddress;
            addrEl.style.display = 'block';
        } else {
            addrEl.style.display = 'none';
        }

        /* Total card */
        document.getElementById('totalAmount').textContent = formatCurrency(data.total, currency);

        /* Donut chart */
        var chartSection = document.getElementById('chartSection');
        if (splits.length > 0) {
            buildDonutChart(splits);
            buildLegend(splits);
            document.getElementById('donutTotal').textContent = formatCurrency(data.total, currency);
            /* Purple person icon + count, matching the Android app donut center */
            document.getElementById('donutCount').innerHTML =
                '<svg width="10" height="10" viewBox="0 0 24 24" fill="#6366F1"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>' +
                '<span>' + splits.length + '</span>';
            chartSection.style.display = 'block';
        } else {
            chartSection.style.display = 'none';
        }

        /* Breakdown rows */
        var breakdownSection = document.getElementById('breakdownSection');
        if (splits.length > 0) {
            buildBreakdownRows(splits, currency);
            breakdownSection.style.display = 'block';
        } else {
            breakdownSection.style.display = 'none';
        }

        /* Receipt image */
        var receiptSection = document.getElementById('receiptSection');
        if (data.imageUrl) {
            document.getElementById('receiptThumb').src = data.imageUrl;
            receiptSection.style.display = 'block';
        } else {
            receiptSection.style.display = 'none';
        }

        /* Show */
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('summaryContent').style.display = 'block';
    }

    /* ── Main fetch ─────────────────────────────────────────── */
    function fetchSplit(shareToken) {
        if (!db) {
            showError(false);
            return;
        }
        db.collection('shared_receipts').doc(shareToken).get()
            .then(function (doc) {
                if (!doc.exists) {
                    showError(false);
                    return;
                }
                var data = doc.data();
                if (isExpired(data.expiresAt)) {
                    showError(true);
                    return;
                }
                showSummary(data);
            })
            .catch(function (err) {
                console.error('Error fetching split:', err);
                showError(false);
            });
    }

    /* ── Initialise ─────────────────────────────────────────── */
    var shareToken = getQueryParam('id');
    if (!shareToken || shareToken.trim() === '') {
        showError(false);
    } else {
        showLoading();
        fetchSplit(shareToken.trim());
    }

}());
