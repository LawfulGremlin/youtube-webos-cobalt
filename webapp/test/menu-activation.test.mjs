import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Run the actual checkbox and document key handler with a small DOM fixture.
// No YouTube runtime is needed to reproduce duplicate remote-control input.
function setup() {
  const elements = new Map();
  const writes = [];
  const renders = [];
  let now = 1000;
  let focused;
  function element() {
    const attributes = new Map();
    return {
      dataset: {},
      listeners: {},
      classList: { add() {}, remove() {} },
      appendChild(child) { child.parentElement = this; },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      setAttribute(key, value) {
        attributes.set(key, value);
        if (key === 'id') { this.id = value; elements.set('#' + value, this); }
        if (key === 'tabindex') this.tabIndex = value;
      },
      hasAttribute(key) { return attributes.has(key); },
      removeAttribute(key) { attributes.delete(key); }
    };
  }
  const context = vm.createContext({
    document: {
      createElement: element,
      querySelector: (selector) => selector === ':focus' ? focused : elements.get(selector)
    },
    Date: { now: () => now },
    isContainerOpen: () => true,
    menuHasFocus: () => true,
    getDirectionFromEvent: () => null,
    isGreenKey: () => false,
    getPlaybackRateShortcut: () => 0,
    save(blocked) {
      writes.push(!blocked);
      renders.push(blocked ? ['Home', 'Subscriptions'] : ['Home', 'Shorts', 'Subscriptions']);
    }
  });
  const checkboxSource = readFileSync(new URL('../src/checkboxTools.js', import.meta.url), 'utf8');
  vm.runInContext(checkboxSource.replace("import './checkboxTools.css';", '').replace('export const', 'const'), context);
  vm.runInContext("checkboxTools.add('__shorts', 'Shorts blockieren', false, save);", context);
  focused = elements.get('#__shorts');
  const uiSource = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const start = uiSource.indexOf('  const eventHandler = (evt) => {');
  const end = uiSource.indexOf('\n  // Red, Green, Yellow, Blue', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext('let heldActivationControl = null;\n' + uiSource.slice(start, end), context);
  function event(type, extra = {}) {
    return { type, key: 'Enter', keyCode: 13, repeat: false,
      preventDefault() {}, stopPropagation() {}, ...extra };
  }
  return {
    writes, renders,
    checked: () => focused.hasAttribute('checked'),
    advance: (ms) => { now += ms; },
    key(type, extra) {
      context.input = event(type, extra);
      vm.runInContext('eventHandler(input)', context);
    },
    click() { focused.parentElement.listeners.click(event('click')); }
  };
}

test('one remote press blocks Shorts despite repeated keydowns without repeat flag', () => {
  const menu = setup();
  menu.key('keydown');
  menu.key('keydown');
  menu.key('keydown', { repeat: true });
  menu.key('keypress');
  menu.key('keyup');
  assert.deepEqual(menu.writes, [false]);
  assert.deepEqual(menu.renders, [['Home', 'Subscriptions']]);
  assert.equal(menu.checked(), true);

  menu.key('keydown');
  menu.key('keyup');
  assert.deepEqual(menu.writes, [false, true]);
  assert.equal(menu.checked(), false);
});

test('all synthesized clicks after a held OK press are ignored', () => {
  const menu = setup();
  menu.key('keydown');
  menu.advance(1500);
  menu.key('keyup');
  menu.click();
  menu.click();
  assert.deepEqual(menu.writes, [false]);
  assert.equal(menu.checked(), true);

  menu.advance(1001);
  menu.click();
  assert.deepEqual(menu.writes, [false, true]);
});

test('Space follows the same press/release behavior', () => {
  const menu = setup();
  const space = { key: ' ', keyCode: 32, code: 'Space' };
  menu.key('keydown', space);
  menu.key('keydown', space);
  menu.key('keyup', space);
  assert.deepEqual(menu.writes, [false]);
});
