const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, "../lib/config/habits.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
require("vm").runInNewContext(compiled, { exports: exportsObject });

assert.equal(exportsObject.getHabitDisplayLabel("workout", "Workout/Fisioterapia"), "Workout");
assert.equal(exportsObject.isHabitScheduledForWeekday("workout", 1, [], 6), true);
assert.equal(exportsObject.isHabitScheduledForWeekday("workout", 5, [], 6), true);
assert.equal(exportsObject.isHabitScheduledForWeekday("workout", 0, [], 6), false);
assert.equal(exportsObject.isHabitScheduledForWeekday("workout", 6, [], 6), false);
console.log("PASS: workout is scheduled on weekdays only");
