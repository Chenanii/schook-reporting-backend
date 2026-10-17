import { env } from '../config/env.js';

export async function sendTextBeeSms({ to, message }) {
  if (!env.TEXTBEE_API_KEY || !env.TEXTBEE_DEVICE_ID) {
    throw new Error('TextBee SMS is not configured. Set TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID.');
  }

  const endpoint = new URL(
    `gateway/devices/${encodeURIComponent(env.TEXTBEE_DEVICE_ID)}/send-sms`,
    `${env.TEXTBEE_API_BASE_URL.replace(/\/+$/, '')}/`,
  );
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.TEXTBEE_API_KEY,
    },
    body: JSON.stringify({ recipients: [to], message }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`TextBee SMS delivery failed with status ${response.status}.`);
  }
}
