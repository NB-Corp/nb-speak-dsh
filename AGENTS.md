# AGENTS.md — nb-speak-dsh Engineering Guide

`NB-Corp/nb-speak-dsh` (`@nb-corp/nb-speak-dsh`) is the standalone, zero-dependency DeepSeek Harness (`DSH`) Cordis plugin and WebUI client extension in the `NB-Corp` speaking trio:
- [`NB-Corp/nb-speak-dsh`](https://github.com/NB-Corp/nb-speak-dsh) — First-class native DSH plugin (`send_bubble` + `send_artifact` + `exec.concludeTurn()` + WebUI `conversation.chat.turnTail` bubbles, 22-bar voice-note pills, and copyable artifact cards).
- [`NB-Corp/nb-speak`](https://github.com/NB-Corp/nb-speak) — Cross-harness `send_message` + `send_artifact` protocol SDK, OpenAI/SSE HTTP bridge, and `bubble_lint` engine.
- [`NB-Corp/chat-human`](https://github.com/NB-Corp/chat-human) — Universal 2-layer IM delivery & persona Agent Skill (`npx skills add NB-Corp/chat-human`).

## Module Ownership

| Path | Responsibility |
| --- | --- |
| `src/dsh-tools.ts` | Native `send_bubble` (`exec.concludeTurn()`) & `send_artifact` tool definitions + `nb-speak:protocol` system prompt section (`order: 9200`). |
| `src/tts.ts` | Optional provider-agnostic speech synthesis when `enableVoiceNotes` is enabled (OpenAI-compatible `/v1/audio/speech`, local JSON bridge `NB_SPEAK_TTS_BRIDGE`, cloud TTS APIs, or browser Web Speech fallback); strips base64 audio from LLM `render()` output while passing `audioSrc` to WebUI `presentationMeta`. |
| `src/client-model.ts` | DSH WebUI turn reducer (`nbSpeakTurnDefinition`), deterministic FNV-1a 22-bar waveform math, GFM pipe-table parser, and Web Speech fallback controller. |
| `src/client-ui.ts` + `src/client.css` | React WebUI slot components (`conversation.chat.turnTail`, `tool.call.toolview`) compiled into `dist/client.js`. |
| `src/plugin.ts` | Cordis host lifecycle, Schemastery volatile settings panel, credential store lookup, and optional Mode A (`skill`) / Mode B (`voice-model`) bridge wiring. |
| `scripts/install-dsh.mjs` | Zero-clone `npx`-safe reversible installer (`--dry-run` / `--apply` / `--uninstall`) persisting `<DSH_HOME>/plugins/nb-speak-dsh` without touching `.credentials.yaml`. |
| `docs/` | M12 warm paper-ink GitHub Pages showcase (`https://nb-corp.github.io/nb-speak-dsh/`), bilingual EN + `/zh/`, JSON-LD, and `llms.txt` / `llms-full.txt`. |

## Build & Verification

Requires **Node.js >= 22.19** (Node 24 recommended). Zero external runtime npm packages:

```bash
npm run build
npm test
```

## Invariants

1. **Zero external runtime dependencies**: `src/*.ts` and `scripts/*.mjs` rely strictly on Node built-ins and optional DSH host peer services.
2. **Zero `EMPTY_RESPONSE` retry loops**: `send_bubble.execute()` calls `exec.concludeTurn()` when `end_turn !== false` so DSH ends the turn cleanly inside the tool step without requiring trailing `assistant.content`.
3. **Subagent `send_message` safety**: Native mode registers `send_bubble` + `send_artifact` so DSH's subagent `send_message({ agent_id, message })` stays untouched; bridge modes remap `send_message <-> agent_send_message`.
4. **Installer credential & cache safety**: `scripts/install-dsh.mjs` must never read, modify, or delete `.credentials.yaml`, and must persist runtime files into `<DSH_HOME>/plugins/nb-speak-dsh` by default so `npx` cache eviction never breaks installed profiles.
