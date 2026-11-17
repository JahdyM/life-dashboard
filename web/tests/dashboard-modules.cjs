const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, "../lib/config/dashboard.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
require("vm").runInNewContext(compiled, { exports: exportsObject });

const moduleKeys = Array.from(exportsObject.DASHBOARD_MODULE_KEYS);
const configuredKeys = exportsObject.DASHBOARD_MODULES.map((item) => item.key);
assert.equal(moduleKeys.includes("dissertation"), false);
assert.equal(configuredKeys.includes("dissertation"), false);
console.log("PASS: dissertation is not a dashboard module");
