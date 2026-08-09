#!/usr/bin/env bash
# =============================================================================
# Скачивает корневой сертификат РУЦ для GigaChat OAuth endpoint
# =============================================================================
# Запустить ОДИН раз на сервере:
#   cd ~/prjs/nuadvi-server && bash scripts/setup-gigachat-cert.sh
#
# Сертификат сохраняется в certs/russian-trusted-root.pem
# и автоматически подхватывается провайдером GigaChat при запуске.
# =============================================================================

set -euo pipefail

CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "${CERTS_DIR}"

TARGET="${CERTS_DIR}/russian-trusted-root.pem"
OAUTH_HOST="ngw.devices.sberbank.ru:9443"

echo "=== Настройка сертификата для GigaChat OAuth ==="
echo ""

# Method 1: Extract from the OAuth endpoint itself
echo "1. Получаем цепочку сертификатов с ${OAUTH_HOST}..."
if echo | timeout 10 openssl s_client -connect "${OAUTH_HOST}" -showcerts 2>/dev/null \
    | awk '/-----BEGIN/,/-----END/ {print}' > "${TARGET}"; then
    if [[ -s "${TARGET}" ]]; then
        cert_count=$(grep -c '-----BEGIN CERTIFICATE-----' "${TARGET}" || true)
        echo "   Получено ${cert_count} сертификатов из цепочки"
    fi
fi

# Method 2: Try Russian Trusted Root CA from official source
if ! grep -q 'BEGIN CERTIFICATE' "${TARGET}" 2>/dev/null; then
    echo "2. Скачиваем корневой сертификат РУЦ с cryptopro.ru..."
    curl -sSLk --max-time 10 \
        "https://root.cryptopro.ru/CertEnroll/root.cer" \
        -o "${TARGET}" 2>/dev/null || true
    if [[ -s "${TARGET}" ]]; then
        echo "   Скачано"
    else
        rm -f "${TARGET}"
    fi
fi

# Verify
if [[ -f "${TARGET}" ]] && grep -q 'BEGIN CERTIFICATE' "${TARGET}"; then
    cert_count=$(grep -c 'BEGIN CERTIFICATE' "${TARGET}" || true)
    echo ""
    echo "✅ Сертификат(ы) сохранены: ${TARGET} (${cert_count} шт.)"
    echo ""
    echo "Проверка подключения к GigaChat OAuth:"
    echo | openssl s_client -connect "${OAUTH_HOST}" \
        -CAfile "${TARGET}" -brief 2>&1 | head -5 || true
    echo ""
    echo "Теперь пересобери и перезапусти сервер:"
    echo "  ./deploy.sh build && ./deploy.sh restart"
else
    echo ""
    echo "❌ Не удалось получить сертификат автоматически"
    echo ""
    echo "Ручной вариант:"
    echo "  1. На сервере: openssl s_client -connect ngw.devices.sberbank.ru:9443 -showcerts < /dev/null"
    echo "  2. Скопируй вывод (от BEGIN до END) в файл certs/russian-trusted-root.pem"
    echo ""
    echo "Или установи в систему:"
    echo "  sudo apt install ca-certificates"
    echo "  sudo update-ca-certificates"
fi
