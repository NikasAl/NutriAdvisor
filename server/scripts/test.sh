#!/usr/bin/env bash

set -euo pipefail

# ==============================================================================
# TEST SCRIPT FOR NUTRIADVISOR LLM PROXY SERVER
# ==============================================================================
# Запускает серию проверок против развернутого сервера:
#   - health endpoint
#   - models list
#   - admin endpoints
#   - non-streaming chat (каждый провайдер)
#   - SSE streaming chat (каждый провайдер)
#   - concurrency test (параллельные запросы)
#
# Использование:
#   ./scripts/test.sh                   # Тесты по HTTPS (через nginx /nuadvi)
#   ./scripts/test.sh http://host:3001  # Тесты напрямую к серверу
#   ./scripts/test.sh --local           # Тесты localhost:3001 (коротко)
# ==============================================================================

# ---- Configuration -----------------------------------------------------------
BASE_URL="${1:-}"
if [[ "${BASE_URL}" == "--local" ]]; then
    BASE_URL="http://localhost:3001"
elif [[ -z "${BASE_URL}" ]]; then
    BASE_URL="https://kreagenium.ru/nuadvi"
fi

# Remove trailing slash
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

# ---- HTTP helpers -------------------------------------------------------------
HTTP_CODE=""
HTTP_BODY=""

http_get() {
    local url="$1"
    local out
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 10 \
        "${url}" 2>/dev/null) || HTTP_CODE="000"
    HTTP_BODY=$(curl -s --max-time 10 "${url}" 2>/dev/null) || HTTP_BODY=""
}

http_post_json() {
    local url="$1"
    local data="$2"
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time 120 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "${data}" \
        "${url}" 2>/dev/null) || HTTP_CODE="000"
    HTTP_BODY=$(curl -s --max-time 120 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "${data}" \
        "${url}" 2>/dev/null) || HTTP_BODY=""
}

http_post_stream() {
    local url="$1"
    local data="$2"
    # Returns raw body for SSE parsing
    HTTP_BODY=$(curl -s --max-time 120 \
        -X POST \
        -H "Content-Type: application/json" \
        -N \
        -d "${data}" \
        "${url}" 2>/dev/null) || HTTP_BODY=""
    # Check if we got any data
    if [[ -n "${HTTP_BODY}" ]]; then
        HTTP_CODE="200"
    else
        HTTP_CODE="000"
    fi
}

# ---- JSON helpers (no jq dependency) ------------------------------------------
json_field() {
    local json="$1"
    local field="$2"
    echo "${json}" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*[^\",}]*" \
        | head -1 \
        | sed "s/\"${field}\"[[:space:]]*:[[:space:]]*//; s/^[\"']//; s/[\"']$//"
}

count_sse_chunks() {
    local body="$1"
    echo "${body}" | grep -c "^data: " || true
}

extract_sse_content() {
    local body="$1"
    echo "${body}" | grep "^data: " \
        | grep -v '"data":"\[DONE\]"' \
        | sed 's/^data: //' \
        | grep -o '"content":"[^"]*"' \
        | sed 's/"content":"//; s/"$//' \
        | tr -d '\n'
}

# ==============================================================================
sep "1. Health check"
# ==============================================================================

http_get "${BASE_URL}/health"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/health → 200"
    # Show providers status
    local providers
    providers=$(echo "${HTTP_BODY}" | grep -o '"name":"[^"]*"' | sed 's/"name":"//; s/"//')
    if [[ -n "${providers}" ]]; then
        info "Провайдеры:"
        echo "${providers}" | while read -r p; do
            info "  • ${p}"
        done
    fi
    # Check provider statuses
    local active_count
    active_count=$(echo "${HTTP_BODY}" | grep -o '"active":true' | wc -l)
    local total_count
    total_count=$(echo "${HTTP_BODY}" | grep -o '"active":' | wc -l)
    info "Активных провайдеров: ${active_count}/${total_count}"
else
    fail "/health → ${HTTP_CODE} (ожидался 200)"
fi

# ==============================================================================
sep "2. Models list"
# ==============================================================================

http_get "${BASE_URL}/v1/models"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/v1/models → 200"
    local model_count
    model_count=$(echo "${HTTP_BODY}" | grep -o '"alias":"[^"]*"' | wc -l || echo "0")
    info "Моделей в списке: ${model_count}"
    # List aliases
    local aliases
    aliases=$(echo "${HTTP_BODY}" | grep -o '"alias":"[^"]*"' | sed 's/"alias":"//; s/"//' || true)
    if [[ -n "${aliases}" ]]; then
        info "Алиасы моделей:"
        echo "${aliases}" | while read -r a; do
            info "  • ${a}"
        done
    fi
else
    fail "/v1/models → ${HTTP_CODE} (ожидался 200)"
fi

# ==============================================================================
sep "3. Admin endpoints"
# ==============================================================================

# 3a. Providers status
http_get "${BASE_URL}/api/admin/providers"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/api/admin/providers → 200"
    local provider_count
    provider_count=$(echo "${HTTP_BODY}" | grep -o '"name":"[^"]*"' | wc -l || echo "0")
    info "Провайдеров: ${provider_count}"
    # Show pool stats
    echo "${HTTP_BODY}" | grep -oE '"name":"[^"]*"[^}]*"active_slots":[0-9]*[^}]*"max_slots":[0-9]*[^}]*"load_pct":[0-9.]*' | while read -r line; do
        local pname pactive pmax pload
        pname=$(echo "${line}" | grep -o '"name":"[^"]*"' | sed 's/"name":"//; s/"//')
        pactive=$(echo "${line}" | grep -o '"active_slots":[0-9]*' | sed 's/"active_slots"://')
        pmax=$(echo "${line}" | grep -o '"max_slots":[0-9]*' | sed 's/"max_slots"://')
        pload=$(echo "${line}" | grep -o '"load_pct":[0-9.]*' | sed 's/"load_pct"://')
        info "  ${pname}: ${pactive}/${pmax} слотов, нагрузка ${pload}%"
    done
else
    fail "/api/admin/providers → ${HTTP_CODE}"
fi

# 3b. Proxies status
http_get "${BASE_URL}/api/admin/proxies"
if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "/api/admin/proxies → 200 (SOCKS5 proxy management — placeholder)"
else
    fail "/api/admin/proxies → ${HTTP_CODE}"
fi

# ==============================================================================
sep "4. Non-streaming chat completions"
# ==============================================================================

TEST_MODELS=("gemma3" "gigachat")

for model in "${TEST_MODELS[@]}"; do
    echo -e "  ${CYAN}── Модель: ${model} (non-stream) ──${NC}"

    http_post_json "${BASE_URL}/v1/chat/completions" "{
        \"model\": \"${model}\",
        \"messages\": [{\"role\": \"user\", \"content\": \"Ответь одним словом: чему равен 2+2?\"}],
        \"max_tokens\": 20,
        \"temperature\": 0.0
    }"

    if [[ "${HTTP_CODE}" == "200" ]]; then
        # Extract assistant content
        local content
        content=$(echo "${HTTP_BODY}" | grep -o '"content":"[^"]*"' | tail -1 | sed 's/"content":"//; s/"$//')
        if [[ -n "${content}" ]]; then
            ok "${model}: 200 — ответ: ${content}"
        else
            ok "${model}: 200 (ответ пуст или не парсится)"
            info "Raw: $(echo "${HTTP_BODY}" | head -c 200)"
        fi
    elif [[ "${HTTP_CODE}" == "503" ]]; then
        skip "${model}: 503 — провайдер недоступен (нет API ключа или оффлайн)"
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
        local chunks
        chunks=$(count_sse_chunks "${HTTP_BODY}")
        local content
        content=$(extract_sse_content "${HTTP_BODY}")

        if [[ "${chunks}" -gt 0 ]]; then
            # Check if stream has [DONE]
            local has_done
            has_done=$(echo "${HTTP_BODY}" | grep -c '\[DONE\]' || true)

            if [[ "${has_done}" -gt 0 ]]; then
                ok "${model}: stream OK (${chunks} chunks, [DONE] received)"
            else
                ok "${model}: stream OK (${chunks} chunks, no [DONE])"
            fi

            if [[ -n "${content}" ]]; then
                info "Контент: ${content:0:120}..."
            fi
        else
            fail "${model}: 200 but 0 SSE chunks (не SSE-ответ?)"
            info "Raw: $(echo "${HTTP_BODY}" | head -c 200)"
        fi
    elif [[ "${HTTP_CODE}" == "503" ]]; then
        skip "${model}: 503 — провайдер недоступен"
    elif [[ "${HTTP_CODE}" == "000" ]]; then
        fail "${model}: нет ответа (timeout)"
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
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '' \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || HTTP_CODE="000"
if [[ "${HTTP_CODE}" == "400" ]]; then
    ok "Пустой body → 400 Bad Request"
else
    fail "Пустой body → ${HTTP_CODE} (ожидался 400)"
fi

# 6c. Wrong method on /v1/chat/completions
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 5 \
    -X GET \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || HTTP_CODE="000"
if [[ "${HTTP_CODE}" == "405" ]]; then
    ok "GET /v1/chat/completions → 405 Method Not Allowed"
else
    fail "GET /v1/chat/completions → ${HTTP_CODE} (ожидался 405)"
fi

# 6d. Wrong method on /v1/models
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 5 \
    -X POST \
    "${BASE_URL}/v1/models" 2>/dev/null) || HTTP_CODE="000"
if [[ "${HTTP_CODE}" == "405" ]]; then
    ok "POST /v1/models → 405 Method Not Allowed"
else
    fail "POST /v1/models → ${HTTP_CODE} (ожидался 405)"
fi

# ==============================================================================
sep "7. Concurrency test"
# ==============================================================================

info "Отправка 3 параллельных запросов к gemma3..."
START_TIME=$(date +%s%N)

for i in 1 2 3; do
    curl -s --max-time 60 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"gemma3\", \"messages\": [{\"role\": \"user\", \"content\": \"Считай от 1 до 3. Только числа.\"}], \"max_tokens\": 15}" \
        "${BASE_URL}/v1/chat/completions" \
        > /tmp/nuadvi_test_${i}.json 2>/dev/null &
done

# Wait for all
wait

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

CONC_OK=0
CONC_FAIL=0
for i in 1 2 3; do
    if [[ -f "/tmp/nuadvi_test_${i}.json" ]] && grep -q '"content"' "/tmp/nuadvi_test_${i}.json" 2>/dev/null; then
        CONC_OK=$((CONC_OK+1))
    else
        CONC_FAIL=$((CONC_FAIL+1))
        # Check for error response
        local_err
        local_err=$(cat "/tmp/nuadvi_test_${i}.json" 2>/dev/null | head -c 100)
        if [[ -n "${local_err}" ]]; then
            info "  Запрос ${i}: ${local_err}"
        else
            info "  Запрос ${i}: нет ответа (timeout)"
        fi
    fi
    rm -f "/tmp/nuadvi_test_${i}.json"
done

if [[ "${CONC_OK}" -eq 3 ]]; then
    ok "Параллельные запросы: 3/3 за ${ELAPSED_MS}ms"
else
    fail "Параллельные запросы: ${CONC_OK}/3 за ${ELAPSED_MS}ms"
fi

info "Общее время: ${ELAPSED_MS}ms (при max_concurrency=1 запросы идут последовательно)"

# ==============================================================================
sep "8. Timing benchmarks"
# ==============================================================================

# Measure TTFB (Time To First Byte) for streaming
info "Измерение TTFB для streaming..."

TTFB=$(curl -s --max-time 60 \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"gemma3\", \"messages\": [{\"role\": \"user\", \"content\": \"Hi\"}], \"max_tokens\": 10, \"stream\": true}" \
    -w '%{time_starttransfer}' \
    -o /dev/null \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || TTFB="N/A"

if [[ "${TTFB}" != "N/A" && "${TTFB}" != "0.000000" ]]; then
    # Convert to ms
    TTFB_MS=$(echo "${TTFB}" | awk '{printf "%.0f", $1*1000}')
    ok "TTFB (stream): ${TTFB_MS}ms"
else
    fail "TTFB: не удалось измерить (сервер недоступен)"
fi

# Total time for non-streaming
TOTAL_T=$(curl -s --max-time 60 \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"gemma3\", \"messages\": [{\"role\": \"user\", \"content\": \"2+2?\"}], \"max_tokens\": 10}" \
    -w '%{time_total}' \
    -o /dev/null \
    "${BASE_URL}/v1/chat/completions" 2>/dev/null) || TOTAL_T="N/A"

if [[ "${TOTAL_T}" != "N/A" && "${TOTAL_T}" != "0.000000" ]]; then
    TOTAL_MS=$(echo "${TOTAL_T}" | awk '{printf "%.0f", $1*1000}')
    ok "Total time (non-stream): ${TOTAL_MS}ms"
else
    fail "Total time: не удалось измерить"
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
