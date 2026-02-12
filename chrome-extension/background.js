// Open side panel on extension icon click (instead of popup/tab)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Panel state survives service worker restarts (session storage resets on browser quit)
async function isPanelOpen() {
    const { panelOpen } = await chrome.storage.session.get('panelOpen');
    return !!panelOpen;
}

// Inject content script into a tab (content.js is idempotent — safe to re-inject)
async function injectIntoTab(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
        });
    } catch (e) {
        // Expected for chrome://, chrome-extension://, web store, etc.
        if (!e.message?.includes('Cannot access')) {
            console.warn('TextGen inject failed:', tabId, e.message);
        }
    }
}

// Deactivate FAB in all tabs
async function deactivateAll() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'DEACTIVATE_FAB' }).catch(() => {});
    }
}

// --- Top-level listeners (survive service worker restarts) ---

// When user switches tabs — inject if panel is open
chrome.tabs.onActivated.addListener(async (info) => {
    if (await isPanelOpen()) {
        injectIntoTab(info.tabId);
    }
});

// When page navigates — re-inject (content script is destroyed on navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && await isPanelOpen()) {
        injectIntoTab(tabId);
    }
});

// Side panel connects — mark open, inject into active tab
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidepanel') return;

    chrome.storage.session.set({ panelOpen: true });

    // Inject into currently active tab
    (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await injectIntoTab(tab.id);
    })();

    // When side panel closes — deactivate FAB everywhere
    port.onDisconnect.addListener(() => {
        chrome.storage.session.set({ panelOpen: false });
        deactivateAll();
    });
});
