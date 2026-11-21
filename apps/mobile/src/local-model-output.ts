export const localGenerationOptions = {
  jinja: true,
  enable_thinking: false,
  reasoning_format: 'auto' as const,
  chat_template_kwargs: { enable_thinking: false },
};
export function localCompletionText(output: {
  text: string;
  content?: string;
  truncated?: boolean;
  stopped_limit?: number;
  interrupted?: boolean;
}) {
  if (output.truncated || output.stopped_limit || output.interrupted)
    throw new Error('Local AI could not finish. Try a shorter message.');
  // llama.rn's raw text can contain Qwen's reasoning delimiters. Its parsed
  // content is the actual answer, matching the REST benchmark's message.content.
  // Some llama.rn/Qwen combinations return the ChatML assistant envelope in
  // raw text without a parsed content field. Remove only that known framing.
  const text = (output.content ?? output.text)
    .trim()
    .replace(/^<\|im_start\|>assistant\r?\n/, '')
    .replace(/<\|im_end\|>$/, '')
    .trim();
  if (!text) throw new Error('Local AI could not answer. Try a shorter message.');
  return text;
}
