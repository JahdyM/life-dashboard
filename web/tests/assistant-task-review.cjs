// Run with: node web/tests/assistant-task-review.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
let session;
let queries = [];
let rows = [];
const exportsObject = {};
const mocks = {
  'server-only': {},
  '@/lib/db/prisma': { prisma: { todoTask: { findMany: async (query) => {
    queries.push(query);
    return rows;
  } } } },
  './dbCompat': { ensureTaskCompletionColumns: async () => {} },
  './settings': {
    getSetting: async () => session,
    setSetting: async (_email, _key, value) => { session = value; },
    getTodayIsoForUser: async () => '2026-09-28',
  },
  './taskAreas': { getTaskAreaMap: async () => new Map(), getTaskAreas: async () => [] },
};
const source = fs.readFileSync(path.join(__dirname, '../lib/server/assistantTaskReview.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject, require: (name) => {
  if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
  return mocks[name];
} });
const reset = (overrides = {}) => {
  session = JSON.stringify({ scope: 'today', date: '2026-09-28',
    taskIds: ['a', 'b', 'c'], index: 0, startedAt: '2026-09-28', ...overrides });
  queries = [];
};
(async () => {
  reset();
  rows = [{ id: 'c', title: 'Third' }, { id: 'b', title: 'Second' }];
  let review = await exportsObject.getAssistantTaskReview('owner@example.com');
  assert.equal(review.current.id, 'b');
  assert.equal(review.position, 2);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].where.userEmail, 'owner@example.com');
  assert.equal(queries[0].where.scheduledDate, '2026-09-28');
  assert.equal(queries[0].where.source.not, 'habit');
  assert.equal(queries[0].where.missedAt, null);
  assert.equal(JSON.parse(session).index, 1);

  reset({ taskIds: Array.from({ length: 500 }, (_, i) => String(i)) });
  rows = [{ id: '499', title: 'Last pending' }];
  review = await exportsObject.getAssistantTaskReview('owner@example.com');
  assert.equal(review.current.id, '499');
  assert.equal(queries.length, 1, 'stale queues must not cause hundreds of queries');

  reset({ scope: 'backlog', date: null });
  rows = [];
  assert.equal(await exportsObject.getAssistantTaskReview('owner@example.com'), null);
  assert.equal(queries[0].where.scheduledDate, null);
  assert.equal(session, '');

  reset({ index: 3 });
  assert.equal(await exportsObject.getAssistantTaskReview('owner@example.com'), null);
  assert.equal(queries.length, 0);
  console.log('PASS: scoped queue, stable ordering, stale queue batching, empty queue');
})().catch((error) => { console.error(error); process.exitCode = 1; });
