#!/usr/bin/env bash
# Переносит 10 последних .png из ~/Downloads в ./Materials/illustrations,
# переименовывая в 1.png..10.png в порядке скачивания (1 = самый ранний).

set -euo pipefail

SRC="$HOME/Downloads"
DEST="./Materials/illustrations"

mkdir -p "$DEST"

# Собираем 10 самых свежих .png, от старого к новому.
# Нуль-разделители — чтобы корректно handling имена с пробелами/скобками.
mapfile -d '' -t files < <(
    find "$SRC" -maxdepth 1 -type f -iname '*.png' -printf '%T@ %p\0' \
        | sort -zn \
        | tail -zn 10 \
        | cut -zd ' ' -f2-
)

if (( ${#files[@]} == 0 )); then
    echo "Ошибка: в $SRC нет ни одного .png файла." >&2
    exit 1
fi

if (( ${#files[@]} != 10 )); then
    echo "Внимание: ожидалось 10 файлов, найдено ${#files[@]}. Обрабатываю сколько есть." >&2
fi

i=1
for f in "${files[@]}"; do
    echo "[$i] $(basename "$f")  ->  $DEST/$i.png"
    mv -f -- "$f" "$DEST/$i.png"
    i=$((i + 1))
done

echo "Готово: файлов перемещено — ${#files[@]}."
