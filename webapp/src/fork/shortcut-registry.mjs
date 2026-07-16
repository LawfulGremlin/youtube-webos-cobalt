// Fork-owned shortcut-key registry, modeled on LawfulGremlin/youtube-webos
// src/fork-extensions/shortcut-registry.js (same registerShortcutAction API,
// so features port across the two forks unchanged). The Cobalt base has no
// shortcut system of its own, so this adds the missing half: bindable
// physical-key SLOTS (remote color buttons — green is the settings menu —
// and number keys 0-9) whose per-slot action binding lives in config under
// `forkShortcut_<slot.id>`.
//
// Pure core — no DOM, no config imports — so `node webapp/src/fork/test.mjs`
// covers it. Key wiring and the settings-menu binding rows live in index.js.
// Future fork features should register an action here instead of installing
// their own key listeners.

export const SLOTS = (function () {
  const slots = [
    { id: 'red', label: 'Red Button', keyCodes: [403] },
    { id: 'yellow', label: 'Yellow Button', keyCodes: [405, 170] },
    { id: 'blue', label: 'Blue Button', keyCodes: [406, 191] }
  ];
  for (let n = 0; n <= 9; n++) {
    slots.push({
      id: 'key_' + n,
      label: 'Key ' + n,
      keyCodes: [48 + n, 96 + n] // top row + numeric keypad variants
    });
  }
  return slots;
})();

const actionOrder = ['none'];
const actions = {
  none: { key: 'none', label: 'None', scope: 'GLOBAL', handler: null, burst: false }
};

export function registerShortcutAction(spec) {
  if (!spec || !spec.key || typeof spec.handler !== 'function') {
    throw new Error('registerShortcutAction: key and handler are required');
  }
  if (actions[spec.key]) {
    throw new Error('registerShortcutAction: duplicate action ' + spec.key);
  }
  actions[spec.key] = {
    key: spec.key,
    label: spec.label || spec.key,
    scope: spec.scope || 'VIDEO',
    handler: spec.handler,
    burst: Boolean(spec.burst)
  };
  actionOrder.push(spec.key);
}

export function getAction(key) {
  return actions[key] || null;
}

export function slotForKeyCode(keyCode) {
  for (let i = 0; i < SLOTS.length; i++) {
    if (SLOTS[i].keyCodes.indexOf(keyCode) !== -1) return SLOTS[i];
  }
  return null;
}

// Cycles through registered actions in registration order ('none' first).
// Unknown/stale bindings are treated as 'none' so cycling always recovers.
export function cycleActionKey(current, delta) {
  const idx = actionOrder.indexOf(current);
  const from = idx === -1 ? 0 : idx;
  return actionOrder[(from + delta + actionOrder.length) % actionOrder.length];
}
