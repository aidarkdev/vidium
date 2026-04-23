export function renderBakedScript(
  langJson: string,
  stringsJson: string,
  cardsJson: string,
  since: number,
): string {
  return `<script>
const UI_LANG = ${langJson};
const UI_STRINGS = ${stringsJson};
const CARDS = ${cardsJson};
const SINCE = ${since};
</script>`;
}
