import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ast = parse(script, { ecmaVersion: 'latest' });
const names = new Set(['THEME_SCHEDULE', 'sunsetModeActive', 'identitySequence',
  'isSunsetThemeTime', 'getIdentityBeatSeconds', 'getSharedIdentityBeatIndex',
  'identityTick', 'updateWatchingDailyPossession']);
const source = ast.body.filter(node => names.has(node.id?.name) ||
  node.declarations?.some(d => names.has(d.id.name))).map(node => script.slice(node.start, node.end)).join('\n');

function runtime() {
  const context = vm.createContext({ Intl, Date, Object, Math, Number,
    audio: { paused: false, currentTime: 0 }, performance: { now: () => 0 },
    requestAnimationFrame: () => 1, screenStates: [] });
  vm.runInContext(source + `
    const identity = { running: true, stateIndex: -1 };
    const watchingDailyPossession = { active: true, stateIndex: -1 };
    function setIdentityState(state) { screenStates.push(['screen', state]); }
    function setWatchingDailyPossessionState(state) { screenStates.push(['daily', state]); }
  `, context);
  return context;
}

test('Los Angeles theme boundaries hold every day, including DST changes', () => {
  const c = runtime();
  for (const [date, offset] of [['2026-10-11', '-07:00'], ['2026-11-01', '-08:00'],
    ['2027-03-14', '-07:00'], ['2027-01-08', '-08:00']]) {
    for (const [time, sunset] of [['08:59:59', true], ['09:00:00', false],
      ['16:59:59', false], ['17:00:00', true], ['23:59:59', true]]) {
      assert.equal(vm.runInContext(`isSunsetThemeTime(new Date('${date}T${time}${offset}'))`, c), sunset);
    }
  }
});

test('Both flashing screens follow the same audio beat at each theme BPM', () => {
  const c = runtime();
  for (const [sunset, bpm] of [[false, 120], [true, 110]]) {
    vm.runInContext(`sunsetModeActive = ${sunset}`, c);
    assert.equal(vm.runInContext('getIdentityBeatSeconds()', c), 60 / bpm);
    for (let beat = 0; beat < 12; beat++) {
      c.audio.currentTime = (beat + 0.01) * 60 / bpm;
      c.screenStates.length = 0;
      vm.runInContext('identity.stateIndex = -1; watchingDailyPossession.stateIndex = -1; identityTick(0); updateWatchingDailyPossession(0)', c);
      assert.equal(c.screenStates.length, 2);
      assert.equal(c.screenStates[0][1], c.screenStates[1][1]);
      assert.equal(vm.runInContext('getSharedIdentityBeatIndex()', c), beat % 4);
    }
  }
});

test('Scheduled sunrise and sunset sources are included in the audio manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../media-source/manifest.json', import.meta.url)));
  const c = runtime();
  for (const theme of ['sunrise', 'sunset']) {
    const path = vm.runInContext(`THEME_SCHEDULE.${theme}.source`, c);
    assert.ok(manifest.some(asset => path === `/media/${asset.file}`));
  }
});
