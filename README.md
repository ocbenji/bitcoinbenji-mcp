# @bitcoinbenji/mcp

MCP server for [Bitcoin Benji API](https://api.bitcoinbenji.com) — 26 Lightning-paid tools for Bitcoin mempool intelligence + sovereign on-prem AI inference.

**No third-party APIs. No data leakage. Pay-per-call in sats.**

## What you get

**Mempool intelligence** (from a real Bitcoin Core full node):
- `get_fees` — fee estimates with trend
- `get_whales` — whale/consolidation alerts
- `get_mempool_state` — live mempool state
- `get_mempool_history` — 24h rolling snapshots
- `predict_fees` — EMA-based prediction
- `get_recent_blocks` — recent blocks
- `tx_status` — lookup any txid
- `fee_quote` — exact fee for a planned tx

**AI inference** (Qwen3 on dedicated GPU, no third-party APIs):
- `ai_summarize`, `ai_sentiment`, `ai_translate`, `ai_grammar`
- `ai_code_review`, `ai_code_generate`, `ai_extract`, `ai_classify`
- `ai_rewrite`, `ai_explain`, `ai_agent`, `ai_scrape`
- `ai_embed`, `ai_vision`, `ai_ocr`, `ai_transcribe_table`
- `ai_longform` (~50K-word docs flat-fee), `ai_research` (multi-step + cited)

Pricing: **2–100 sats per call**. See [api.bitcoinbenji.com/pricing](https://api.bitcoinbenji.com/pricing).

## Install

```bash
npm install -g @bitcoinbenji/mcp
```

## Use in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bitcoinbenji": {
      "command": "bitcoinbenji-mcp"
    }
  }
}
```

Restart Claude. Ask: *"What are current Bitcoin fees?"* — Claude will call `get_fees`, hit a 402 challenge, return a Lightning invoice. Pay it with any wallet, paste the preimage back, and Claude completes the call.

## Use in Cursor / Cline / Continue / Windsurf

Same idea — point your MCP-compatible client at the `bitcoinbenji-mcp` binary.

## Skip the manual payment loop — use an API key

Pre-fund a key once, then every call auto-debits in the background:

```bash
# Get a key (one-time): visit https://api.bitcoinbenji.com or curl /api/key/create
# Then:
export BITCOIN_BENJI_API_KEY="bb_live_..."
bitcoinbenji-mcp
```

Or in Claude Desktop config:

```json
{
  "mcpServers": {
    "bitcoinbenji": {
      "command": "bitcoinbenji-mcp",
      "env": { "BITCOIN_BENJI_API_KEY": "bb_live_..." }
    }
  }
}
```

## Why this exists

Most AI inference APIs require a credit card, an account, and a SaaS subscription. This one runs on a sovereign solar-powered AMD Strix Halo box, accepts payment in sats over Lightning, and never leaks your prompts to OpenAI/Anthropic/Google.

## Source

[github.com/ocbenji/bitcoinbenji-mcp](https://github.com/ocbenji/bitcoinbenji-mcp)

## License

MIT
