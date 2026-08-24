chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCOUT_ACTIVE_LISTING") return false;
  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab?.id) throw new Error("Aucun onglet actif");
    return chrome.tabs.sendMessage(tab.id, { type: "SCOUT_EXTRACT_LISTING" });
  }).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});
