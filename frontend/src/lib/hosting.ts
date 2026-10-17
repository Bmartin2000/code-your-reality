import { useCapabilities } from './queries'

/** Privacy copy that matches the actual deployment: local Ollama or Ollama Cloud. */
export function useAiHosting() {
  const caps = useCapabilities()
  const cloud = !!caps.data?.model.cloud
  return {
    cloud,
    short: cloud ? 'Open Gemma model via Ollama Cloud' : 'AI runs on our own server',
    privacy: cloud
      ? 'Your video stays on the Code Your Reality server. Only the transcript and a few still frames are sent to Ollama Cloud for analysis.'
      : 'Your video and its analysis stay on the Code Your Reality server. Nothing is sent to a cloud AI service.',
    engine: cloud ? 'Google’s open Gemma model, run through Ollama Cloud' : 'Google’s open Gemma model, running on the Code Your Reality server through Ollama',
  }
}
