# Дополнительные корневые сертификаты

Эта директория содержит корневые сертификаты CA, которых нет
в системном хранилище доверенных сертификатов сервера.

Автоматически загружается при старте провайдером GigaChat
(`buildTLSConfig()` в `providers/gigachat.go`).

## Формат

PEM (.pem, .crt, .cer) — один или несколько сертификатов в файле.

## Добавление нового сертификата

```bash
# Скопировать .crt/.pem файл в эту директорию
cp /path/to/cert.pem server/certs/

# Или скачать напрямую:
curl -sSL https://example.com/ca.pem > server/certs/ca.pem
```

## Для GigaChat (Сбер)

OAuth-endpoint `ngw.devices.sberbank.ru:9443` использует сертификат,
подписанный Российским Удостоверяющим Центром (РУЦ).

Если на сервере возникает ошибка `x509: certificate signed by unknown authority`,
скачайте корневой сертификат РУЦ и положите сюда:

```bash
# Скачать корневой сертификат РУЦ
curl -sSL https://root.cryptopro.ru/CertEnroll/root.cer -o server/certs/russian-trusted-root.pem
```

После деплоя проверить:
```bash
openssl s_client -connect ngw.devices.sberbank.ru:9443 \
  -CAfile server/certs/russian-trusted-root.pem -brief
```
