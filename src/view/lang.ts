/**
 * lang.ts — i18n strings.
 * Server bakes UI_LANG into the page; client reads it from there.
 */

export type Lang = 'en' | 'ru';

const strings: Record<Lang, Record<string, string>> = {
  en: {
    // Nav
    'nav.all': 'All',
    'nav.logout': 'Log out',
    'nav.edit_tags': 'tags',

    // Auth
    'auth.login': 'Log in',
    'auth.register': 'Register',
    'auth.login.title': 'Log in — vidium',
    'auth.register.title': 'Register — vidium',
    'auth.field.invite': 'Invite code',
    'auth.field.login': 'Login',
    'auth.field.password': 'Password',
    'auth.invite': 'Invite code',
    'auth.password': 'Password',
    'auth.error.invalid': 'Invalid login or password',
    'auth.error.invite': 'Invalid invite code',
    'auth.error.taken': 'Login already taken',
    'auth.error.ratelimit': 'Too many attempts, try again later',

    // Card
    'card.watch': 'Watch',
    'card.listen': 'Listen',
    'card.download.video': 'Download video',
    'card.download.audio': 'Download audio',
    'card.queued': 'Queued',
    'card.downloading': 'Downloading',

    // Feed
    'feed.load_more': 'Load more',
    'feed.all': 'All',
    'tag.ready': 'Ready',
    'tag.all': 'All',
    'tag.manual': 'manual',

    // Player
    'player.back': 'Back to feed',

    // Add video
    'video.add': '+video',
    'video.add.placeholder': 'https://www.youtube.com/watch?v=...',
    'video.added': 'Video added',
    'video.exists': 'Video already exists',
    'video.error': 'Error adding video',

    // Add channel
    'channel.add': '+channel',
    'channel.add.placeholder': 'https://www.youtube.com/@channel',
    'channel.add.tags_placeholder': 'tag1,tag2',
    'channel.added': 'Channel added — crawling started',
    'channel.exists': 'Channel already exists',
    'channel.error': 'Error adding channel',
  },

  ru: {
    // Nav
    'nav.all': 'Все',
    'nav.logout': 'Выйти',
    'nav.edit_tags': 'теги',

    // Auth
    'auth.login': 'Войти',
    'auth.register': 'Регистрация',
    'auth.login.title': 'Войти — vidium',
    'auth.register.title': 'Регистрация — vidium',
    'auth.field.invite': 'Инвайт-код',
    'auth.field.login': 'Логин',
    'auth.field.password': 'Пароль',
    'auth.invite': 'Инвайт-код',
    'auth.password': 'Пароль',
    'auth.error.invalid': 'Неверный логин или пароль',
    'auth.error.invite': 'Неверный инвайт-код',
    'auth.error.taken': 'Логин уже занят',
    'auth.error.ratelimit': 'Слишком много попыток, попробуйте позже',

    // Card
    'card.watch': 'Смотреть',
    'card.listen': 'Слушать',
    'card.download.video': 'Скачать видео',
    'card.download.audio': 'Скачать аудио',
    'card.queued': 'В очереди',
    'card.downloading': 'Загружается',

    // Feed
    'feed.load_more': 'Загрузить ещё',
    'feed.all': 'Все',
    'tag.ready': 'Готовое',
    'tag.all': 'Все',
    'tag.manual': 'manual',

    // Player
    'player.back': 'Назад к ленте',

    // Add video
    'video.add': '+видео',
    'video.add.placeholder': 'https://www.youtube.com/watch?v=...',
    'video.added': 'Видео добавлено',
    'video.exists': 'Видео уже есть',
    'video.error': 'Ошибка добавления видео',

    // Add channel
    'channel.add': '+канал',
    'channel.add.placeholder': 'https://www.youtube.com/@channel',
    'channel.add.tags_placeholder': 'тег1,тег2',
    'channel.added': 'Канал добавлен — краулинг запущен',
    'channel.exists': 'Канал уже добавлен',
    'channel.error': 'Ошибка добавления канала',
  },
};

export function t(lang: string, key: string): string {
  const l = (strings[lang as Lang] ? lang : 'en') as Lang;
  return strings[l][key] ?? key;
}
