// HH TextGen — Floating "+" button for text selection capture
// Idempotent: safe to re-inject — cleans up previous instance first
if (window.__hhTextGenFabCleanup) {
    window.__hhTextGenFabCleanup();
}
window.__hhTextGenFabActive = true;
(() => {
    let host = null;   // Shadow DOM host element
    let shadow = null; // Shadow root
    let btn = null;    // The floating button
    let active = true;
    const ac = new AbortController(); // For document listener cleanup

    function createButton() {
        host = document.createElement('hh-textgen-fab');
        host.style.cssText = 'position:absolute;z-index:2147483647;pointer-events:none;';
        shadow = host.attachShadow({ mode: 'closed' });

        shadow.innerHTML = `
            <style>
                .fab{
                    pointer-events:auto;
                    display:flex;align-items:center;justify-content:center;
                    width:28px;height:28px;
                    background:#1a1a2e;border:1px solid rgba(46,198,209,0.5);
                    border-radius:50%;cursor:pointer;
                    box-shadow:0 2px 8px rgba(0,0,0,0.3);
                    transition:transform 0.15s ease,opacity 0.15s ease,background 0.15s ease;
                    opacity:0;transform:scale(0.6);
                }
                .fab.show{opacity:1;transform:scale(1)}
                .fab:hover{background:#2ec8d1;border-color:#2ec8d1;transform:scale(1.15)!important}
                .fab:active{transform:scale(0.95)!important}
                .fab svg{width:14px;height:14px;fill:none;stroke:#2ec8d1;stroke-width:2.5;stroke-linecap:round}
                .fab:hover svg{stroke:#fff}
                .fab.ok{background:#22c55e;border-color:#22c55e}
                .fab.ok svg{stroke:#fff}
            </style>
            <div class="fab">
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
        `;
        btn = shadow.querySelector('.fab');

        // Prevent mousedown on button from clearing page selection
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.documentElement.appendChild(host);
    }

    function showAt(x, y, text) {
        if (!active) return;
        if (!host) createButton();

        // Position near cursor, offset slightly up-right
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        host.style.left = (x + scrollX + 8) + 'px';
        host.style.top = (y + scrollY - 36) + 'px';

        // Animate in
        requestAnimationFrame(() => btn.classList.add('show'));

        // Click handler (replace each time to capture fresh text)
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                chrome.runtime.sendMessage({ type: 'ADD_SELECTION', text });
            } catch (_) {
                // Extension context invalidated (extension was updated) — show reload hint
                btn.style.background = '#dc2626';
                btn.style.borderColor = '#dc2626';
                const svg = btn.querySelector('svg');
                svg.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
                setTimeout(() => { hide(); cleanup(); }, 1500);
                return;
            }

            // Success feedback
            btn.classList.add('ok');
            const svg = btn.querySelector('svg');
            svg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
            setTimeout(() => {
                hide();
                // Restore "+" icon
                svg.innerHTML = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
                btn.classList.remove('ok');
            }, 600);
        };
    }

    function hide() {
        if (!btn) return;
        btn.classList.remove('show');
    }

    function cleanup() {
        active = false;
        hide();
        ac.abort(); // Remove all document event listeners
        chrome.runtime.onMessage.removeListener(onMessage);
        if (host) { host.remove(); host = null; shadow = null; btn = null; }
        window.__hhTextGenFabActive = false;
        window.__hhTextGenFabCleanup = null;
    }

    // Expose cleanup for idempotent re-injection
    window.__hhTextGenFabCleanup = cleanup;

    // Listen for deactivation from background (named fn for removal)
    function onMessage(msg) {
        if (msg?.type === 'DEACTIVATE_FAB') cleanup();
    }
    chrome.runtime.onMessage.addListener(onMessage);

    // --- Event listeners (all use AbortController signal for cleanup) ---

    document.addEventListener('mouseup', (e) => {
        if (!active) return;
        // Ignore clicks on our own button
        if (e.target === host || host?.contains(e.target)) return;

        // Capture mouse position immediately (before async delay)
        const mx = e.clientX, my = e.clientY;

        // Small delay to let browser finalize selection
        setTimeout(() => {
            if (!active) return;
            const sel = window.getSelection();
            const text = (sel?.toString() || '').trim();
            if (text.length >= 10) {
                showAt(mx, my, text);
            } else {
                hide();
            }
        }, 10);
    }, { signal: ac.signal });

    document.addEventListener('scroll', () => hide(), { passive: true, signal: ac.signal });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, { signal: ac.signal });

})();
