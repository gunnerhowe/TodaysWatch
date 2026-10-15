/**
 * Day-1 task: call listTools() on `qloo mcp` and save every Qloo tool's exact input schema to
 * docs/qloo-tools.json. Works without a Qloo key (schemas are discoverable offline).
 */
import { writeFile } from "node:fs/promises";
import { listQlooTools, stopQloo } from "../src/qloo/bridge.ts";

const tools = await listQlooTools();
const out = {
  generatedAt: new Date().toISOString(),
  source: "qloo mcp (listTools) via @qloo/qloo-harness",
  tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })),
};
const path = new URL("../../../docs/qloo-tools.json", import.meta.url);
await writeFile(path, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Saved ${tools.length} tool schemas to docs/qloo-tools.json:`);
for (const t of tools) console.log(` - ${t.name}: ${Object.keys((t.inputSchema as { properties?: object }).properties ?? {}).join(", ")}`);
await stopQloo();
process.exit(0);
