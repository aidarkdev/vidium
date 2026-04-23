/**
 * lang.ts — i18n strings.
 * Server bakes UI_LANG into the page; client reads it from there.
 */

export type Lang = 'en' | 'ru';

const strings: Record<Lang, Record<string, string>> = {
  en: {
    // Nav
    'nav.logout': 'Log out',

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
    'tag.ready': 'Ready',
    'tag.all': 'All',
    'sidebar.edit': 'Edit',
    'sidebar.move_up': 'Move up',
    'sidebar.move_down': 'Move down',

    // Player
    'player.back': 'Back',

    // Add video
    'video.add': '+video',
    'video.add.placeholder': 'https://www.youtube.com/watch?v=...',
    'video.added': 'Video added',
    'video.exists': 'Video already exists',
    'video.error': 'Error adding video',

    // Add channel
    'channel.add': '+channel',
    'channel.add.placeholder': 'https://www.youtube.com/@channel',
    'channel.add.display_name_placeholder': 'Display name',
    'channel.add.tags_placeholder': 'tag1,tag2',
    'channel.added': 'Channel added — crawling started',
    'channel.exists': 'Channel already exists',
    'channel.error': 'Error adding channel',
  },

  ru: {
    // Nav
    'nav.logout': 'Выйти',

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
    'tag.ready': 'Готовое',
    'tag.all': 'Все',
    'sidebar.edit': 'Редакт.',
    'sidebar.move_up': 'Выше',
    'sidebar.move_down': 'Ниже',

    // Player
    'player.back': 'Назад',

    // Add video
    'video.add': '+видео',
    'video.add.placeholder': 'https://www.youtube.com/watch?v=...',
    'video.added': 'Видео добавлено',
    'video.exists': 'Видео уже есть',
    'video.error': 'Ошибка добавления видео',

    // Add channel
    'channel.add': '+канал',
    'channel.add.placeholder': 'https://www.youtube.com/@channel',
    'channel.add.display_name_placeholder': 'Название в боковой панели',
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
