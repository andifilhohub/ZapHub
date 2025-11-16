# ✅ FORMATO CORRETO DE NÚMEROS BRASILEIROS NO ZAPHUB

## 🎯 Descoberta Importante

Após testes práticos, foi identificado que o formato correto para números brasileiros é:

### ❌ ERRADO (NÃO funciona para contatos salvos)
```
5534996853220@s.whatsapp.net  ← Com o "9" extra
```

### ✅ CORRETO (Funciona para contatos salvos)
```
553496853220@s.whatsapp.net   ← SEM o "9" extra
```

## 📋 Padrão Correto

```
[Código País][DDD][Número]@s.whatsapp.net

Exemplo:
55 + 34 + 96853220 = 553496853220@s.whatsapp.net
```

**NÃO adicione o dígito 9 que foi incluído nos números móveis brasileiros em 2016!**

## 🧪 Teste Realizado

```bash
# Teste 1: Com 9 extra
./send.sh 5534996853220 "Teste 1"
Resultado: ❌ Criou nova conversa (não foi para o contato salvo)

# Teste 2: SEM o 9 extra ← CORRETO
./send.sh 553496853220 "Teste 2"
Resultado: ✅ FOI para o contato salvo!

# Teste 3: Sem código de país
./send.sh 34996853220 "Teste 3"
Resultado: ❌ Criou nova conversa
```

## 📝 Como Usar

### Script de Envio Simples
```bash
# Formato correto
./send.sh 553496853220 "Sua mensagem aqui"

# OU com @s.whatsapp.net
./send.sh 553496853220@s.whatsapp.net "Sua mensagem"
```

### API Request
```bash
curl -X POST http://localhost:3001/api/v1/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-unique-id",
    "to": "553496853220@s.whatsapp.net",
    "type": "text",
    "text": "Olá!"
  }'
```

### Conversão de Número

Se você tem um número no formato **com 9 extra** (ex: 5534**9**96853220):

```bash
# Número com 9: 5534996853220
# Remova o 9º dígito (após DDD): 553496853220

# Exemplo em código:
NUMERO_COMPLETO="5534996853220"
NUMERO_CORRETO="${NUMERO_COMPLETO:0:4}${NUMERO_COMPLETO:5}"
# Resultado: 553496853220
```

## ⚠️ Importante

1. **Números salvos nos contatos**: Use o formato SEM o 9 extra
2. **Números novos/não salvos**: Podem criar conversas diferentes dependendo do formato
3. **Sempre use código do país**: 55 (Brasil)
4. **Sempre adicione @s.whatsapp.net** ao final

## 🔍 Como Descobrir o JID Correto

Se estiver em dúvida sobre qual formato usar:

```bash
# Use o script de teste
./send.sh 553496853220 "Teste sem 9"
./send.sh 5534996853220 "Teste com 9"

# Verifique qual chegou na conversa do contato salvo
```

## 📊 Referência Rápida

| Formato | DDD | Número | JID Completo | Status |
|---------|-----|--------|--------------|--------|
| **Correto** | 34 | 96853220 | `553496853220@s.whatsapp.net` | ✅ |
| Errado | 34 | 996853220 | `5534996853220@s.whatsapp.net` | ❌ |
| Errado | - | 34996853220 | `34996853220@s.whatsapp.net` | ❌ |

---

**Última atualização:** 15/11/2025  
**Testado com:** ZapHub API v1.0 + Baileys  
**Resultado:** ✅ Confirmado funcionando
