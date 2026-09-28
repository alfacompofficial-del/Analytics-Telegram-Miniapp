require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const botToken = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = process.env.SUPABASE_URL && supabaseSecretKey
  ? createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null;
const port = Number(process.env.PORT) || 3000;
const publicDirectory = path.join(__dirname, '..', 'public');
const app = express();
const profilePhotoKeys = new Map();
const sharedContacts = new Map();
const PHOTO_KEY_TTL_MS = 15 * 60 * 1000;
const CONTACT_TTL_MS = 30 * 60 * 1000;
const INIT_DATA_TTL_SECONDS = 24 * 60 * 60;

if (!botToken) {
  throw new Error('BOT_TOKEN is required. Add it to the environment before starting the app.');
}

const bot = new Telegraf(botToken);

function serializeTelegramUser(user) {
  return {
    id: user.id,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || '',
    languageCode: user.language_code || '',
    isPremium: typeof user.is_premium === 'boolean' ? user.is_premium : null,
    isBot: Boolean(user.is_bot),
    allowsWriteToPm: typeof user.allows_write_to_pm === 'boolean' ? user.allows_write_to_pm : null,
    addedToAttachmentMenu: typeof user.added_to_attachment_menu === 'boolean' ? user.added_to_attachment_menu : null,
  };
}

async function saveTelegramProfile(profile, source) {
  if (!supabase) return { configured: false, saved: false, errorCode: null };

  const timestamp = new Date().toISOString();
  const row = {
    telegram_user_id: profile.id,
    first_name: profile.firstName,
    last_name: profile.lastName,
    username: profile.username || null,
    language_code: profile.languageCode || null,
    is_premium: profile.isPremium,
    is_bot: profile.isBot,
    allows_write_to_pm: profile.allowsWriteToPm,
    added_to_attachment_menu: profile.addedToAttachmentMenu,
    last_seen_source: source,
    last_seen_at: timestamp,
    updated_at: timestamp,
  };

  try {
    const { error } = await supabase
      .from('telegram_profiles')
      .upsert(row, { onConflict: 'telegram_user_id' });
    if (error) {
      console.error('Supabase profile sync failed:', error.code || 'database_error');
      return { configured: true, saved: false, errorCode: error.code || 'database_error' };
    }
    return { configured: true, saved: true, errorCode: null };
  } catch {
    console.error('Supabase profile sync failed: connection_error');
    return { configured: true, saved: false, errorCode: 'connection_error' };
  }
}

function validateInitData(initData) {
  if (typeof initData !== 'string' || initData.length === 0 || initData.length > 16_384) {
    throw new Error('Telegram authorization data is missing. Open this page inside Telegram.');
  }

  const fields = new URLSearchParams(initData);
  const receivedHash = fields.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error('Telegram authorization data is invalid. Reopen the Mini App.');
  }

  fields.delete('hash');
  const checkString = [...fields.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest();
  const actualHash = Buffer.from(receivedHash, 'hex');

  if (actualHash.length !== expectedHash.length || !crypto.timingSafeEqual(actualHash, expectedHash)) {
    throw new Error('Telegram authorization signature is invalid. Reopen the Mini App.');
  }

  const authDate = Number(fields.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > INIT_DATA_TTL_SECONDS) {
    throw new Error('Telegram authorization has expired. Reopen the Mini App.');
  }

  let user;
  try {
    user = JSON.parse(fields.get('user') || 'null');
  } catch {
    throw new Error('Telegram profile data could not be read. Reopen the Mini App.');
  }

  if (!user || !Number.isSafeInteger(user.id)) {
    throw new Error('Telegram did not provide a valid user profile.');
  }

  return user;
}

function requireTelegramUser(req, res, next) {
  try {
    req.telegramUser = validateInitData(req.body?.initData);
    next();
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

function purgeExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of profilePhotoKeys) {
    if (entry.expiresAt <= now) profilePhotoKeys.delete(key);
  }
  for (const [userId, entry] of sharedContacts) {
    if (entry.expiresAt <= now) sharedContacts.delete(userId);
  }
}

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(publicDirectory));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', supabaseConfigured: Boolean(supabase) });
});

app.post('/api/profile', requireTelegramUser, async (req, res) => {
  const user = req.telegramUser;
  const profile = {
    ...serializeTelegramUser(user),
    photoUrls: [],
    photoCount: null,
    contact: null,
  };

  purgeExpiredEntries();
  const contact = sharedContacts.get(user.id);
  if (contact) profile.contact = contact.phoneNumber;

  try {
    const photos = await bot.telegram.getUserProfilePhotos(user.id, 0, 10);
    profile.photoCount = photos.total_count;

    for (const photoSizes of photos.photos) {
      const largestPhoto = photoSizes[photoSizes.length - 1];
      const key = crypto.randomBytes(24).toString('base64url');
      profilePhotoKeys.set(key, {
        fileId: largestPhoto.file_id,
        expiresAt: Date.now() + PHOTO_KEY_TTL_MS,
      });
      profile.photoUrls.push(`/api/avatar/${key}`);
    }
  } catch (error) {
    console.warn('Telegram profile photos are not available for this user.');
  }

  const storage = await saveTelegramProfile(profile, 'mini_app');
  res.json({ profile, storage });
});

app.post('/api/contact', requireTelegramUser, (req, res) => {
  purgeExpiredEntries();
  const contact = sharedContacts.get(req.telegramUser.id);
  res.json({ phoneNumber: contact?.phoneNumber || null });
});

app.get('/api/avatar/:key', async (req, res) => {
  purgeExpiredEntries();
  const entry = profilePhotoKeys.get(req.params.key);
  if (!entry) return res.sendStatus(404);

  try {
    const fileUrl = await bot.telegram.getFileLink(entry.fileId);
    const response = await fetch(fileUrl);
    if (!response.ok) return res.sendStatus(502);

    res.set('Cache-Control', 'private, max-age=300');
    res.type(response.headers.get('content-type') || 'image/jpeg');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.sendStatus(502);
  }
});

bot.start(async (ctx) => {
  const firstName = ctx.from?.first_name || 'друг';
  if (ctx.from) void saveTelegramProfile(serializeTelegramUser(ctx.from), 'bot_start');
  if (!webAppUrl) {
    return ctx.reply(`Привет, ${firstName}! Mini App пока не подключён. Администратору нужно задать HTTPS-адрес в WEB_APP_URL.`);
  }

  return ctx.reply(
    `Привет, ${firstName}! Открой свой Telegram-профиль в Mini App. Данные появятся после запуска приложения, а контакт и геолокация запрашиваются отдельно только с твоего согласия.`,
    Markup.inlineKeyboard([Markup.button.webApp('Открыть мой профиль', webAppUrl)]),
  );
});

bot.help((ctx) => ctx.reply('Открой Mini App через /start. Контакт и местоположение передаются только после отдельного подтверждения.'));

bot.on('message', async (ctx, next) => {
  const message = ctx.message;
  if (!message || !('contact' in message)) return next();

  const contact = message.contact;
  if (contact.user_id && contact.user_id === ctx.from.id) {
    sharedContacts.set(ctx.from.id, {
      phoneNumber: contact.phone_number,
      expiresAt: Date.now() + CONTACT_TTL_MS,
    });
  }
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Mini App server listening on port ${port}`);
});

bot.launch().catch((error) => {
  console.error('Telegram bot failed to start. Check BOT_TOKEN and network access.');
  console.error(error.message);
  server.close(() => process.exit(1));
});

function shutdown(signal) {
  bot.stop(signal);
  server.close(() => process.exit(0));
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
