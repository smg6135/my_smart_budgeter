# Downloadable local AI

The app prefers available **Apple Foundation Models** (iOS) or **Gemini Nano/AICore** (Android). When system AI is unavailable, it installs **Qwen3 0.6B Q4_K_M** inside the running app. No app restart, model account, key, subscription or inference server is needed.

## Model choice

Tested with CPU llama.cpp, greedy generation, the app's category prompt, constrained JSON and 17 synthetic expense descriptions:

| Model | Download | Correct |
| --- | ---: | ---: |
| Google Gemma 3 270M IT Q4_K_M | 253 MB | 12/17 |
| Qwen2.5 0.5B Instruct Q4_K_M | 398 MB | 13/17 |
| **Qwen3 0.6B Q4_K_M** | **484 MB** | **16/17** |

SmolLM2 135M (~105 MB) and 360M (~271 MB) were also tried with earlier prompts and made basic category errors. Qwen3 is the smallest practical choice among these tests, not a claim of universally best accuracy. This small English-language sample is not a production accuracy benchmark. It still mislabeled an unfamiliar game purchase; manual overrides remain essential. Chat is brief goal clarification, without web research, prices, budget mutation or financial arithmetic.

Google's Gemini Nano is a system-managed model with device availability checks, not a universal downloadable model for older phones. Google's LiteRT-LM is a cross-platform runtime; it does not make Nano available on unsupported hardware. Embedding models can support label similarity but cannot replace generative chat. We use the same bundled llama.cpp runtime on both platforms rather than shipping different weight formats/runtimes. Qwen3 weights are Apache 2.0; app/runtime source remains MIT. Full model/runtime notices are bundled in `src/local-model-notices.json`.

## Installation and privacy

1. Check the system model at startup, foreground and while active. Android catches missing/broken AICore; iOS checks model readiness, not just OS version.
2. When unavailable, check installed weights locally. If absent, start a single automatic Wi-Fi download. Settings → On-device AI shows progress and pause/retry. Download now explicitly permits mobile data.
3. Download to a partial file; require HTTP 200, exact byte count and pinned SHA-256 before moving to the installed path. Interrupted partials restart. Low storage and failed checks remain retryable. Pausing persists across launches.
4. Run inference locally through `llama.rn`. Model weights are memory-mapped, context limited to 2,048 tokens, work serialized and model memory released when idle/backgrounded. We use CPU inference for broad compatibility. Actual latency/RAM depend on the phone; sufficiently constrained devices can still require manual entry.
5. Reuse verified weights offline across launches. Model files are excluded from OS backup. No expense, photo, OCR or chat data is sent to the download host. The public host can see the model download request/IP. The app still uses the separate public FX feed when online.

Receipts uploaded during installation wait for that download. Missing network/space, paused installation, invalid output or an inference failure leave manual controls available. A successful category and AI review never bypass the existing amount/date/currency/confidence validation. There is no cloud inference or keyword classifier fallback.

The **first** model installation requires internet. Afterward it works in airplane mode. A new native app build is needed once for this runtime; Expo Go and the previous TestFlight binary cannot load it. Android supports arm64 devices/x86_64 emulators; Android receipt OCR is still separate outstanding work. Browser budgeting stays manual.

## Test

- On a phone with system AI ready: Settings should identify Apple Intelligence/Gemini Nano; no fallback download starts.
- Without system AI: open on Wi-Fi, watch installation, then type “taxi fare”, “dentist visit”, “movie tickets” and “supermarket groceries”. Check suggestions and manual override preservation.
- Relaunch in airplane mode after installation. Repeat classification/chat; on iOS scan clear receipts and verify auto-add/Undo.
- Try first launch offline, pause/relaunch/retry, mobile data, low storage and an interrupted download. Budgeting must remain usable and partial weights must never load.
- Unit tests exercise acquisition, corruption, cancellation, concurrency, offline reuse and output boundaries; native Swift tests check real SHA-256/file truncation. iOS/Android CI compiles the bridges/runtime. Real device performance and system-model behavior still need physical-device testing.

Sources: [Google Nano setup/availability](https://developers.google.com/ml-kit/genai/prompt/android/get-started), [LiteRT-LM](https://developers.google.com/edge/litert-lm/overview), [Qwen3 model card](https://huggingface.co/Qwen/Qwen3-0.6B), [pinned downloadable weights](https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/tree/60b85c0e3d8fe0f6474f406922a26d12aca4550d), [Gemma model card](https://huggingface.co/google/gemma-3-270m-it), [llama.rn](https://github.com/mybigday/llama.rn).
