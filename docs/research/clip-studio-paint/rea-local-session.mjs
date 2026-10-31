// Research-only stdio client for the already installed REA 6.8.0.
// Keeps one Ghidra Program alive across read-only follow-up queries, with a
// per-call deadline long enough for this 93 MB executable. No client config edits.
// Run in a terminal/PTY that keeps stdin open. Output files refuse replacement
// except for explicit canonical bundle exports; use a new output name for a new run.
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const reaRoot = 'C:/Users/dusto/AppData/Roaming/npm/node_modules/rea-agents';
const require = createRequire(join(reaRoot, 'package.json'));
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const output = dirname(fileURLToPath(import.meta.url));
const target = 'C:/Program Files/CELSYS/CLIP STUDIO 1.5/CLIP STUDIO PAINT/CLIPStudioPaint.exe';
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(reaRoot, 'scripts/rea.mjs'), '--mcp'],
  env: { ...process.env, REA_GHIDRA_STARTUP_TIMEOUT_MS: '1800000' },
  stderr: 'pipe',
});
const client = new Client({ name: '2dope-csp-readonly-research', version: '1.0.0' });
const allowed = new Set([
  'search_strings', 'search_procedures', 'trace_feature', 'xrefs',
  'resolve_containing_procedure', 'analyze_function', 'procedure_callees',
  'procedure_callers', 'procedure_pseudo_code', 'read_bytes', 'binary_overview',
  'inspect_analysis_view', 'get_evidence_bundle', 'export_evidence_bundle',
]);
const unpack = r => r.structuredContent ?? (() => {
  try { return JSON.parse(r.content.find(c => c.type === 'text').text); }
  catch { return { transport_error: r.content }; }
})();
async function run(name, args, file) {
  const result = await client.callTool({ name, arguments: args }, {
    timeout: 2100000, maxTotalTimeout: 2100000,
  });
  if (file) {
    if (!/^[a-z0-9.-]+\.json$/.test(file)) throw new Error('Invalid result basename');
    await writeFile(join(output, file), JSON.stringify(result, null, 2), { flag: 'wx' });
  }
  const o = unpack(result);
  console.log(JSON.stringify({ name, file, isError: result.isError ?? false,
    evidence_id: o.evidence_id, error: o.error?.message,
    result: o.result, normalized: o.normalized_result?.kind === 'summary' ? o.normalized_result : undefined,
  }));
  if (result.isError) throw new Error('REA returned an error; stop instead of retrying a cold import');
  return result;
}
await client.connect(transport);
try {
  await run('open_binary', { path: target, provider_id: 'ghidra' });
  await run('search_strings', {
    pattern: 'VectorPinch|LineWidthMultiply|BrushRibbon|BrushVectorEraser|VectorPoint|BrushSizeEffector|VectorStroke|Bezier|Ribbon',
    mode: 'regex', detail: 'summary',
  }, 'native-main-strings.result.json');
  await run('export_evidence_bundle', {
    path: join(output, 'native-main-code.evidence.json'), overwrite: true,
  });
  console.log('READY: read-only REA follow-up requests as JSON lines');
  for await (const line of createInterface({ input: process.stdin, terminal: false })) {
    if (!line.trim()) continue;
    const job = JSON.parse(line);
    if (job.name === 'close') break;
    if (!allowed.has(job.name)) throw new Error('Operation is outside this read-only research client');
    await run(job.name, job.args ?? {}, job.file);
  }
} finally {
  await client.callTool({ name: 'close_binary', arguments: {} }, { timeout: 120000 }).catch(() => {});
  await client.close();
}
