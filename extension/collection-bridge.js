(() => {
  const ORIGIN = "https://collection.cardvaults.app";

  function post(type, detail = {}) {
    window.postMessage({ source: "cardvaults-extension", type, ...detail }, ORIGIN);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== ORIGIN) return;
    const message = event.data;
    if (!message || message.source !== "cardvaults-app" || message.type !== "VINTED_QUEUE_DRAFT") return;
    chrome.runtime.sendMessage({ type: "VINTED_QUEUE_DRAFT", draft: message.draft })
      .then((response) => {
        if (response?.error) post("VINTED_QUEUE_ERROR", { cardId: message.draft?.cardId, error: response.error });
        else post("VINTED_QUEUE_ACCEPTED", { cardId: message.draft?.cardId });
      })
      .catch((error) => post("VINTED_QUEUE_ERROR", { cardId: message.draft?.cardId, error: error.message }));
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "VINTED_QUEUE_EVENT") post(message.eventType, message.detail || {});
  });

  post("VINTED_BRIDGE_READY");
})();
