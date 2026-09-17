import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, formatBytes } from '../src/token-utils.mjs';
import { analyzeTurnZeroPayload } from '../src/proxy.mjs';
import { evaluateFindings } from '../src/audit.mjs';

test('estimateTokens calculates approximate token counts', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('hello'), 2);
  const sample = 'a'.repeat(385);
  assert.equal(estimateTokens(sample), 100);
});

test('formatBytes formats units appropriately', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
});

test('analyzeTurnZeroPayload parses Anthropic format with ranked tools & rules', () => {
  const payload = {
    system: '# Architecture\nImmutable state.\n\n## Security\nNo hardcoded secrets.',
    tools: [
      {
        name: 'heavy_tool',
        description: 'Large schema tool',
        input_schema: {
          type: 'object',
          properties: {
            arg1: { type: 'string', description: 'Long explanation of parameter 1' },
            arg2: { type: 'string', description: 'Long explanation of parameter 2' },
          },
        },
      },
      {
        name: 'light_tool',
        description: 'Simple',
        input_schema: { type: 'object' },
      },
    ],
    messages: [{ role: 'user', content: 'Test prompt' }],
  };

  const analysis = analyzeTurnZeroPayload(payload);
  assert.equal(analysis.detectedFormat, 'Anthropic (/v1/messages)');
  assert.equal(analysis.tools.items.length, 2);
  assert.equal(analysis.tools.items[0].name, 'heavy_tool');
  assert.ok(analysis.tools.items[0].totalTokens > analysis.tools.items[1].totalTokens);
  assert.equal(analysis.system.sections.length, 2);
  assert.ok(analysis.grandTotal.tokens > 0);
});

test('analyzeTurnZeroPayload parses OpenAI format', () => {
  const payload = {
    messages: [
      { role: 'system', content: '# Global Rules\nFollow conventions.' },
      { role: 'user', content: 'Hello agent' },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'bash',
          description: 'Run commands',
          parameters: { type: 'object' },
        },
      },
    ],
  };

  const analysis = analyzeTurnZeroPayload(payload);
  assert.equal(analysis.detectedFormat, 'OpenAI (/v1/chat/completions)');
  assert.equal(analysis.tools.items.length, 1);
  assert.equal(analysis.tools.items[0].name, 'bash');
  assert.equal(analysis.messages.count, 1);
});

test('evaluateFindings flags global domain-specific MCP and oversized rules', () => {
  const mockAgy = { globalMcpServers: ['blender'] };
  const mockPi = { mcpServers: [], packages: ['npm:pi-context'] };
  const mockClaude = {
    autoModeEnv: { tokens: 500, itemsCount: 10 },
    skills: Array(8).fill({ status: 'disabled' }),
  };
  const mockOpencode = { instructions: [] };
  const mockProject = {
    rules: [{ filename: 'CLAUDE.md', tokens: 1500 }],
  };

  const findings = evaluateFindings(mockAgy, mockPi, mockClaude, mockOpencode, mockProject);
  const titles = findings.map((f) => f.title);

  assert.ok(titles.some((t) => t.includes('blender')));
  assert.ok(titles.some((t) => t.includes('Claude autoMode.environment')));
  assert.ok(titles.some((t) => t.includes('CLAUDE.md')));
});
