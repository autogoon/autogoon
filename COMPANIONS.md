# Companions

Each companion is a distinct persona the app talks to over the LLM backend. This
doc describes how those personas are hosted: **one Ollama model card per
companion, built on a shared base model.**

## The model

The app uses a **self-hosted, uncensored open-weight model via Ollama** — Claude
and the OpenAI APIs both restrict explicit content, so neither is viable here. The
model runs on a **self-hosted machine with enough RAM** (~64 GB is comfortable);
the app connects to it over the LAN through Ollama's OpenAI-compatible endpoint
(`LLM_URL`, `…/v1`).

The base model is **Cydonia 24B (v4.3)** — TheDrummer's uncensored roleplay
finetune of Mistral Small 24B — at **Q6_K** (~19.4 GB):

```
hf.co/bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q6_K
```

This replaces the original **MythoMax L2 13B** placeholder, which is a 2023
Llama-2 model and badly outdated for roleplay. Q6_K is the quality/speed sweet
spot on a ~64 GB machine; drop to `Q5_K_M` (~16.8 GB) or `Q4_K_M` (~14.3 GB) for more
headroom or faster tokens. The base is swappable and not load-bearing — the whole
point of the card-per-companion setup below is that the persona lives in the card,
not the weights.

## One model card per companion

Each companion is an **Ollama model** created from a **Modelfile**: `FROM` the
shared Cydonia base, plus that companion's persona (`SYSTEM`) and sampling
settings (`PARAMETER`). Because Ollama is content-addressed, every companion card
**references the same ~19.4 GB weight blob** — a new companion costs only the few
kilobytes of its manifest, never another copy of the model.

```
ollama create elise -f elise.Modelfile      # build a companion's card
ollama run elise                            # smoke-test it directly
ollama list                                 # each companion appears as its own model
```

The app then requests a companion by its **card name** (e.g. `elise`) as the
model in each chat-completions call — same `LLM_URL`, different `LLM_MODEL`.

### Modelfile anatomy

See [`elise.Modelfile`](./elise.Modelfile) for a complete worked example. The
shape is:

```dockerfile
FROM hf.co/bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q6_K

# 32k context — long, coherent sessions without eating all the RAM
PARAMETER num_ctx 32768

# Roleplay-friendly sampling
PARAMETER temperature 0.9
PARAMETER min_p 0.05
PARAMETER repeat_penalty 1.05

SYSTEM """<the companion's persona, scenario, and style guidance>"""

# Optional: seed the opening scene the companion greets with
MESSAGE assistant """<greeting / scene-setter>"""
```

**Conventions for a new companion:**

- Name the file `<name>.Modelfile` and create the model as `<name>` (lowercase).
- Keep `FROM`, `num_ctx`, and the sampling `PARAMETER`s identical across
  companions unless you have a reason to differ — only the `SYSTEM` (and any
  seeded `MESSAGE`) should change from one companion to the next.
- The `SYSTEM` block carries the persona, the setup, and style/formatting rules;
  keep the companion in character and never let it break the fourth wall.

### Context and RAM notes (~64 GB host)

- `num_ctx 32768` is the default — plenty for long sessions and fast. Weights
  (~19.4 GB at Q6_K) plus a 32k KV cache stay well within the 64 GB budget with
  room to spare.
- For much larger windows (64k–128k, which Cydonia's Mistral-Small base
  supports), enable KV-cache quantization on the Ollama **server** to keep memory
  in check: `OLLAMA_FLASH_ATTENTION=1` and `OLLAMA_KV_CACHE_TYPE=q8_0`. In
  practice roleplay coherence fades long before 128k, so 32k is the recommended
  working default.

## Configuration

Two env vars wire the app to the backend (server-side only; see
[`.env.example`](./.env.example)):

- `LLM_URL` — the OpenAI-compatible endpoint, e.g.
  `http://localhost:11434/v1`.
- `LLM_MODEL` — the companion card name to request (e.g. `elise`).
