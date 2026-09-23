import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Per-guild settings and open tickets persist to the FadeHost bot's /data
// volume, which survives restarts and redeploys.
const DATA_FILE = process.env.CONFIG_PATH || '/data/ticket-config.json';

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch {
    cache = { guilds: {} };
  }
  return cache;
}

export async function save() {
  try {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[ticket-bot] could not save config:', err.message);
  }
}

export async function getGuild(guildId) {
  const data = await load();
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      categoryId: (process.env.TICKET_CATEGORY_ID || '').trim() || null,
      logChannelId: (process.env.LOG_CHANNEL_ID || '').trim() || null,
      supportRoleId: (process.env.SUPPORT_ROLE_ID || '').trim() || null,
      welcome: (process.env.TICKET_MESSAGE || '').trim() || 'Thanks for opening a ticket. Describe what you need and someone from the team will be with you.',
      counter: 0,
      open: {},
    };
    await save();
  }
  return data.guilds[guildId];
}
