(() => {
  const ORIGIN = "https://collection.cardvaults.app";

  function post(type, detail = {}) {
    window.postMessage({ source: "cardvaults-extension", type, ...detail }, ORIGIN);
  }

  // Sélection de cartes envoyée depuis la Collection (« Vendre → Vinted ») :
  // le panneau de l'extension l'affiche dans l'onglet « Publier sur Vinted ».
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== ORIGIN) return;
    const message = event.data;
    if (!message || message.source !== "cardvaults-app" || message.type !== "VINTED_QUEUE_SET") return;
    chrome.runtime.sendMessage({ type: "VINTED_QUEUE_SET", cardIds: message.cardIds })
      .then((response) => {
        if (response?.error) post("VINTED_QUEUE_SET_ERROR", { error: response.error });
        else post("VINTED_QUEUE_SET_ACCEPTED", { count: response?.count ?? 0 });
      })
      .catch((error) => post("VINTED_QUEUE_SET_ERROR", { error: error.message }));
  });

  post("VINTED_BRIDGE_READY", { version: chrome.runtime.getManifest().version });
})();
