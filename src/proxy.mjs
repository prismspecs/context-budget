import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { estimateTokens, formatBytes } from './token-utils.mjs';

export function analyzeTurnZeroPayload(payload) {
  const result = {
    detectedFormat: 'unknown',
    system: { totalTokens: 0, totalBytes: 0, sections: [] },
    tools: { totalTokens: 0, totalBytes: 0, items: [] },
    messages: { totalTokens: 0, totalBytes: 0, count: 0 },
    grandTotal: { tokens: 0, bytes: 0 },
  };

  let rawSystem = '';
  let rawTools = [];
  let rawMessages = [];

  if (payload.system !== undefined || (Array.isArray(payload.tools) && payload.tools[0]?.input_schema)) {
    result.detectedFormat = 'Anthropic (/v1/messages)';
    if (typeof payload.system === 'string') {
      rawSystem = payload.system;
    } else if (Array.isArray(payload.system)) {
      rawSystem = payload.system.map((s) => (typeof s === 'string' ? s : s.text || '')).join('\n\n');
    }
    rawTools = payload.tools || [];
    rawMessages = payload.messages || [];
  } else if (Array.isArray(payload.messages)) {
    result.detectedFormat = 'OpenAI (/v1/chat/completions)';
    const sysMsgs = payload.messages.filter((m) => m.role === 'system' || m.role === 'developer');
    rawSystem = sysMsgs.map((m) => m.content || '').join('\n\n');
    rawMessages = payload.messages.filter((m) => m.role !== 'system' && m.role !== 'developer');
    rawTools = payload.tools || payload.functions || [];
  }

  // 1. System Prompt
  result.system.totalBytes = Buffer.byteLength(rawSystem, 'utf8');
  result.system.totalTokens = estimateTokens(rawSystem);

  if (rawSystem) {
    const sectionRegex = /(^#{1,3}\s+[^\n]+|<RULE\[[^\]]+\]>)/gm;
    const slices = rawSystem.split(sectionRegex);
    let currentTitle = 'Initial / Preamble';

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i].trim();
      if (!slice) continue;
      if (slice.startsWith('#') || slice.startsWith('<RULE')) {
        currentTitle = slice.replace(/^#+\s*/, '').replace(/<RULE\[|\]>/g, '').trim();
      } else {
        const bytes = Buffer.byteLength(slice, 'utf8');
        const tokens = estimateTokens(slice);
        result.system.sections.push({
          title: currentTitle,
          bytes,
          tokens,
        });
        currentTitle = 'Instruction block';
      }
    }
    result.system.sections.sort((a, b) => b.tokens - a.tokens);
  }

  // 2. Tools
  for (const t of rawTools) {
    let name = t.name;
    let description = t.description || '';
    let schema = t.input_schema || t.parameters || t.function?.parameters || {};
    if (t.function?.name) {
      name = t.function.name;
      description = t.function.description || '';
    }

    const descBytes = Buffer.byteLength(description, 'utf8');
    const schemaStr = JSON.stringify(schema);
    const schemaBytes = Buffer.byteLength(schemaStr, 'utf8');
    const totalBytes = descBytes + schemaBytes + Buffer.byteLength(name || '', 'utf8');
    const totalTokens = estimateTokens(description + schemaStr + (name || ''));

    result.tools.items.push({
      name: name || 'unnamed_tool',
      descTokens: estimateTokens(description),
      schemaTokens: estimateTokens(schemaStr),
      totalTokens,
      totalBytes,
    });
  }

  result.tools.items.sort((a, b) => b.totalTokens - a.totalTokens);
  result.tools.totalTokens = result.tools.items.reduce((acc, cur) => acc + cur.totalTokens, 0);
  result.tools.totalBytes = result.tools.items.reduce((acc, cur) => acc + cur.totalBytes, 0);

  // 3. Messages
  result.messages.count = rawMessages.length;
  const msgsStr = JSON.stringify(rawMessages);
  result.messages.totalBytes = Buffer.byteLength(msgsStr, 'utf8');
  result.messages.totalTokens = estimateTokens(msgsStr);

  result.grandTotal.tokens = result.system.totalTokens + result.tools.totalTokens + result.messages.totalTokens;
  result.grandTotal.bytes = result.system.totalBytes + result.tools.totalBytes + result.messages.totalBytes;

  return result;
}

export function printBreakdown(analysis) {
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const red = (s) => `\x1b[31m${s}\x1b[0m`;
  const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;

  const totalTok = analysis.grandTotal.tokens || 1;
  const sysPct = ((analysis.system.totalTokens / totalTok) * 100).toFixed(1);
  const toolPct = ((analysis.tools.totalTokens / totalTok) * 100).toFixed(1);
  const msgPct = ((analysis.messages.totalTokens / totalTok) * 100).toFixed(1);

  console.log('\n' + bold('╔═══════════════════════════════════════════════════════════════════════════════════════════╗'));
  console.log(bold(`║                        TURN 0 REQUEST PAYLOAD INSPECTION                                 ║`));
  console.log(bold('╚═══════════════════════════════════════════════════════════════════════════════════════════╝'));
  console.log(`${dim('Detected Format:')} ${cyan(analysis.detectedFormat)}`);
  console.log(`${dim('Total Turn-0 Footprint:')} ${bold(`${analysis.grandTotal.tokens} tokens`)} (${formatBytes(analysis.grandTotal.bytes)})`);
  console.log(
    `  • ${bold('System Prompt / Rules')}: ${analysis.system.totalTokens} tok (${sysPct}%) | ${formatBytes(analysis.system.totalBytes)}`
  );
  console.log(
    `  • ${bold('Tool Schemas')}:          ${analysis.tools.totalTokens} tok (${toolPct}%) | ${formatBytes(analysis.tools.totalBytes)} (${analysis.tools.items.length} tools)`
  );
  console.log(
    `  • ${bold('Turn-0 Messages')}:       ${analysis.messages.totalTokens} tok (${msgPct}%) | ${formatBytes(analysis.messages.totalBytes)}`
  );

  if (analysis.tools.items.length > 0) {
    console.log('\n' + bold(cyan('▶ RANKED TOOL SCHEMAS BY TOKEN SIZE:')));
    console.log(
      dim(
        '  ' +
          'TOOL NAME'.padEnd(38) +
          'SCHEMA TOK'.padStart(12) +
          'DESC TOK'.padStart(12) +
          'TOTAL TOK'.padStart(12) +
          '% OF TOOLS'.padStart(12)
      )
    );
    console.log(dim('  ' + '─'.repeat(86)));

    const toolTotal = analysis.tools.totalTokens || 1;
    for (const tool of analysis.tools.items.slice(0, 15)) {
      const pct = ((tool.totalTokens / toolTotal) * 100).toFixed(1) + '%';
      const nameStr = tool.name.length > 36 ? tool.name.slice(0, 33) + '...' : tool.name;
      const tokColor = tool.totalTokens > 500 ? red : tool.totalTokens > 250 ? yellow : green;
      console.log(
        '  ' +
          bold(nameStr.padEnd(38)) +
          String(tool.schemaTokens).padStart(12) +
          String(tool.descTokens).padStart(12) +
          tokColor(String(tool.totalTokens).padStart(12)) +
          pct.padStart(12)
      );
    }
    if (analysis.tools.items.length > 15) {
      console.log(dim(`  ... and ${analysis.tools.items.length - 15} more tools.`));
    }
  }

  if (analysis.system.sections.length > 0) {
    console.log('\n' + bold(cyan('▶ RANKED SYSTEM PROMPT / RULES SLICES:')));
    console.log(dim('  ' + 'SECTION TITLE'.padEnd(48) + 'TOKENS'.padStart(14) + 'BYTES'.padStart(14)));
    console.log(dim('  ' + '─'.repeat(76)));

    for (const sec of analysis.system.sections.slice(0, 10)) {
      const titleStr = sec.title.length > 46 ? sec.title.slice(0, 43) + '...' : sec.title;
      const tokColor = sec.tokens > 500 ? red : sec.tokens > 200 ? yellow : green;
      console.log(
        '  ' +
          bold(titleStr.padEnd(48)) +
          tokColor(String(sec.tokens).padStart(14)) +
          formatBytes(sec.bytes).padStart(14)
      );
    }
    if (analysis.system.sections.length > 10) {
      console.log(dim(`  ... and ${analysis.system.sections.length - 10} more sections.`));
    }
  }

  console.log('\n' + bold('─────────────────────────────────────────────────────────────────────────────────────────────\n'));
}

export function generateMarkdownReport(analysis) {
  const totalTok = analysis.grandTotal.tokens || 1;
  let md = `# Turn-0 Context Payload Audit Report\n\n`;
  md += `**Timestamp:** ${new Date().toISOString()}\n`;
  md += `**Format Detected:** ${analysis.detectedFormat}\n\n`;
  md += `## Summary Overview\n\n`;
  md += `| Category | Tokens | % of Context | Raw Bytes |\n`;
  md += `|:---|---:|---:|---:|\n`;
  md += `| **System Prompt & Rules** | ${analysis.system.totalTokens} | ${((analysis.system.totalTokens / totalTok) * 100).toFixed(1)}% | ${formatBytes(analysis.system.totalBytes)} |\n`;
  md += `| **Tool Schemas** | ${analysis.tools.totalTokens} | ${((analysis.tools.totalTokens / totalTok) * 100).toFixed(1)}% | ${formatBytes(analysis.tools.totalBytes)} |\n`;
  md += `| **Initial Message** | ${analysis.messages.totalTokens} | ${((analysis.messages.totalTokens / totalTok) * 100).toFixed(1)}% | ${formatBytes(analysis.messages.totalBytes)} |\n`;
  md += `| **Grand Total** | **${analysis.grandTotal.tokens}** | **100.0%** | **${formatBytes(analysis.grandTotal.bytes)}** |\n\n`;

  if (analysis.tools.items.length > 0) {
    md += `## Tool Schemas Breakdown (${analysis.tools.items.length} tools registered)\n\n`;
    md += `| Tool Name | Total Tokens | Schema Tokens | Description Tokens | Bytes |\n`;
    md += `|:---|---:|---:|---:|---:|\n`;
    for (const t of analysis.tools.items) {
      md += `| \`${t.name}\` | ${t.totalTokens} | ${t.schemaTokens} | ${t.descTokens} | ${formatBytes(t.totalBytes)} |\n`;
    }
    md += `\n`;
  }

  if (analysis.system.sections.length > 0) {
    md += `## System Prompt & Rules Slices\n\n`;
    md += `| Rule / Slice Title | Estimated Tokens | Bytes |\n`;
    md += `|:---|---:|---:|\n`;
    for (const s of analysis.system.sections) {
      md += `| ${s.title} | ${s.tokens} | ${formatBytes(s.bytes)} |\n`;
    }
    md += `\n`;
  }

  return md;
}

export function startProxyServer(options = {}) {
  const port = options.port || 8080;
  const targetUrl = options.target || '';
  const outDir = path.resolve(options.outDir || './.context-audit');
  const mockMode = options.mock || !targetUrl;
  const captureAll = options.allTurns || false;

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let turnCount = 0;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      let payload = null;

      if (rawBody.length > 0 && req.headers['content-type']?.includes('application/json')) {
        try {
          payload = JSON.parse(rawBody.toString('utf8'));
        } catch {}
      }

      const isChatOrMessages = req.url.includes('/messages') || req.url.includes('/chat/completions');
      const isTurnZero = isChatOrMessages && (turnCount === 0 || (payload && Array.isArray(payload.messages) && payload.messages.filter(m => m.role === 'assistant').length === 0));

      if (payload && (isTurnZero || captureAll)) {
        turnCount++;
        const analysis = analyzeTurnZeroPayload(payload);

        const payloadFile = path.join(outDir, `turn_${turnCount - 1}_request.json`);
        fs.writeFileSync(payloadFile, JSON.stringify(payload, null, 2));

        const mdReport = generateMarkdownReport(analysis);
        fs.writeFileSync(path.join(outDir, `turn_${turnCount - 1}_breakdown.md`), mdReport);
        fs.writeFileSync(path.join(outDir, `turn_${turnCount - 1}_breakdown.json`), JSON.stringify(analysis, null, 2));

        printBreakdown(analysis);
        console.log(`\x1b[32m✔ Raw turn 0 payload saved to: ${payloadFile}\x1b[0m`);
        console.log(`\x1b[32m✔ Markdown audit report saved to: ${path.join(outDir, `turn_${turnCount - 1}_breakdown.md`)}\x1b[0m\n`);
      }

      if (mockMode || !targetUrl) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url.includes('/messages')) {
          res.end(
            JSON.stringify({
              id: 'msg_mock_turn_0',
              type: 'message',
              role: 'assistant',
              model: payload?.model || 'mock-model',
              content: [{ type: 'text', text: 'Turn 0 payload captured and inspected by Context-Budget Proxy.' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: payload ? estimateTokens(payload) : 0, output_tokens: 15 },
            })
          );
        } else {
          res.end(
            JSON.stringify({
              id: 'chatcmpl-mock-turn-0',
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: payload?.model || 'mock-model',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Turn 0 payload captured and inspected by Context-Budget Proxy.' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: payload ? estimateTokens(payload) : 0, completion_tokens: 15, total_tokens: (payload ? estimateTokens(payload) : 0) + 15 },
            })
          );
        }
        return;
      }

      // Live forward
      const parsedTarget = new URL(req.url, targetUrl);
      const forwardClient = parsedTarget.protocol === 'https:' ? https : http;

      const headers = { ...req.headers, host: parsedTarget.host };
      delete headers['content-length'];

      const proxyReq = forwardClient.request(
        parsedTarget,
        { method: req.method, headers },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        console.error('Proxy forwarding error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy forwarding failed', message: err.message }));
      });

      if (rawBody.length > 0) {
        proxyReq.write(rawBody);
      }
      proxyReq.end();
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n\x1b[1m\x1b[36m⚡ Context-Budget Inspection Proxy running at http://127.0.0.1:${port}\x1b[0m`);
    if (mockMode) {
      console.log(`\x1b[33m  [Mode: Mock / Inspection]\x1b[0m No upstream URL configured. Test requests will return mock completions.`);
    } else {
      console.log(`\x1b[32m  [Mode: Forwarding]\x1b[0m Proxying requests to ${targetUrl}`);
    }
    console.log(`  Payload Dumps: ${outDir}`);
    console.log(`\n\x1b[2mPoint your harness to http://127.0.0.1:${port} (e.g. ANTHROPIC_BASE_URL or OPENAI_BASE_URL).\x1b[0m\n`);
  });

  return server;
}
