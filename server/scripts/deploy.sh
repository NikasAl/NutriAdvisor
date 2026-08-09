#!/usr/bin/env bash

set -euo pipefail

# ==============================================================================
# DEPLOY SCRIPT FOR NUTRIADVISOR LLM PROXY SERVER
# ==============================================================================
# Использование:
#   ./scripts/deploy.sh sync           # Синхронизировать файлы через rsync
#   ./scripts/deploy.sh build          # Собрать бинарник на удалённом хосте
#   ./scripts/deploy.sh restart        # Перезапустить сервер
#   ./scripts/deploy.sh all            # Полный деплой: sync → build → restart
#   ./scripts/deploy.sh logs           # Показать логи сервера
#   ./scripts/deploy.sh ssh            # Открыть SSH-сессию
#   ./scripts/deploy.sh status         # Проверить статус сервера
#
# Конфигурация через переменные окружения или значения по умолчанию
# ==============================================================================

# ---- SSH и удалённый хост ----------------------------------------------------
SSH_USER="${SSH_USER:-nikas}"
SSH_HOST="${SSH_HOST:-turbo}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_BASE="${REMOTE_BASE:-/home/nikas/prjs/nuadvi}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# ---- Проект -------------------------------------------------------------------
BINARY_NAME="nuadvi-proxy"
CONFIG_FILE="config.yaml"
PROD_CONFIG=".env.prod"

# ---- Секреты ----------------------------------------------------------------
# Локальный .env с ключами (не в git!) при deploy all копируется на сервер.
# Пример: server/.env
#   OPENROUTER_API_KEY=sk-or-v1-...
#   GIGACHAT_API_KEY=...


# ---- Локальные пути -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_ROOT="$(dirname "${SCRIPT_DIR}")"

# ---- Цвета --------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ==============================================================================

usage() {
    cat <<EOF
NutriAdvisor LLM Proxy — Deploy Script

Использование:
  $0 sync           Синхронизировать файлы через rsync
  $0 build          Собрать Go-бинарник на удалённом хосте
  $0 restart        Перезапустить сервер
  $0 all            Полный деплой: sync → build → restart
  $0 logs           Показать логи сервера (tail -f)
  $0 ssh            Открыть SSH-сессию
  $0 status         Проверить статус сервера
  $0 --help         Показать справку

Переменные окружения:
  SSH_USER      (${SSH_USER})
  SSH_HOST      (${SSH_HOST})
  SSH_PORT      (${SSH_PORT})
  REMOTE_BASE   (${REMOTE_BASE})
EOF
}

# ==============================================================================
# Helpers
# ==============================================================================

check_ssh() {
    info "Проверка соединения с ${SSH_USER}@${SSH_HOST}:${SSH_PORT}..."
    if ! ssh ${SSH_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "exit 0"; then
        error "Не удалось подключиться к удалённому хосту."
        exit 1
    fi
    info "Соединение установлено."
}

remote_run() {
    ssh ${SSH_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "$@"
}

# ==============================================================================
# Commands
# ==============================================================================

sync_files() {
    info "Синхронизация файлов сервера..."

    rsync -avz --delete \
        --exclude=.git \
        --exclude=data \
        --exclude="${BINARY_NAME}" \
        --exclude=*.db \
        --exclude=*.pid \
        --exclude=*.log \
        --exclude=vendor \
        --exclude=.env \
        --exclude=.env.prod \
        --exclude=certs/*.pem \
        --exclude=certs/*.crt \
        --exclude=certs/*.cer \
        -e "ssh -p ${SSH_PORT}" \
        "${SERVER_ROOT}/" \
        "${SSH_USER}@${SSH_HOST}:${REMOTE_BASE}/"

    info "Синхронизация завершена."
}

build_remote() {
    info "Сборка ${BINARY_NAME} на удалённом хосте..."

    remote_run bash -s <<REMOTE
cd "${REMOTE_BASE}"

# Проверка Go
if ! command -v go &>/dev/null; then
    echo "[INFO] Go не найден. Установка..."
    curl -sL https://go.dev/dl/go1.23.6.linux-amd64.tar.gz | sudo tar -C /usr/local -xzf -
    export PATH=\$PATH:/usr/local/go/bin
    echo 'export PATH=\$PATH:/usr/local/go/bin' >> ~/.bashrc
fi

echo "[INFO] Go: \$(go version)"

# Определение модуля (корень репозитория или подкаталог server/)
if [[ -f "go.mod" ]]; then
    BUILD_DIR="."
else
    BUILD_DIR="server"
fi

cd "\${BUILD_DIR}"

# Hash-кэш зависимостей
GO_MOD_HASH=\$(md5sum go.mod | cut -d' ' -f1)
HASH_FILE=".gomod_hash"
STORED_HASH=\$(cat "\${HASH_FILE}" 2>/dev/null || true)

if [[ "\${GO_MOD_HASH}" != "\${STORED_HASH}" ]]; then
    echo "[INFO] Загрузка зависимостей..."
    go mod tidy
    go mod download
    echo "\${GO_MOD_HASH}" > "\${HASH_FILE}"
else
    echo "[INFO] Зависимости актуальны"
fi

# Сборка бинарника
echo "[INFO] Сборка..."
if go build -ldflags="-s -w" -o "${BINARY_NAME}" .; then
    SIZE=\$(du -h "${BINARY_NAME}" | cut -f1)
    echo "[INFO] Сборка успешна: ${BINARY_NAME} (\${SIZE})"
else
    echo "[ERROR] Сборка не удалась!"
    exit 1
fi
REMOTE

    info "Сборка завершена."
}

# ==============================================================================
# Синхронизация .env (ключи API с ноутбука → сервер)
# ==============================================================================
sync_env() {
    local LOCAL_ENV="${SERVER_ROOT}/.env"
    if [[ -f "${LOCAL_ENV}" ]]; then
        info "Копирование .env на сервер..."
        scp ${SSH_OPTS} -P "${SSH_PORT}" "${LOCAL_ENV}" \
            "${SSH_USER}@${SSH_HOST}:${REMOTE_BASE}/.env"
        info ".env скопирован на сервер"
    else
        warn "Нет локального .env — пропускаю (создайте server/.env с ключами)"
    fi
}

restart_server() {
    info "Перезапуск ${BINARY_NAME}..."

    remote_run bash -s <<REMOTE
cd "${REMOTE_BASE}"

# Определение поддиректории
if [[ -f "go.mod" ]]; then
    BIN_DIR="."
else
    BIN_DIR="server"
fi

# Production конфиг
if [[ -f "\${BIN_DIR}/${PROD_CONFIG}" ]]; then
    cp "\${BIN_DIR}/${PROD_CONFIG}" "\${BIN_DIR}/.env"
    echo "[INFO] Production конфиг: \${BIN_DIR}/${PROD_CONFIG}"
fi

cd "\${BIN_DIR}"

# Остановка старого процесса
OLD_PID=\$(cat "${BINARY_NAME}.pid" 2>/dev/null || true)
if [[ -n "\${OLD_PID}" ]] && kill -0 "\${OLD_PID}" 2>/dev/null; then
    echo "[INFO] Остановка старого процесса (PID: \${OLD_PID})..."
    kill -TERM "\${OLD_PID}" 2>/dev/null || true
    sleep 2

    if kill -0 "\${OLD_PID}" 2>/dev/null; then
        kill -KILL "\${OLD_PID}" 2>/dev/null || true
        sleep 1
    fi
else
    pkill -f "\${PWD}/${BINARY_NAME}" 2>/dev/null || true
    sleep 1
fi

# Загрузка переменных окружения
if [[ -f ".env" ]]; then
    set -a
    source .env
    set +a
fi

# Запуск
echo "[INFO] Запуск ${BINARY_NAME}..."
nohup ./${BINARY_NAME} -config ${CONFIG_FILE} > "${BINARY_NAME}.log" 2>&1 &
echo \$! > "${BINARY_NAME}.pid"

sleep 2

NEW_PID=\$(cat "${BINARY_NAME}.pid" 2>/dev/null || true)
if [[ -n "\${NEW_PID}" ]] && kill -0 "\${NEW_PID}" 2>/dev/null; then
    MEM=\$(ps -o rss= -p "\${NEW_PID}" 2>/dev/null | awk '{printf "%.1f MB", \$1/1024}')
    echo "[INFO] ${BINARY_NAME} запущен (PID: \${NEW_PID}, Memory: \${MEM})"
else
    echo "[ERROR] Не удалось запустить сервер!"
    echo ""
    echo "--- Последние 30 строк лога ---"
    tail -30 "${BINARY_NAME}.log" 2>/dev/null || echo "(лог пуст)"
    exit 1
fi
REMOTE

    info "Сервер перезапущен."
}

show_logs() {
    info "Просмотр логов..."
    remote_run "cd '${REMOTE_BASE}' && tail -f ${BINARY_NAME}.log"
}

show_status() {
    info "Проверка статуса сервера..."
    remote_run bash -s <<REMOTE
cd "${REMOTE_BASE}"

PID=\$(cat "${BINARY_NAME}.pid" 2>/dev/null || true)
if [[ -n "\${PID}" ]] && kill -0 "\${PID}" 2>/dev/null; then
    MEM=\$(ps -o rss= -p "\${PID}" 2>/dev/null | awk '{printf "%.1f MB", \$1/1024}')
    UPTIME=\$(ps -o etime= -p "\${PID}" 2>/dev/null | tr -d ' ')
    echo "[INFO] ${BINARY_NAME} РАБОТАЕТ"
    echo "       PID:    \${PID}"
    echo "       Memory: \${MEM}"
    echo "       Uptime: \${UPTIME}"

    # Проверка health endpoint
    HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health 2>/dev/null || echo "000")
    if [[ "\${HEALTH}" == "200" ]]; then
        echo "       Health: OK"
    else
        echo "       Health: FAIL (\${HEALTH})"
    fi
else
    echo "[INFO] ${BINARY_NAME} НЕ запущен"
fi
REMOTE
}

ssh_session() {
    info "Подключение к ${SSH_USER}@${SSH_HOST}..."
    ssh ${SSH_OPTS} -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}"
}

deploy_all() {
    info "Полный деплой..."
    echo ""
    sync_files
    echo ""
    sync_env
    echo ""
    build_remote
    echo ""
    restart_server
    echo ""
    info "Деплой завершён! URL: https://kreagenium.ru/nuadvi/"
}

# ==============================================================================
# Main
# ==============================================================================

case "${1:-}" in
    sync)
        check_ssh
        sync_files
        ;;
    build)
        check_ssh
        build_remote
        ;;
    restart)
        check_ssh
        restart_server
        ;;
    all)
        check_ssh
        deploy_all
        ;;
    logs)
        show_logs
        ;;
    status)
        check_ssh
        show_status
        ;;
    ssh)
        ssh_session
        ;;
    -h|--help|"")
        usage
        ;;
    *)
        error "Неизвестная команда: ${1}"
        usage
        exit 1
        ;;
esac
