const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, "../lib/server/assistantIntent.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
require("vm").runInNewContext(compiled, { exports: exportsObject });

const match = exportsObject.requestsTodayTaskReview;
assert.equal(match("vamos revisar as tags de todas as tasks pra hoje"), true);
assert.equal(match("Quero calibrar as tarefas de hoje"), true);
assert.equal(match("organize tarefas para hoje"), true);
assert.equal(match("revise minhas tarefas da semana"), false);
assert.equal(match("qual tag combina com essa tarefa?"), false);
assert.equal(match("vamos revisar as tags das tarefas para amanhã"), false);
console.log("PASS: direct today task-review intent");
