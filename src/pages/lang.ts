/**
 * lang.ts — i18n strings.
 * Server bakes localized strings into per-part state.
 */

type Lang = 'en' | 'ru';

const strings: Record<Lang, Record<string, string>> = {
  en: {
    // Nav
    'nav.logout': 'Log out',
    'nav.manage': 'Manage',
    'nav.controls': 'Controls',

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

    // Admin
    'admin.title': 'Management',
    'admin.jobs': 'Jobs queue',
    'admin.statuses': 'Video statuses',
    'admin.problem_rows': 'Active/problem statuses',
    'admin.downloaded': 'Downloaded videos',
    'admin.col.id': 'ID',
    'admin.col.type': 'Type',
    'admin.col.status': 'Status',
    'admin.col.attempts': 'Attempts',
    'admin.col.youtube_id': 'YouTube ID',
    'admin.col.error': 'Error',
    'admin.col.created_at': 'Created at',
    'admin.col.video': 'Video',
    'admin.col.audio': 'Audio',
    'admin.col.title': 'Title',
    'admin.col.ready_at': 'Ready at',
    'admin.col.actions': 'Actions',
    'admin.action.delete_files': 'Delete files',
    'admin.action.delete_video': 'Delete from DB',
    'admin.action.delete_job': 'Delete job',
    'admin.action.deleting': 'Deleting...',
    'admin.confirm.delete_files': 'Delete audio/video files for this row?',
    'admin.confirm.delete_video': 'Delete video from DB and files (and related jobs)?',
    'admin.confirm.delete_job': 'Delete this job row?',
    'admin.error.action_failed': 'Action failed',
    'admin.empty': 'No rows',
  },

  ru: {
    // Nav
    'nav.logout': 'Выйти',
    'nav.manage': 'Управление',
    'nav.controls': 'Действия',

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

    // Admin
    'admin.title': 'Управление',
    'admin.jobs': 'Очередь джобов',
    'admin.statuses': 'Статусы видео',
    'admin.problem_rows': 'Активные/проблемные статусы',
    'admin.downloaded': 'Скачанные видео',
    'admin.col.id': 'ID',
    'admin.col.type': 'Тип',
    'admin.col.status': 'Статус',
    'admin.col.attempts': 'Попытки',
    'admin.col.youtube_id': 'YouTube ID',
    'admin.col.error': 'Ошибка',
    'admin.col.created_at': 'Создано',
    'admin.col.video': 'Видео',
    'admin.col.audio': 'Аудио',
    'admin.col.title': 'Заголовок',
    'admin.col.ready_at': 'Готово в',
    'admin.col.actions': 'Действия',
    'admin.action.delete_files': 'Удалить файлы',
    'admin.action.delete_video': 'Удалить из БД',
    'admin.action.delete_job': 'Удалить джоб',
    'admin.action.deleting': 'Удаление...',
    'admin.confirm.delete_files': 'Удалить аудио/видео файлы для этой строки?',
    'admin.confirm.delete_video': 'Удалить видео из БД и файлы (и связанные джобы)?',
    'admin.confirm.delete_job': 'Удалить эту джобу?',
    'admin.error.action_failed': 'Ошибка действия',
    'admin.empty': 'Нет данных',
  },
};

export function t(lang: string, key: string): string {
  const l = (strings[lang as Lang] ? lang : 'en') as Lang;
  return strings[l][key] ?? key;
}
