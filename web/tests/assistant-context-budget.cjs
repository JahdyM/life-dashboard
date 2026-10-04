// Run: node web/tests/assistant-context-budget.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../lib/server/assistantContextBudget.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: api, Date, Object, Array, JSON, Math });

// Values from the sandbox are another realm's objects; compare serialized forms.
const json = (value) => JSON.stringify(value);

// Empty values are dropped, meaningful falsy ones are kept.
assert.equal(json(api.pruneEmpty({
  a: null, b: '', c: [], d: {}, e: false, f: 0, g: { h: null, i: 'x' }, j: [{ k: null }],
})), json({ e: false, f: 0, g: { i: 'x' }, j: [{}] }));

const tasks = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, title: 'x'.repeat(40) }));
const rules = [
  { key: 'history', keep: 'first', floor: 5 },
  { key: 'recentDone', keep: 'last', floor: 3 },
  { key: 'pending', keep: 'first', floor: 10 },
];

// Already small enough: nothing is cut and nothing is reported.
const small = api.fitContextToBudget({ today: '2026-10-03', pending: tasks(3, 'p') }, 10_000, rules);
assert.equal(small.pending.length, 3);
assert.equal(small.contextTrimmed, undefined);

// Too big: the least useful list shrinks first, the budget is met, and the cut is reported.
const big = {
  today: '2026-10-03',
  history: tasks(100, 'h'),
  recentDone: tasks(100, 'd'),
  pending: tasks(100, 'p'),
  note: null,
};
const fitted = api.fitContextToBudget(big, 12_000, rules);
assert.ok(json(fitted).length <= 12_000, 'serialized context must fit the budget');
assert.ok(fitted.history.length < 100, 'history is trimmed before anything else');
assert.equal(fitted.note, undefined, 'null fields are not sent');
assert.match(fitted.contextTrimmed.history, /of 100 shown/);

// Only as much as needed is cut: lists later in the order stay whole when earlier cuts suffice.
const mild = api.fitContextToBudget({ history: tasks(100, 'h'), pending: tasks(5, 'p') }, 6_000, rules);
assert.equal(mild.pending.length, 5, 'pending is untouched when history alone can absorb the cut');

// Kept end: "first" lists keep the soonest items, "last" lists keep the newest.
const ends = api.fitContextToBudget({ recentDone: tasks(40, 'd'), pending: tasks(40, 'p') }, 1_500, rules);
assert.equal(ends.recentDone[ends.recentDone.length - 1].id, 'd39');
assert.equal(ends.pending[0].id, 'p0');

// Floors are a preference: while other lists can absorb the cut they are kept...
const keptFloor = api.fitContextToBudget(
  { history: tasks(100, 'h'), pending: tasks(30, 'p') }, 3_300, rules);
assert.ok(keptFloor.pending.length >= 10, 'pending keeps its floor while history can still shrink');
// ...but the provider's limit is not negotiable: lists go all the way down to fit.
const hard = api.fitContextToBudget({ pending: tasks(100, 'p'), history: tasks(100, 'h') }, 600, rules);
assert.ok(json(hard).length <= 600, 'a hard budget is met even below the floors');
assert.match(hard.contextTrimmed.pending, /of 100 shown/);

// Non-list and missing keys are left alone.
const odd = api.fitContextToBudget({ history: 'not-a-list', pending: tasks(2, 'p') }, 10, rules);
assert.equal(odd.history, 'not-a-list');

console.log('PASS: pruning, budget fit, trim order, kept end, floors, report of what was cut');
