import type { ModelSpec } from './local-model-store';
import notices from './local-model-notices.json';
// Pin both the repository revision and weight digest; never execute remote code.
export const localModel: ModelSpec = {
  id: 'qwen3-06b-q4km-v1',
  name: 'Qwen3 0.6B',
  url: 'https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/resolve/60b85c0e3d8fe0f6474f406922a26d12aca4550d/Qwen_Qwen3-0.6B-Q4_K_M.gguf',
  bytes: 484220320,
  sha256: '9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14',
  notices,
};
