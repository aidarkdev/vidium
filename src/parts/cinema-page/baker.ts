import { cinemaPage, cinemaFileReady, cinemaPath } from '../../lib/cinema.ts';
import { t } from '../../pages/lang.ts';

export interface CinemaContext {
  lang: string;
  isAdmin: boolean;
  page: number;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function bakeCinemaPage(ctx: CinemaContext) {
  const page = cinemaPage(ctx.page);
  const labels = Object.fromEntries(
    [
      'title',
      'create',
      'create_hint',
      'library',
      'empty',
      'name',
      'add',
      'waiting',
      'watch',
      'delete',
      'confirm',
      'instructions',
      'error',
      'previous',
      'next',
    ].map((key) => [key, t(ctx.lang, `cinema.${key}`)]),
  );
  return {
    id: 'cinema-page',
    state: {
      ...page,
      items: page.items.map((video) => {
        const item = { ...video, ready: cinemaFileReady(video.uid) };
        if (!ctx.isAdmin) return item;
        const path = cinemaPath(video.uid);
        return {
          ...item,
          expectedPath: path,
          commands: `rsync -avP './film.mp4' ${quote(`SSH_TARGET:${path}.part`)}\n\nchown vidium:vidium ${quote(`${path}.part`)}\nchmod 0640 ${quote(`${path}.part`)}\nmv -n ${quote(`${path}.part`)} ${quote(path)}\ntest ! -e ${quote(`${path}.part`)}`,
        };
      }),
      isAdmin: ctx.isAdmin,
      labels,
      pending: false,
      error: '',
      locationHref: '',
    },
  };
}
