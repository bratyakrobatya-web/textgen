// HH TextGen — Floating "+" button for text selection capture
(() => {
    let host = null;   // Shadow DOM host element
    let shadow = null; // Shadow root
    let btn = null;    // The floating button
    let hideTimer = null;

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
        document.documentElement.appendChild(host);
    }

    function showAt(x, y, text) {
        if (!host) createButton();
        clearTimeout(hideTimer);

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
            chrome.runtime.sendMessage({ type: 'ADD_SELECTION', text });

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

    // --- Event listeners ---

    document.addEventListener('mouseup', (e) => {
        // Ignore clicks on our own button
        if (e.target === host || host?.contains(e.target)) return;

        // Small delay to let browser finalize selection
        setTimeout(() => {
            const sel = window.getSelection();
            const text = (sel?.toString() || '').trim();
            if (text.length >= 10) {
                // Get position from selection range end
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showAt(rect.right, rect.top, text);
            } else {
                hide();
            }
        }, 10);
    });

    // Hide on scroll or Escape
    document.addEventListener('scroll', () => hide(), { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    // Hide if clicking elsewhere (not on the button)
    document.addEventListener('mousedown', (e) => {
        if (host && !host.contains(e.target) && btn?.classList.contains('show')) {
            // Don't hide immediately — mouseup handler will decide
        }
    });
})();
