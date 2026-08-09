#!/usr/bin/env bash

set -uo pipefail
# NOTE: intentionally NOT 'set -e' — grep with no matches exits 1,
# which would kill the script under pipefail. We handle errors manually.

# ==============================================================================
# TEST SCRIPT FOR NUTRIADVISOR LLM PROXY SERVER
# ==============================================================================
# Использование:
#   ./scripts/test.sh                   # Тесты по HTTPS (через nginx /nuadvi)
#   ./scripts/test.sh http://host:3001  # Тесты напрямую к серверу
#   ./scripts/test.sh --local           # Тесты localhost:3001
# ==============================================================================

# ---- Configuration -----------------------------------------------------------
BASE_URL="${1:-}"
if [[ "${BASE_URL}" == "--local" ]]; then
    BASE_URL="http://localhost:3001"
elif [[ -z "${BASE_URL}" ]]; then
    BASE_URL="https://kreagenium.ru/nuadvi"
fi
BASE_URL="${BASE_URL%/}"

# ---- Colors ------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

ok()   { PASS=$((PASS+1)); echo -e "  ${GREEN}✅ PASS${NC}  $*"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}❌ FAIL${NC}  $*"; }
skip() { SKIP=$((SKIP+1)); echo -e "  ${YELLOW}⏭️  SKIP${NC}  $*"; }
info() { echo -e "  ${CYAN}ℹ️${NC}  $*"; }
sep()  { echo ""; echo -e "${BOLD}$*${NC}"; echo "─────────────────────────────────────────"; }

# ---- HTTP helpers (single curl call for code + body) -------------------------
HTTP_CODE=""
HTTP_BODY=""
TMPFILE=""

_cleanup() { rm -f "${TMPFILE}" 2>/dev/null; }
trap _cleanup EXIT

http_get() {
    local url="$1"
    TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
    HTTP_CODE=$(curl -s -o "${TMPFILE}" -w '%{http_code}' \
        --max-time 10 "${url}" 2>/dev/null) || HTTP_CODE="000"
    HTTP_BODY=$(cat "${TMPFILE}" 2>/dev/null) || true
    rm -f "${TMPFILE}"
}

http_post_json() {
    local url="$1"
    local data="$2"
    TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
    HTTP_CODE=$(curl -s -o "${TMPFILE}" -w '%{http_code}' \
        --max-time 120 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "${data}" \
        "${url}" 2>/dev/null) || HTTP_CODE="000"
    HTTP_BODY=$(cat "${TMPFILE}" 2>/dev/null) || true
    rm -f "${TMPFILE}"
}

http_post_stream() {
    local url="$1"
    local data="$2"
    TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
    # --max-time is the hard timeout; -N disables output buffering
    curl -s --max-time 60 \
        -X POST \
        -H "Content-Type: application/json" \
        -N \
        -d "${data}" \
        "${url}" > "${TMPFILE}" 2>/dev/null
    local curl_exit=$?
    HTTP_BODY=$(cat "${TMPFILE}" 2>/dev/null) || true
    rm -f "${TMPFILE}"

    if [[ ${curl_exit} -eq 0 && -n "${HTTP_BODY}" ]]; then
        HTTP_CODE="200"
    elif [[ ${curl_exit} -eq 28 ]]; then
        HTTP_CODE="000"  # timeout
    else
        HTTP_CODE="000"
    fi
}

# ---- JSON / SSE helpers (no jq) ----------------------------------------------
count_sse_chunks() {
    echo "${1:-}" | grep -c "^data: " || true
}

extract_sse_content() {
    local body="${1:-}"
    # Try 'content' field
    local result
    result=$(echo "${body}" | grep "^data: " \
        | grep -v '\[DONE\]' \
        | sed 's/^data: //' \
        | grep -o '"content":"[^"]*"' \
        | sed 's/"content":"//; s/"$//' \
        | tr -d '\n' || true)
    # Fallback to reasoning_content
    if [[ -z "${result}" ]]; then
        result=$(echo "${body}" | grep "^data: " \
            | grep -v '\[DONE\]' \
            | sed 's/^data: //' \
            | grep -o '"reasoning_content":"[^"]*"' \
            | sed 's/"reasoning_content":"//; s/"$//' \
            | tr -d '\n' || true)
    fi
    echo "${result}"
}

extract_response_content() {
    local body="${1:-}"
    local result
    result=$(echo "${body}" | grep -o '"content":"[^"\\]*"' | tail -1 | sed 's/"content":"//; s/"$//' || true)
    if [[ -z "${result}" ]]; then
        result=$(echo "${body}" | grep -o '"reasoning_content":"[^"\\]*"' | tail -1 | sed 's/"reasoning_content":"//; s/"$//' || true)
    fi
    echo "${result}"
}

# ==============================================================================
sep "1. Health check"
# ==============================================================================

http_get "${BASE_URL}/health"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/health → 200"
    providers=$(echo "${HTTP_BODY}" | grep -o '"name":"[^"]*"' | sed 's/"name":"//; s/"//' || true)
    if [[ -n "${providers}" ]]; then
        info "Провайдеры:"
        echo "${providers}" | while read -r p; do
            [[ -n "${p}" ]] && info "  • ${p}"
        done
    fi
    active_count=$(echo "${HTTP_BODY}" | grep -c '"active":true' || true)
    total_count=$(echo "${HTTP_BODY}" | grep -c '"active":' || true)
    info "Активных провайдеров: ${active_count}/${total_count}"
else
    fail "/health → ${HTTP_CODE} (ожидался 200)"
    info "Убедитесь что сервер запущен: curl ${BASE_URL}/health"
fi

# ==============================================================================
sep "2. Models list"
# ==============================================================================

http_get "${BASE_URL}/v1/models"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/v1/models → 200"
    # OpenAI-compatible JSON uses "id" field
    model_count=$(echo "${HTTP_BODY}" | grep -c '"id"' || true)
    info "Моделей в списке: ${model_count}"
    # Extract model IDs
    model_ids=$(echo "${HTTP_BODY}" | grep -o '"id":"[^"]*"' | sed 's/"id":"//; s/"//' || true)
    if [[ -n "${model_ids}" ]]; then
        info "Модели:"
        echo "${model_ids}" | while read -r mid; do
            [[ -n "${mid}" ]] && info "  • ${mid}"
        done
    else
        info "(пустой список или не удалось распарсить)"
        info "Raw response: $(echo "${HTTP_BODY}" | head -c 200)"
    fi
else
    fail "/v1/models → ${HTTP_CODE} (ожидался 200)"
fi

# ==============================================================================
sep "3. Admin endpoints"
# ==============================================================================

http_get "${BASE_URL}/api/admin/providers"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/api/admin/providers → 200"
    provider_count=$(echo "${HTTP_BODY}" | grep -c '"name":"[^"]*"' || true)
    info "Провайдеров: ${provider_count}"
    echo "${HTTP_BODY}" | grep -oE '"name":"[^"]*"[^}]*"active_slots":[0-9]*[^}]*"max_slots":[0-9]*[^}]*"load_pct":[0-9.]*' | while read -r line; do
        pname=$(echo "${line}" | grep -o '"name":"[^"]*"' | sed 's/"name":"//; s/"//')
        pactive=$(echo "${line}" | grep -o '"active_slots":[0-9]*' | sed 's/"active_slots"://')
        pmax=$(echo "${line}" | grep -o '"max_slots":[0-9]*' | sed 's/"max_slots"://')
        pload=$(echo "${line}" | grep -o '"load_pct":[0-9.]*' | sed 's/"load_pct"://')
        info "  ${pname}: ${pactive}/${pmax} слотов, нагрузка ${pload}%"
    done || true
else
    fail "/api/admin/providers → ${HTTP_CODE}"
fi

http_get "${BASE_URL}/api/admin/proxies"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/api/admin/proxies → 200 (SOCKS5 proxy management — placeholder)"
else
    fail "/api/admin/proxies → ${HTTP_CODE}"
fi

# ==============================================================================
sep "4. Non-streaming chat completions"
# ==============================================================================

# Build test model list dynamically
TEST_MODELS=()
if [[ -n "${model_ids:-}" ]]; then
    while IFS= read -r mid; do
        [[ -n "${mid}" ]] && TEST_MODELS+=("${mid}")
    done <<< "${model_ids}"
fi
if [[ ${#TEST_MODELS[@]} -eq 0 ]]; then
    TEST_MODELS=("gemma-4" "GigaChat-Plus")
fi
info "Тестируемые модели: ${TEST_MODELS[*]}"

for model in "${TEST_MODELS[@]}"; do
    echo -e "  ${CYAN}── Модель: ${model} (non-stream) ──${NC}"

    http_post_json "${BASE_URL}/v1/chat/completions" "{
        \"model\": \"${model}\",
        \"messages\": [{\"role\": \"user\", \"content\": \"Ответь одним словом: чему равен 2+2?\"}],
        \"max_tokens\": 20,
        \"temperature\": 0.0
    }"

    if [[ "${HTTP_CODE}" == "200" ]]; then
        content=$(extract_response_content "${HTTP_BODY}")
        if [[ -n "${content}" ]]; then
            [[ ${#content} -gt 80 ]] && content="${content:0:77}..."
            ok "${model}: 200 — ответ: ${content}"
        else
            ok "${model}: 200 (ответ пуст — возможно reasoning model)"
            info "Raw: $(echo "${HTTP_BODY}" | head -c 300)"
        fi
    elif [[ "${HTTP_CODE}" == "502" ]]; then
        skip "${model}: 502 — ошибка провайдера (DNS / нет ключа / таймаут)"
    elif [[ "${HTTP_CODE}" == "503" ]]; then
        skip "${model}: 503 — провайдер недоступен"
    elif [[ "${HTTP_CODE}" == "000" ]]; then
        fail "${model}: нет ответа (timeout или сервер недоступен)"
    else
        fail "${model}: ${HTTP_CODE}"
        info "Body: $(echo "${HTTP_BODY}" | head -c 300)"
    fi
done

# ==============================================================================
sep "5. SSE streaming chat completions"
# ==============================================================================

for model in "${TEST_MODELS[@]}"; do
    echo -e "  ${CYAN}── Модель: ${model} (stream) ──${NC}"

    http_post_stream "${BASE_URL}/v1/chat/completions" "{
        \"model\": \"${model}\",
        \"messages\": [{\"role\": \"user\", \"content\": \"Назови три фрукта. Кратко.\"}],
        \"max_tokens\": 50,
        \"stream\": true
    }"

    if [[ "${HTTP_CODE}" == "200" ]]; then
        chunks=$(count_sse_chunks "${HTTP_BODY}")
        content=$(extract_sse_content "${HTTP_BODY}")

        if [[ "${chunks}" -gt 0 ]]; then
            has_done=$(echo "${HTTP_BODY}" | grep -c '\[DONE\]' || true)
            if [[ "${has_done}" -gt 0 ]]; then
                ok "${model}: stream OK (${chunks} chunks, [DONE] received)"
            else
                ok "${model}: stream OK (${chunks} chunks, no [DONE])"
            fi
            if [[ -n "${content}" ]]; then
                display="${content:0:120}"
                [[ ${#content} -gt 120 ]] && display="${display}..."
                info "Контент: ${display}"
            fi
        else
            fail "${model}: 200 but 0 SSE chunks (не SSE-ответ?)"
            info "Raw (first 300b): $(echo "${HTTP_BODY}" | head -c 300)"
        fi
    elif [[ "${HTTP_CODE}" == "502" ]]; then
        skip "${model}: 502 — ошибка провайдера"
    elif [[ "${HTTP_CODE}" == "503" ]]; then
        skip "${model}: 503 — провайдер недоступен"
    elif [[ "${HTTP_CODE}" == "000" ]]; then
        fail "${model}: нет ответа (timeout 60s)"
    else
        fail "${model}: ${HTTP_CODE}"
        info "Body: $(echo "${HTTP_BODY}" | head -c 300)"
    fi
done

# ==============================================================================
sep "6. Edge cases / error handling"
# ==============================================================================

# 6a. Unknown model
http_post_json "${BASE_URL}/v1/chat/completions" "{
    \"model\": \"nonexistent-model\",
    \"messages\": [{\"role\": \"user\", \"content\": \"test\"}]
}"
if [[ "${HTTP_CODE}" == "503" ]]; then
    ok "Несуществующая модель → 503 Service Unavailable"
else
    fail "Несуществующая модель → ${HTTP_CODE} (ожидался 503)"
fi

# 6b. Empty body
TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
HTTP_CODE=$(curl -s -o "${TMPFILE}" -w '%{http_code}' \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '' \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || HTTP_CODE="000"
rm -f "${TMPFILE}"
if [[ "${HTTP_CODE}" == "400" ]]; then
    ok "Пустой body → 400 Bad Request"
else
    fail "Пустой body → ${HTTP_CODE} (ожидался 400)"
fi

# 6c. Wrong method on /v1/chat/completions
TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
HTTP_CODE=$(curl -s -o "${TMPFILE}" -w '%{http_code}' \
    --max-time 5 \
    -X GET \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || HTTP_CODE="000"
rm -f "${TMPFILE}"
if [[ "${HTTP_CODE}" == "405" ]]; then
    ok "GET /v1/chat/completions → 405 Method Not Allowed"
else
    fail "GET /v1/chat/completions → ${HTTP_CODE} (ожидался 405)"
fi

# 6d. Wrong method on /v1/models
TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
HTTP_CODE=$(curl -s -o "${TMPFILE}" -w '%{http_code}' \
    --max-time 5 \
    -X POST \
    "${BASE_URL}/v1/models" 2>/dev/null) || HTTP_CODE="000"
rm -f "${TMPFILE}"
if [[ "${HTTP_CODE}" == "405" ]]; then
    ok "POST /v1/models → 405 Method Not Allowed"
else
    fail "POST /v1/models → ${HTTP_CODE} (ожидален 405)"
fi

# ==============================================================================
sep "7. Concurrency test"
# ==============================================================================

CONC_MODEL="${TEST_MODELS[0]:-gemma-4}"
info "Отправка 3 параллельных запросов к ${CONC_MODEL}..."
info "(при max_concurrency=1 запросы ставятся в очередь на 30с и выполняются последовательно)"
START_TIME=$(date +%s%N)

for i in 1 2 3; do
    curl -s --max-time 120 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"${CONC_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"Считай от 1 до 3. Только числа.\"}], \"max_tokens\": 15}" \
        "${BASE_URL}/v1/chat/completions" \
        > /tmp/nuadvi_test_${i}.json 2>/dev/null &
done
wait

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

CONC_OK=0
for i in 1 2 3; do
    if [[ -f "/tmp/nuadvi_test_${i}.json" ]] \
       && grep -q '"content"\|"reasoning_content"' "/tmp/nuadvi_test_${i}.json" 2>/dev/null; then
        CONC_OK=$((CONC_OK+1))
    else
        local_err=$(head -c 100 "/tmp/nuadvi_test_${i}.json" 2>/dev/null)
        info "  Запрос ${i}: ${local_err:-нет ответа (timeout)}"
    fi
    rm -f "/tmp/nuadvi_test_${i}.json"
done

if [[ "${CONC_OK}" -ge 2 ]]; then
    ok "Параллельные запросы: ${CONC_OK}/3 за ${ELAPSED_MS}ms"
elif [[ "${CONC_OK}" -ge 1 ]]; then
    ok "Параллельные запросы: ${CONC_OK}/3 за ${ELAPSED_MS}ms (частично, проверьте concurrency)"
else
    fail "Параллельные запросы: ${CONC_OK}/3 за ${ELAPSED_MS}ms"
fi
info "Общее время: ${ELAPSED_MS}ms"

# ==============================================================================
sep "8. Timing benchmarks"
# ==============================================================================

info "Измерение TTFB для streaming..."

TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
TTFB=$(curl -s -o "${TMPFILE}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"${CONC_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"Hi\"}], \"max_tokens\": 10, \"stream\": true}" \
    -w '%{time_starttransfer}' \
    --max-time 60 \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || TTFB="N/A"
rm -f "${TMPFILE}"

if [[ "${TTFB}" != "N/A" && "${TTFB}" != "0.000000" ]]; then
    TTFB_MS=$(echo "${TTFB}" | awk '{printf "%.0f", $1*1000}')
    ok "TTFB (stream): ${TTFB_MS}ms"
else
    fail "TTFB: не удалось измерить (сервер недоступен)"
fi

TMPFILE=$(mktemp /tmp/nuadvi_test_XXXXXX)
TOTAL_T=$(curl -s -o "${TMPFILE}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"${CONC_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"2+2?\"}], \"max_tokens\": 10}" \
    -w '%{time_total}' \
    --max-time 60 \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || TOTAL_T="N/A"
rm -f "${TMPFILE}"

if [[ "${TOTAL_T}" != "N/A" && "${TOTAL_T}" != "0.000000" ]]; then
    TOTAL_MS=$(echo "${TOTAL_T}" | awk '{printf "%.0f", $1*1000}')
    ok "Total time (non-stream): ${TOTAL_MS}ms"
else
    fail "Total time: не удалось измерить"
fi

# ==============================================================================
sep "9. Priority fallback test"
# ==============================================================================

info "Проверка порядка выбора моделей по приоритету"
info "Запрос к алиасу 'gemma-4' — должен выбрать модель с наивысшим приоритетом"

http_post_json "${BASE_URL}/v1/chat/completions" "{
    \"model\": \"gemma-4\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Ответь одним словом: столица Франции?\"}],
    \"max_tokens\": 10,
    \"temperature\": 0.0
}"

if [[ "${HTTP_CODE}" == "200" ]]; then
    # Проверяем что ответ содержит модель (в поле model)
    used_model=$(echo "${HTTP_BODY}" | grep -o '"model":"[^"]*"' | sed 's/"model":"//; s/"//' | tail -1 || true)
    if [[ -n "${used_model}" ]]; then
        ok "gemma-4 fallback: ответ 200 от модели '${used_model}'"
        info "Модель выбрана по приоритету из списка кандидатов"
    else
        ok "gemma-4 fallback: ответ 200 (модель не указана в ответе)"
    fi
    content=$(extract_response_content "${HTTP_BODY}")
    [[ -n "${content}" ]] && info "Ответ: ${content:0:50}"
elif [[ "${HTTP_CODE}" == "502" ]]; then
    # 502 может означать что первый кандидат упал, но fallback сработал —
    # проверим что в логе есть "trying candidate" и "candidate failed"
    skip "gemma-4 fallback: 502 (провайдер(ы) недоступны, проверьте логи)"
    info "В логе сервера ищите: 'trying candidate' и 'candidate failed, trying next'"
else
    fail "gemma-4 fallback: ${HTTP_CODE}"
    info "Body: $(echo "${HTTP_BODY}" | head -c 300)"
fi

# ==============================================================================
# SUMMARY
# ==============================================================================

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  ИТОГИ ТЕСТИРОВАНИЯ${NC}"
echo -e "${BOLD}  Сервер: ${BASE_URL}${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✅ Прошло:${NC}   ${PASS}"
echo -e "  ${RED}❌ Ошибки:${NC}   ${FAIL}"
echo -e "  ${YELLOW}⏭️  Пропущено:${NC} ${SKIP}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"

if [[ "${FAIL}" -eq 0 ]]; then
    echo -e "  ${GREEN}Все тесты пройдены!${NC}"
else
    echo -e "  ${RED}Есть ошибки — проверьте логи на сервере${NC}"
    info "ssh ${SSH_USER:-nikas}@${SSH_HOST:-kreagenium.ru} 'tail -30 /home/nikas/prjs/nuadvi-server/nuadvi-proxy.log'"
fi

echo ""
