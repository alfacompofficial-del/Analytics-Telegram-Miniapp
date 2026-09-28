const telegram = window.Telegram?.WebApp;
const elements = Object.fromEntries([
  'notice', 'display-name', 'username', 'profile-id-label', 'full-name', 'telegram-id',
  'profile-username', 'language-code', 'premium-value', 'premium-badge', 'photo-count',
  'first-name', 'last-name', 'account-type', 'write-access', 'attachment-status',
  'email-value', 'birthday-value', 'registration-value', 'platform-value', 'app-version',
  'theme-value', 'chat-type', 'auth-time', 'start-parameter', 'viewport-height', 'api-status', 'supabase-status',
  'avatar', 'avatar-fallback', 'gallery', 'photo-strip', 'contact-button', 'phone-status',
  'location-button', 'location-status', 'location-result', 'location-coordinates', 'map-link',
  'write-button', 'write-status', 'refresh-button',
].map((id) => [id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()), document.getElementById(id)]));

let profile = null;
function showNotice(message, tone = 'error') {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
  elements.notice.hidden = false;
}

function setButtonState(button, text, disabled = false) {
  button.replaceChildren(document.createTextNode(text));
  button.disabled = disabled;
}

function getInitData() {
  return telegram?.initData || '';
}

function getClientProfile() {
  const launchData = telegram?.initDataUnsafe;
  const user = launchData?.user;
  if (!user) return null;

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
    photoUrls: user.photo_url ? [user.photo_url] : [],
    photoCount: null,
    contact: null,
    platform: telegram.platform || '',
    appVersion: telegram.version || '',
    theme: telegram.colorScheme || '',
    chatType: launchData.chat_type || '',
    authDate: Number(launchData.auth_date) || null,
    startParam: launchData.start_param || '',
    viewportHeight: Number(telegram.viewportStableHeight || telegram.viewportHeight) || null,
  };
}

function formatOptionalBoolean(value) {
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  return 'Нет данных';
}

function formatAuthDate(timestamp) {
  if (!timestamp) return 'Не предоставлено';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return 'Не предоставлено';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось загрузить данные.');
  return result;
}

function renderProfile(data) {
  profile = data;
  const name = [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Пользователь Telegram';
  const username = data.username ? `@${data.username}` : 'Имя пользователя не задано';
  const photoUrls = Array.isArray(data.photoUrls) ? data.photoUrls : [];

  elements.displayName.textContent = name;
  elements.username.textContent = username;
  elements.profileIdLabel.textContent = `TG / ${data.id}`;
  elements.firstName.textContent = data.firstName || 'Не указано';
  elements.lastName.textContent = data.lastName || 'Не указана';
  elements.telegramId.textContent = String(data.id);
  elements.profileUsername.textContent = data.username ? `@${data.username}` : 'Не задано';
  elements.languageCode.textContent = data.languageCode || 'Не указано';
  elements.premiumValue.textContent = data.isPremium === true ? 'Активен' : data.isPremium === false ? 'Не активен' : 'Нет данных';
  elements.accountType.textContent = data.isBot ? 'Бот' : 'Пользователь';
  elements.writeAccess.textContent = formatOptionalBoolean(data.allowsWriteToPm);
  elements.attachmentStatus.textContent = formatOptionalBoolean(data.addedToAttachmentMenu);
  elements.emailValue.textContent = 'Не предоставляет Telegram';
  elements.birthdayValue.textContent = 'Не предоставляет Telegram';
  elements.registrationValue.textContent = 'Не предоставляет Telegram';
  elements.premiumBadge.hidden = data.isPremium !== true;
  elements.platformValue.textContent = data.platform || 'Не указано';
  elements.appVersion.textContent = data.appVersion || 'Не указано';
  elements.themeValue.textContent = data.theme === 'dark' ? 'Тёмная' : data.theme === 'light' ? 'Светлая' : data.theme || 'Не указана';
  elements.chatType.textContent = ({ private: 'Личный чат', group: 'Группа', supergroup: 'Супергруппа', channel: 'Канал' })[data.chatType] || data.chatType || 'Не указано';
  elements.authTime.textContent = formatAuthDate(data.authDate);
  elements.startParameter.textContent = data.startParam || 'Не задан';
  elements.viewportHeight.textContent = data.viewportHeight ? `${Math.round(data.viewportHeight)} px` : 'Не указана';

  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  elements.avatarFallback.textContent = initials || '?';
  if (photoUrls.length) {
    elements.avatar.src = photoUrls[0];
    elements.avatar.alt = `Фото профиля: ${name}`;
    elements.avatar.hidden = false;
    elements.avatarFallback.hidden = true;
  } else {
    elements.avatar.hidden = true;
    elements.avatarFallback.hidden = false;
  }

  elements.photoCount.textContent = data.photoCount === null
    ? photoUrls.length ? 'Фото профиля доступно' : 'Нет данных от API'
    : `${data.photoCount} ${data.photoCount === 1 ? 'фото' : 'фото'}`;
  elements.gallery.replaceChildren();
  elements.photoStrip.replaceChildren();
  if (photoUrls.length) {
    photoUrls.forEach((url, index) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      const image = document.createElement('img');
      image.src = url;
      image.alt = `Фото профиля ${index + 1}`;
      image.loading = 'lazy';
      item.append(image);
      elements.gallery.append(item);

      const thumbnail = document.createElement('img');
      thumbnail.src = url;
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      elements.photoStrip.append(thumbnail);
    });
    elements.photoStrip.hidden = photoUrls.length < 2;
  } else {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = data.photoCount === null
      ? 'Дополнительная история фотографий доступна после подключения Bot API-сервера.'
      : 'У аккаунта пока нет фотографий профиля.';
    elements.gallery.append(empty);
    elements.photoStrip.hidden = true;
  }

  if (data.contact) {
    elements.phoneStatus.textContent = data.contact;
    setButtonState(elements.contactButton, 'Номер предоставлен', true);
  }
  if (data.allowsWriteToPm) {
    elements.writeStatus.textContent = 'Бот может отправлять сообщения';
    setButtonState(elements.writeButton, 'Разрешение предоставлено', true);
  }
}

async function loadProfile() {
  const clientProfile = getClientProfile();
  if (!getInitData() || !clientProfile) {
    showNotice('Откройте приложение через кнопку бота в Telegram. В обычном браузере Telegram не передаёт данные аккаунта.');
    elements.displayName.textContent = 'Профиль недоступен';
    elements.gallery.innerHTML = '<p class="gallery-empty">Для проверки профиля откройте Mini App внутри Telegram.</p>';
    return;
  }

  renderProfile(clientProfile);
  setButtonState(elements.refreshButton, '…', true);
  elements.apiStatus.textContent = 'Подключение…';
  try {
    const result = await postJson('/api/profile', { initData: getInitData() });
    renderProfile({
      ...clientProfile,
      ...result.profile,
      photoUrls: result.profile.photoUrls?.length ? result.profile.photoUrls : clientProfile.photoUrls,
    });
    elements.apiStatus.textContent = 'Подключён';
    const storage = result.storage || {};
    if (!storage.configured) {
      elements.supabaseStatus.textContent = 'Ключ не настроен';
      showNotice('Профиль загружен. Для записи в Supabase добавьте серверный secret key и выполните supabase/schema.sql.', 'info');
    } else if (storage.saved) {
      elements.supabaseStatus.textContent = 'Сохранён';
      elements.notice.hidden = true;
    } else {
      elements.supabaseStatus.textContent = storage.errorCode === '42P01' ? 'Нет таблицы' : 'Ошибка записи';
      showNotice('Профиль загружен, но не сохранён в Supabase. Проверьте secret key и таблицу telegram_profiles.', 'info');
    }
  } catch {
    elements.apiStatus.textContent = 'Не подключён';
    elements.supabaseStatus.textContent = 'API недоступен';
    elements.phoneStatus.textContent = 'Для передачи контакта нужен API-сервер';
    setButtonState(elements.contactButton, 'Сервер недоступен', true);
    showNotice('Основные данные загружены из Telegram. История фото и номер телефона появятся после подключения API-сервера.', 'info');
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.innerHTML = '<span aria-hidden="true">↻</span>';
    elements.refreshButton.setAttribute('aria-label', 'Обновить профиль');
  }
}

async function refreshContact() {
  const result = await postJson('/api/contact', { initData: getInitData() });
  if (result.phoneNumber) {
    elements.phoneStatus.textContent = result.phoneNumber;
    setButtonState(elements.contactButton, 'Номер предоставлен', true);
    showNotice('Номер телефона получен от Telegram и привязан к вашему аккаунту.', 'success');
    return true;
  }
  return false;
}

elements.refreshButton.addEventListener('click', loadProfile);

elements.contactButton.addEventListener('click', async () => {
  if (!telegram?.requestContact) {
    showNotice('Запрос номера доступен только в актуальной версии Telegram.');
    return;
  }

  setButtonState(elements.contactButton, 'Ожидаем подтверждение…', true);
  try {
    const accepted = await telegram.requestContact();
    if (!accepted) {
      elements.phoneStatus.textContent = 'Доступ не предоставлен';
      setButtonState(elements.contactButton, 'Попробовать снова');
      return;
    }

    elements.phoneStatus.textContent = 'Ожидаем сообщение от Telegram…';
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        if (await refreshContact()) return;
      } catch (error) {
        showNotice(error.message);
        setButtonState(elements.contactButton, 'Попробовать снова');
        return;
      }
      if (attempts < 12) window.setTimeout(poll, 1200);
      else {
        elements.phoneStatus.textContent = 'Telegram не передал номер боту';
        setButtonState(elements.contactButton, 'Попробовать снова');
      }
    };
    window.setTimeout(poll, 800);
  } catch {
    elements.phoneStatus.textContent = 'Доступ не предоставлен';
    setButtonState(elements.contactButton, 'Поделиться номером');
  }
});

elements.locationButton.addEventListener('click', () => {
  const locationManager = telegram?.LocationManager;
  if (!locationManager) {
    showNotice('Геолокация доступна только внутри Telegram на поддерживаемом устройстве.');
    return;
  }

  setButtonState(elements.locationButton, 'Запрашиваем…', true);
  elements.locationStatus.textContent = 'Ожидаем разрешение Telegram';

  const readLocation = () => {
    if (!locationManager.isLocationAvailable) {
      elements.locationStatus.textContent = 'Геолокация недоступна на устройстве';
      setButtonState(elements.locationButton, 'Попробовать снова');
      return;
    }

    locationManager.getLocation((location) => {
      if (!location) {
        elements.locationStatus.textContent = 'Доступ не предоставлен';
        setButtonState(elements.locationButton, 'Поделиться геопозицией');
        return;
      }

      const latitude = Number(location.latitude).toFixed(5);
      const longitude = Number(location.longitude).toFixed(5);
      elements.locationStatus.textContent = 'Точные координаты доступны только в этом окне';
      elements.locationCoordinates.textContent = `${latitude}, ${longitude}`;
      elements.mapLink.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=16/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
      elements.locationResult.hidden = false;
      setButtonState(elements.locationButton, 'Местоположение получено', true);
    });
  };

  if (locationManager.isInited) readLocation();
  else locationManager.init(() => readLocation());
});

elements.writeButton.addEventListener('click', () => {
  if (!telegram?.requestWriteAccess) {
    showNotice('Запрос разрешения на сообщения недоступен в этой версии Telegram.');
    return;
  }

  setButtonState(elements.writeButton, 'Ожидаем подтверждение…', true);
  telegram.requestWriteAccess((granted) => {
    if (granted) {
      elements.writeStatus.textContent = 'Бот может отправлять сообщения';
      setButtonState(elements.writeButton, 'Разрешение предоставлено', true);
      showNotice('Вы разрешили боту отправлять вам сообщения.', 'success');
    } else {
      elements.writeStatus.textContent = 'Разрешение не предоставлено';
      setButtonState(elements.writeButton, 'Разрешить сообщения');
    }
  });
});

if (telegram) {
  telegram.ready();
  telegram.expand();
}

const quickTabs = [...document.querySelectorAll('.quick-tab')];
const profileSections = [...document.querySelectorAll('.data-section[id]')];

function setActiveTab(sectionId) {
  quickTabs.forEach((tab) => {
    const isActive = tab.hash === `#${sectionId}`;
    tab.classList.toggle('is-active', isActive);
    if (isActive) tab.setAttribute('aria-current', 'location');
    else tab.removeAttribute('aria-current');
  });
}

function syncActiveTab() {
  const atPageEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (atPageEnd) {
    setActiveTab(profileSections[profileSections.length - 1]?.id);
    return;
  }

  const marker = window.innerHeight * 0.38;
  const passedSections = profileSections.filter((section) => section.getBoundingClientRect().top <= marker);
  setActiveTab(passedSections[passedSections.length - 1]?.id || profileSections[0]?.id);
}

quickTabs.forEach((tab) => tab.addEventListener('click', () => setActiveTab(tab.hash.slice(1))));
window.addEventListener('scroll', syncActiveTab, { passive: true });
window.addEventListener('resize', syncActiveTab);
syncActiveTab();

loadProfile();