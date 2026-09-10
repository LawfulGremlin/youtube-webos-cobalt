import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as filters from '../src/shorts-response-filter.mjs';

const source = readFileSync(new URL('../src/adblock-preload.js', import.meta.url), 'utf8');

for (const failInCaller of [true, false]) {
  test(`guide failure reports the exception from ${failInCaller ? 'caller' : 'target'}`, () => {
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
    assert.equal(result, 'handler-threw:Z->J invoked=Z: missing ' +
      (failInCaller ? 'caller' : 'renderer') + ' context');
    assert.ok(logs.some(([message]) => message.includes('caller=Z(response)') && message.includes('target=J(state)')));
  });
}
