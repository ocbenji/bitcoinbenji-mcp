#!/usr/bin/env node
/**
 * Bitcoin Benji MCP Server
 *
 * Exposes 26 L402-gated Bitcoin/AI endpoints as MCP tools.
 *
 * Two modes:
 *  1. discovery (default): returns 402 challenge with invoice for the user to pay
 *     manually with their Lightning wallet, then re-call with preimage in the
 *     `preimage` arg.
 *  2. api_key: if BITCOIN_BENJI_API_KEY is set, calls authenticate via Bearer
 *     and balance is debited automatically.
 *
 * Install:  npm install -g @bitcoinbenji/mcp
 * Run:      bitcoinbenji-mcp
 *
 * Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "bitcoinbenji": {
 *         "command": "bitcoinbenji-mcp",
 *         "env": { "BITCOIN_BENJI_API_KEY": "<optional bearer key>" }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = process.env.BITCOIN_BENJI_BASE_URL || 'https://api.bitcoinbenji.com';
const API_KEY = process.env.BITCOIN_BENJI_API_KEY || null;

// ===== Tool definitions =====
// Each entry: { name, desc, method, path, price, args (JSON Schema properties) }
const TOOLS = [
  // --- Mempool intelligence ---
  { name: 'get_fees', desc: 'Bitcoin fee estimates with trend analysis (next-block, 30-min, 1-hour) from a full node mempool.', method: 'GET', path: '/fees', price: 10, args: {} },
  { name: 'get_whales', desc: 'Recent whale alerts: large transfers, consolidations, distributions in the mempool.', method: 'GET', path: '/whales', price: 40, args: { since_seconds: { type: 'number', description: 'Filter alerts within last N seconds (optional)' } } },
  { name: 'get_mempool_state', desc: 'Live Bitcoin mempool state: tx count, byte size, fee histogram.', method: 'GET', path: '/mempool', price: 5, args: {} },
  { name: 'get_mempool_history', desc: 'Rolling 24h snapshots of mempool size and fees.', method: 'GET', path: '/mempool/history', price: 50, args: {} },
  { name: 'predict_fees', desc: 'EMA-based fee prediction with confidence + direction (rising/falling).', method: 'GET', path: '/mempool/predict', price: 50, args: {} },
  { name: 'get_recent_blocks', desc: 'Recent Bitcoin block data: heights, tx counts, timestamps.', method: 'GET', path: '/blocks', price: 10, args: {} },

  // --- Bitcoin developer utils ---
  { name: 'tx_status', desc: 'Lookup a Bitcoin transaction by txid: confirmations, fee, block height, mempool ETA.', method: 'GET', path: '/bitcoin/tx-status', price: 15, args: { txid: { type: 'string', description: 'Bitcoin transaction id (64-char hex)' } }, required: ['txid'] },
  { name: 'fee_quote', desc: 'Exact fee quote for a planned tx: {inputs, outputs, target_blocks, input_type}.', method: 'GET', path: '/bitcoin/fee-quote', price: 15, args: { inputs: { type: 'number' }, outputs: { type: 'number' }, target_blocks: { type: 'number' }, input_type: { type: 'string', description: 'p2pkh | p2wpkh | p2tr', default: 'p2wpkh' } }, required: ['inputs', 'outputs', 'target_blocks'] },

  // --- AI inference (sovereign on-prem, no third-party APIs) ---
  { name: 'ai_summarize', desc: 'Summarize text (short/medium/long).', method: 'POST', path: '/ai/summarize', price: 20, args: { text: { type: 'string' }, max_length: { type: 'string', enum: ['short', 'medium', 'long'], default: 'medium' } }, required: ['text'] },
  { name: 'ai_sentiment', desc: 'Sentiment analysis with confidence score.', method: 'POST', path: '/ai/sentiment', price: 10, args: { text: { type: 'string' } }, required: ['text'] },
  { name: 'ai_translate', desc: 'Translate between 100+ languages.', method: 'POST', path: '/ai/translate', price: 20, args: { text: { type: 'string' }, target: { type: 'string', description: 'target language code or name' }, source: { type: 'string', description: 'source language (optional, auto-detect)' } }, required: ['text', 'target'] },
  { name: 'ai_grammar', desc: 'Fix grammar, spelling, and punctuation.', method: 'POST', path: '/ai/grammar', price: 15, args: { text: { type: 'string' } }, required: ['text'] },
  { name: 'ai_code_review', desc: 'Code review for bugs, security, and performance issues.', method: 'POST', path: '/ai/code-review', price: 50, args: { code: { type: 'string' }, language: { type: 'string', description: 'programming language (optional)' } }, required: ['code'] },
  { name: 'ai_extract', desc: 'Extract structured data from text (entities/contacts/dates/custom schema).', method: 'POST', path: '/ai/extract', price: 25, args: { text: { type: 'string' }, schema: { type: 'string', description: 'predefined schema: entities|contacts|dates' }, custom_fields: { type: 'array', items: { type: 'string' }, description: 'custom field names to extract' } }, required: ['text'] },
  { name: 'ai_scrape', desc: 'Scrape & extract clean readable text from any URL.', method: 'POST', path: '/ai/scrape', price: 15, args: { url: { type: 'string' } }, required: ['url'] },
  { name: 'ai_agent', desc: 'General-purpose AI agent — handles any text task.', method: 'POST', path: '/ai/agent', price: 30, args: { task: { type: 'string' }, context: { type: 'string' } }, required: ['task'] },
  { name: 'ai_classify', desc: 'Classify text into your provided categories.', method: 'POST', path: '/ai/classify', price: 10, args: { text: { type: 'string' }, categories: { type: 'array', items: { type: 'string' } } }, required: ['text', 'categories'] },
  { name: 'ai_rewrite', desc: 'Rewrite text in a different style/tone.', method: 'POST', path: '/ai/rewrite', price: 15, args: { text: { type: 'string' }, style: { type: 'string', description: 'e.g. casual, formal, concise, friendly' } }, required: ['text', 'style'] },
  { name: 'ai_explain', desc: 'Explain any topic at the requested level.', method: 'POST', path: '/ai/explain', price: 25, args: { topic: { type: 'string' }, level: { type: 'string', enum: ['eli5', 'beginner', 'intermediate', 'expert'], default: 'beginner' } }, required: ['topic'] },
  { name: 'ai_embed', desc: '768-dim embedding vector for RAG (single text or batch).', method: 'POST', path: '/ai/embed', price: 2, args: { text: { type: 'string', description: 'single string OR pass `texts` for batch' }, texts: { type: 'array', items: { type: 'string' } } } },
  { name: 'ai_vision', desc: 'Vision QA over an image URL (Qwen3-VL, sovereign).', method: 'POST', path: '/ai/vision', price: 40, args: { image_url: { type: 'string' }, question: { type: 'string', description: 'optional question about the image' } }, required: ['image_url'] },
  { name: 'ai_ocr', desc: 'Extract all visible text from an image URL.', method: 'POST', path: '/ai/ocr', price: 25, args: { image_url: { type: 'string' } }, required: ['image_url'] },
  { name: 'ai_code_generate', desc: 'Generate code from a natural-language spec.', method: 'POST', path: '/ai/code-generate', price: 40, args: { prompt: { type: 'string' }, language: { type: 'string' }, context: { type: 'string' } }, required: ['prompt'] },
  { name: 'ai_longform', desc: 'Summarize huge documents (~50K words) in one flat-fee call.', method: 'POST', path: '/ai/longform', price: 75, args: { text: { type: 'string' }, url: { type: 'string', description: 'alternative to text — fetches & summarizes a URL' }, focus: { type: 'string', description: 'specific focus area (optional)' }, max_length: { type: 'string', enum: ['short', 'medium', 'long'], default: 'medium' } } },
  { name: 'ai_transcribe_table', desc: 'Convert a table image into JSON rows.', method: 'POST', path: '/ai/transcribe-table', price: 35, args: { image_url: { type: 'string' } }, required: ['image_url'] },
  { name: 'ai_research', desc: 'Multi-step web research + cited synthesis.', method: 'POST', path: '/ai/research', price: 100, args: { question: { type: 'string' }, max_sources: { type: 'number', default: 5 } }, required: ['question'] },
];

// ===== Helpers =====
function buildHeaders(preimage, macaroon) {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    h['Authorization'] = `Bearer ${API_KEY}`;
  } else if (preimage && macaroon) {
    h['Authorization'] = `L402 ${macaroon}:${preimage}`;
  }
  return h;
}

function buildUrl(path, args, method) {
  const url = new URL(BASE_URL + path);
  if (method === 'GET' && args) {
    for (const [k, v] of Object.entries(args)) {
      if (v !== undefined && v !== null && k !== 'preimage' && k !== 'macaroon') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function callEndpoint(tool, args) {
  const { preimage, macaroon, ...callArgs } = args || {};
  const url = buildUrl(tool.path, callArgs, tool.method);
  const headers = buildHeaders(preimage, macaroon);

  const init = { method: tool.method, headers };
  if (tool.method === 'POST') {
    init.body = JSON.stringify(callArgs);
  }

  const r = await fetch(url, init);
  const ct = r.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const body = isJson ? await r.json() : await r.text();

  if (r.status === 402) {
    // Payment required — return invoice + macaroon for the agent to pay
    return {
      _payment_required: true,
      message: `Payment required: ${tool.price} sats for ${tool.path}`,
      ...(typeof body === 'object' ? body : { raw: body }),
      instructions: API_KEY
        ? 'Bearer key provided but request still 402 — check key balance with /api/key/balance'
        : 'Pay the `invoice` with any Lightning wallet, then re-call this tool with `preimage` (and `macaroon` from this response) as args. OR: get a prepaid API key from https://api.bitcoinbenji.com to skip the manual flow.',
    };
  }
  if (!r.ok) {
    return { _error: true, status: r.status, body };
  }
  return body;
}

// ===== MCP server =====
const server = new Server(
  { name: 'bitcoinbenji-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: `${t.desc} [${t.price} sats per call]`,
    inputSchema: {
      type: 'object',
      properties: {
        ...t.args,
        // payment args (only relevant in discovery mode without API key)
        preimage: { type: 'string', description: '(L402 mode) Preimage from paid Lightning invoice — only needed if no API key is set' },
        macaroon: { type: 'string', description: '(L402 mode) Macaroon from the previous 402 challenge' },
      },
      required: t.required || [],
    },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const result = await callEndpoint(tool, req.params.arguments || {});
    return {
      content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      isError: !!result._error,
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error calling ${tool.path}: ${e.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
  console.error('MCP transport error:', e);
  process.exit(1);
});
