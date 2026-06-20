import { writeFile } from 'node:fs/promises';

const BASE_URL = 'https://api.elevenlabs.io/v1';

/**
 * Generate narration audio for a single text string and write it to `outPath`.
 *
 * @param {object}  opts
 * @param {string}  opts.text        Script text to narrate.
 * @param {string}  opts.outPath     Where to write the mp3.
 * @param {object}  opts.config      Merged config (see lib/config.js).
 * @param {object}  [opts.logger]    Optional logger.
 */
export async function generateAudio({ text, outPath, config, logger }) {
  const { apiKey, voiceId, modelId, outputFormat, voiceSettings } =
    config.elevenlabs;

  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set (.env).');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID is not set (.env).');
  if (!modelId) throw new Error('ELEVENLABS_MODEL_ID is not set (.env).');

  const url = `${BASE_URL}/text-to-speech/${voiceId}?output_format=${encodeURIComponent(
    outputFormat
  )}`;

  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarityBoost,
      style: voiceSettings.style,
      use_speaker_boost: voiceSettings.useSpeakerBoost
    }
  };

  logger?.debug(
    `POST ${url} (model=${modelId}, voice=${voiceId}, format=${outputFormat})`
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `ElevenLabs API error ${res.status} ${res.statusText}${
        detail ? `: ${detail}` : ''
      }`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('ElevenLabs returned an empty audio response.');
  }

  await writeFile(outPath, buffer);
  return { bytes: buffer.length };
}
