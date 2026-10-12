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
  'identityBeatOffset', 'restartSharedIdentitySequence',
  'getIdentityBeatNumber', 'startOnNextIdentityBeat',
  'setSubscriptionConfirmationBeatState', 'setWatchingDailyPossessionState',
  'identityTick', 'updateWatchingDailyPossession']);
const source = ast.body.filter(node => names.has(node.id?.name) ||
  node.declarations?.some(d => names.has(d.id.name))).map(node => script.slice(node.start, node.end)).join('\n');

function runtime() {
  const context = vm.createContext({ Intl, Date, Object, Math, Number,
    audio: { paused: false, currentTime: 0 }, performance: { now: () => 0 },
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, screenStates: [],
    confirmation: { dataset: { status: 'success' }, style: {} } });
  context.document = { getElementById: () => context.confirmation };
  context.watchingDaily = { classList: { remove: () => {}, add: state => context.screenStates.push(['daily', state]) } };
  vm.runInContext(source + `
    const identity = { running: true, stateIndex: -1 };
    const watchingDailyPossession = { active: true, stateIndex: -1 };
    function setIdentityState(state) { screenStates.push(['screen', state]); }
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


test('Every activation starts red at any audio phase and continues on the next beat', () => {
  for (const sunset of [false, true]) {
    const c = runtime();
    vm.runInContext(`sunsetModeActive = ${sunset}`, c);
    const seconds = vm.runInContext('getIdentityBeatSeconds()', c);
    for (const beat of [0.2, 1.4, 2.7, 3.9, 17.3]) {
      c.audio.currentTime = beat * seconds;
      vm.runInContext('restartSharedIdentitySequence()', c);
      assert.equal(vm.runInContext('identitySequence[getSharedIdentityBeatIndex()]', c), 'red-white');
      c.screenStates.length = 0;
      vm.runInContext('identity.stateIndex = -1; watchingDailyPossession.stateIndex = -1; identityTick(0); updateWatchingDailyPossession(0)', c);
      assert.equal(c.screenStates[0][1], 'red-white');
      assert.equal(c.screenStates[1][1], 'red-white');
      c.audio.currentTime = (Math.floor(beat) + 1.01) * seconds;
      assert.equal(vm.runInContext('identitySequence[getSharedIdentityBeatIndex()]', c), 'white-red');
    }
  }
});


test('Opening waits for a fresh beat, starts red, and keeps it until the following beat', () => {
  for (const sunset of [false, true]) {
    const c = runtime();
    vm.runInContext(`sunsetModeActive = ${sunset}`, c);
    const seconds = vm.runInContext('getIdentityBeatSeconds()', c);
    const frames = [];
    c.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    c.opened = false;
    c.audio.currentTime = 7.85 * seconds;
    vm.runInContext('startOnNextIdentityBeat(() => { restartSharedIdentitySequence(); opened = true; })', c);
    frames.shift()();
    assert.equal(c.opened, false);
    c.audio.currentTime = 8.001 * seconds;
    frames.shift()();
    assert.equal(c.opened, true);
    assert.equal(vm.runInContext('identitySequence[getSharedIdentityBeatIndex()]', c), 'red-white');
    c.audio.currentTime = 8.99 * seconds;
    assert.equal(vm.runInContext('identitySequence[getSharedIdentityBeatIndex()]', c), 'red-white');
    c.audio.currentTime = 9.001 * seconds;
    assert.equal(vm.runInContext('identitySequence[getSharedIdentityBeatIndex()]', c), 'white-red');
  }
});

test('A cancelled pending start never opens the flashing screen', () => {
  const c = runtime();
  let frame;
  c.requestAnimationFrame = callback => { frame = callback; return 1; };
  c.opened = false;
  vm.runInContext('const cancelStart = startOnNextIdentityBeat(() => { opened = true; }); cancelStart();', c);
  c.audio.currentTime = 20;
  frame();
  assert.equal(c.opened, false);
});


test('Success text matches ticker backgrounds on every beat for both themes', () => {
  const colors = ['#8f1616', '#fff', '#050505', '#fff'];
  for (const sunset of [false, true]) {
    const c = runtime();
    vm.runInContext(`sunsetModeActive = ${sunset}`, c);
    const seconds = vm.runInContext('getIdentityBeatSeconds()', c);
    for (let beat = 0; beat < 8; beat++) {
      c.audio.currentTime = (beat + 0.01) * seconds;
      vm.runInContext('updateWatchingDailyPossession(0)', c);
      assert.equal(c.confirmation.style.color, colors[beat % 4]);
    }
    c.confirmation.dataset.status = 'error';
    c.confirmation.style.color = '#ff2a2a';
    c.audio.currentTime = 8.01 * seconds;
    vm.runInContext('updateWatchingDailyPossession(0)', c);
    assert.equal(c.confirmation.style.color, '#ff2a2a');
  }
});
