import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as filters from '../src/shorts-response-filter.mjs';

const source = readFileSync(new URL('../src/adblock-preload.js', import.meta.url), 'utf8');

test('class constructor call site discovers J without invoking the constructor', () => {
  let enabled = true;
  const context = vm.createContext({
    ...filters,
    configRead: () => enabled,
    window: {},
    console: { info() {}, log() {}, warn() {}, error() {} }
  });
  vm.runInContext(`
    class VUb {
      constructor(response) { this.J({guideResponse: response}); }
    }
    const app = {
      Z: VUb,
      calls: 0,
      J(state) { this.calls++; this.state = state; }
    };
    const document = {querySelector() {return {__instance: app};}};
  `, context);
  vm.runInContext(source.slice(source.indexOf('if (!window.__ytafPreloadExecuted)')), context);
  context.responseJson = JSON.stringify({
    items: [{ guideSectionRenderer: { items: [
      { guideEntryRenderer: { icon: { iconType: 'WHAT_TO_WATCH' } } },
      { guideEntryRenderer: { icon: { iconType: 'YOUTUBE_SHORTS_FILL_24' } } }
    ] } }]
  });
  vm.runInContext('JSON.parse(responseJson)', context);
  for (const allowShorts of [false, true, false]) {
    enabled = allowShorts;
    assert.equal(vm.runInContext('window.__ytafApplyShortsState()', context), 'success:Z->J');
    assert.equal(vm.runInContext('app.state.guideResponse.items[0].guideSectionRenderer.items.length', context), allowShorts ? 2 : 1);
  }
  assert.equal(vm.runInContext('app.calls', context), 3);
});

for (const failInCaller of [true, false]) {
  test(`guide failure reports target exception even when caller would throw: ${failInCaller}`, () => {
    const logs = [];
    const context = vm.createContext({
      ...filters,
      configRead: () => false,
      window: {},
      console: { info() {}, log() {}, warn() {}, error: (...args) => logs.push(args) },
      failInCaller
    });
    vm.runInContext(`
      const app = {
        Z(response) {
          if (failInCaller) throw new Error('missing caller context');
          this.J({guideResponse: response});
        },
        J(state) { throw new Error('missing renderer context'); }
      };
      const document = {querySelector() {return {__instance: app};}};
    `, context);
    vm.runInContext(source.slice(source.indexOf('if (!window.__ytafPreloadExecuted)')), context);
    vm.runInContext('JSON.parse(\'{"items":[{"guideSectionRenderer":{"items":[]}}]}\')', context);
    const result = vm.runInContext('window.__ytafApplyShortsState()', context);
    assert.equal(result, 'handler-threw:Z->J');
    assert.ok(logs.some(([, error]) => error?.message === 'missing renderer context'));
  });
}
