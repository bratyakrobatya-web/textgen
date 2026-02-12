// Open side panel on extension icon click (instead of popup/tab)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Track which tabs have content script injected
const injectedTabs = new Set();

// Inject content script into a tab (content.js is idempotent — safe to re-inject)
async function injectIntoTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) return;
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
        });
        injectedTabs.add(tabId);
    } catch (_) {}
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidepanel') return;

    // Inject into currently active tab
    (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await injectIntoTab(tab.id);
    })();

    // Re-inject when user switches tabs
    const onActivated = (info) => {
        if (!injectedTabs.has(info.tabId)) {
            injectIntoTab(info.tabId);
        }
    };
    chrome.tabs.onActivated.addListener(onActivated);

    // Re-inject when page navigates (content script is destroyed on navigation)
    const onUpdated = (tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && injectedTabs.has(tabId)) {
            injectedTabs.delete(tabId);
            injectIntoTab(tabId);
        }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    // When side panel closes — tell injected tabs to deactivate
    port.onDisconnect.addListener(() => {
        chrome.tabs.onActivated.removeListener(onActivated);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        for (const tabId of injectedTabs) {
            chrome.tabs.sendMessage(tabId, { type: 'DEACTIVATE_FAB' }).catch(() => {});
        }
        injectedTabs.clear();
    });
});

// Forward ADD_SELECTION messages from content script to side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'ADD_SELECTION') {
        return false; // Let the message propagate naturally
    }
});
