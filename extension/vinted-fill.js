/*
 * Saisie du prix dans le formulaire Vinted, comme le ferait une personne.
 *
 * Le champ de Vinted est un champ « masqué » : selon les versions il refuse
 * le point, reformate en « 7,50 € », ou garde son état interne si on change
 * sa valeur directement. On vide donc le champ puis on tape le texte
 * (execCommand insertText, qui déclenche les mêmes événements qu'un clavier),
 * en commençant par le format français, et on vérifie ce qui reste affiché.
 *
 * Chargé avant content.js (manifest) ; testé dans test-vinted-fill.html.
 */
(function (root) {
  /** « 7.5 » → ["7,50", "7,5", "7.50", "7.5"] ; « 20 » → ["20", "20,00", "20.00"]. */
  function priceCandidates(value) {
    const n = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return [];
    const fixed = n.toFixed(2);
    const out = Number.isInteger(n)
      ? [String(n), fixed.replace(".", ","), fixed]
      : [fixed.replace(".", ","), String(n).replace(".", ","), fixed, String(n)];
    return [...new Set(out)];
  }

  /** Prix lu dans le champ (« 7,50 € », « 7.5 », « 1 200 ») ou null. */
  function readPrice(element) {
    if (element.type === "number" && Number.isFinite(element.valueAsNumber)) return element.valueAsNumber;
    let text = String(element.value ?? "").trim().replace(/[\s  ]/g, "").replace(/[^\d,.-]/g, "");
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? "," : ".";
      text = text.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, ".");
    } else {
      text = text.replace(",", ".");
    }
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function nativeSet(element, text) {
    const proto = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(element, text);
    else element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function selectAll(element) {
    element.focus();
    try { element.select(); } catch { /* champ sans sélection */ }
    try { document.execCommand("selectAll", false); } catch { /* no-op */ }
  }

  /**
   * Un clavier envoie « beforeinput » avant de modifier le champ ; Chrome ne
   * l'envoie pas pour execCommand. On l'émet donc nous-mêmes : si le champ le
   * traite et l'annule (il insère lui-même), on n'insère pas une seconde fois.
   */
  function beforeInput(element, inputType, data = null) {
    const event = new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true, composed: true });
    return element.dispatchEvent(event);
  }

  /** Vide puis tape le texte ; repli sur l'affectation directe si le navigateur refuse. */
  function typeText(element, text) {
    selectAll(element);
    if (!beforeInput(element, "insertText", text)) {
      element.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
      return;
    }
    let typed = false;
    try { typed = document.execCommand("insertText", false, text); } catch { typed = false; }
    if (!typed || element.value === "") nativeSet(element, text);
  }

  function clear(element) {
    selectAll(element);
    if (!beforeInput(element, "deleteContentBackward")) {
      element.dispatchEvent(new InputEvent("input", { inputType: "deleteContentBackward", bubbles: true }));
      return;
    }
    let removed = false;
    try { removed = document.execCommand("delete", false); } catch { removed = false; }
    if (!removed || element.value !== "") nativeSet(element, "");
  }

  /**
   * Tape le prix dans `element` et vérifie la valeur affichée.
   * Renvoie le texte accepté, ou null si aucun format n'a tenu.
   */
  async function setPrice(element, value, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
    const expected = Number(String(value ?? "").replace(",", "."));
    for (const candidate of priceCandidates(value)) {
      clear(element);
      typeText(element, candidate);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
      element.dispatchEvent(new Event("blur", { bubbles: false }));
      await wait(150);
      const shown = readPrice(element);
      if (shown !== null && Math.abs(shown - expected) < 0.001) return candidate;
    }
    return null;
  }

  root.CVVintedFill = { priceCandidates, readPrice, setPrice };
})(typeof globalThis !== "undefined" ? globalThis : self);
