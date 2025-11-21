# ZapHub - WhatsApp Events Documentation

Comprehensive guide for all WhatsApp native events supported by ZapHub.

## Table of Contents

- [Overview](#overview)
- [Event Types](#event-types)
  - [Presence Events](#presence-events)
  - [Message Receipt Events](#message-receipt-events)
  - [Reaction Events](#reaction-events)
  - [Call Events](#call-events)
  - [Group Events](#group-events)
- [API Endpoints](#api-endpoints)
- [Webhooks](#webhooks)
- [Database Schema](#database-schema)
- [Examples](#examples)

---

## Overview

ZapHub captures and processes all WhatsApp native events in real-time:

- **Presence Updates**: typing, recording, online/offline status
- **Message Receipts**: delivery and read confirmations
- **Reactions**: emoji reactions to messages
- **Calls**: voice and video call events
- **Groups**: participant changes, metadata updates

All events are:
- ✅ Stored in PostgreSQL database
- ✅ Sent via webhooks (if configured)
- ✅ Queryable via REST API
- ✅ Processed asynchronously via BullMQ workers

---

## Event Types

### Presence Events

Track when contacts are typing, recording audio, or online/offline.

#### Event Structure

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "event_type": "presence.update",
  "event_category": "presence",
  "jid": "5511999999999@s.whatsapp.net",
  "participant": "5511999999999@s.whatsapp.net",
  "payload": {
    "lastKnownPresence": "composing",
    "lastSeen": 1705420800000,
    "timestamp": "2025-01-16T12:00:00.000Z"
  },
  "created_at": "2025-01-16T12:00:00.000Z"
}
```

#### Presence Types

- `composing`: User is typing
- `recording`: User is recording audio
- `available`: User is online
- `unavailable`: User is offline
- `paused`: User stopped typing (alias for `available`)

#### Webhook Payload

```json
{
  "event": "presence.update",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "jid": "5511999999999@s.whatsapp.net",
    "participant": "5511999999999@s.whatsapp.net",
    "presence": "composing",
    "lastSeen": 1705420800000,
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

#### Use Cases

- Show "User is typing..." indicator
- Display "User is recording audio..." status
- Track user online/offline patterns
- Build activity monitoring dashboards

---

### Message Receipt Events

Track delivery and read confirmations for sent messages.

#### Event Structure

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "event_type": "message.receipt.read",
  "event_category": "receipt",
  "jid": "5511999999999@s.whatsapp.net",
  "participant": null,
  "message_id": "3EB0C431C72FE708E4B1",
  "from_me": true,
  "payload": {
    "userJid": "5511999999999@s.whatsapp.net",
    "receiptTimestamp": 1705420800000,
    "readTimestamp": 1705420850000,
    "receiptType": "read",
    "timestamp": "2025-01-16T12:00:00.000Z"
  },
  "created_at": "2025-01-16T12:00:00.000Z"
}
```

#### Receipt Types

- `delivered`: Message delivered to recipient's device
- `read`: Message read by recipient

#### Webhook Payload

```json
{
  "event": "message.receipt.read",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "messageId": "3EB0C431C72FE708E4B1",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "participant": null,
    "fromMe": true,
    "userJid": "5511999999999@s.whatsapp.net",
    "receiptTimestamp": 1705420800000,
    "readTimestamp": 1705420850000,
    "receiptType": "read",
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

#### Database Updates

Receipt events automatically update the `messages` table:

```sql
UPDATE messages 
SET 
  status = 'read',
  read_at = '2025-01-16 12:00:50',
  delivered_at = '2025-01-16 12:00:00'
WHERE wa_message_id = '3EB0C431C72FE708E4B1'
```

#### Use Cases

- Show double/blue checkmarks
- Track message engagement metrics
- Build delivery reports
- Customer support analytics

---

### Reaction Events

Track emoji reactions to messages.

#### Event Structure

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "event_type": "message.reaction",
  "event_category": "reaction",
  "jid": "5511999999999@s.whatsapp.net",
  "participant": "5511888888888@s.whatsapp.net",
  "message_id": "3EB0C431C72FE708E4B1",
  "from_me": false,
  "payload": {
    "reaction": {
      "text": "❤️",
      "senderTimestampMs": 1705420800000
    }
  },
  "created_at": "2025-01-16T12:00:00.000Z"
}
```

#### Webhook Payload

```json
{
  "event": "message.reaction",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "messageId": "3EB0C431C72FE708E4B1",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "participant": "5511888888888@s.whatsapp.net",
    "fromMe": false,
    "reaction": {
      "text": "❤️",
      "senderTimestampMs": 1705420800000
    },
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

#### Removing Reactions

When a user removes a reaction, `reaction.text` will be empty:

```json
{
  "reaction": {
    "text": "",
    "senderTimestampMs": 1705420850000
  }
}
```

#### Use Cases

- Track customer satisfaction via reactions
- Build engagement analytics
- Display reaction counts on messages
- Monitor popular content

---

### Call Events

Track voice and video call events.

#### Event Structure

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "call_id": "CALL_ID_12345",
  "chat_id": "5511999999999@s.whatsapp.net",
  "from_jid": "5511888888888@s.whatsapp.net",
  "group_jid": null,
  "is_video": false,
  "is_group": false,
  "status": "offer",
  "offline": false,
  "latency_ms": 150,
  "timestamp": "2025-01-16T12:00:00.000Z",
  "created_at": "2025-01-16T12:00:00.000Z"
}
```

#### Call Status Types

- `offer`: Incoming call offer received
- `ringing`: Call is ringing
- `accept`: Call accepted
- `reject`: Call rejected
- `timeout`: Call timed out (unanswered)
- `terminate`: Call ended

#### Webhook Payload

```json
{
  "event": "call.offer",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "callId": "CALL_ID_12345",
    "callDbId": "uuid",
    "chatId": "5511999999999@s.whatsapp.net",
    "from": "5511888888888@s.whatsapp.net",
    "isVideo": false,
    "isGroup": false,
    "groupJid": null,
    "status": "offer",
    "offline": false,
    "latencyMs": 150,
    "date": "2025-01-16T12:00:00.000Z"
  }
}
```

#### Group Calls

For group calls, additional fields are populated:

```json
{
  "is_group": true,
  "group_jid": "120363123456789012@g.us",
  "from_jid": "5511888888888@s.whatsapp.net"
}
```

#### Use Cases

- Log call history
- Track missed calls
- Build call analytics dashboards
- Auto-respond to missed calls
- Monitor support team availability

---

### Group Events

Track group participant changes and metadata updates.

#### Participant Events

##### Add/Remove/Promote/Demote

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "event_type": "group.participants.add",
  "event_category": "group",
  "jid": "120363123456789012@g.us",
  "participant": "5511888888888@s.whatsapp.net",
  "payload": {
    "action": "add",
    "participants": [
      {
        "id": "5511999999999@s.whatsapp.net",
        "notify": "John Doe"
      }
    ],
    "author": "5511888888888@s.whatsapp.net"
  },
  "created_at": "2025-01-16T12:00:00.000Z"
}
```

##### Webhook Payload

```json
{
  "event": "group.participants.add",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "groupId": "120363123456789012@g.us",
    "action": "add",
    "participants": [
      {
        "id": "5511999999999@s.whatsapp.net",
        "notify": "John Doe"
      }
    ],
    "author": "5511888888888@s.whatsapp.net",
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

#### Metadata Events

Track group name, description, and settings changes.

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "event_type": "group.update",
  "event_category": "group",
  "jid": "120363123456789012@g.us",
  "participant": null,
  "payload": {
    "id": "120363123456789012@g.us",
    "subject": "New Group Name",
    "desc": "Updated description",
    "announce": false,
    "restrict": true
  },
  "created_at": "2025-01-16T12:00:00.000Z"
}
```

##### Webhook Payload

```json
{
  "event": "group.update",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "groupId": "120363123456789012@g.us",
    "updates": {
      "subject": "New Group Name",
      "desc": "Updated description",
      "announce": false,
      "restrict": true
    },
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

#### Group Actions

- `add`: Participant added to group
- `remove`: Participant removed from group
- `promote`: Participant promoted to admin
- `demote`: Admin demoted to participant

#### Group Settings

- `announce`: Only admins can send messages
- `restrict`: Only admins can edit group info

#### Use Cases

- Track group member activity
- Audit group admin actions
- Monitor group growth
- Auto-welcome new members
- Track group metadata changes

---

## API Endpoints

### Get Session Events

Retrieve events for a specific session.

```
GET /api/v1/sessions/:id/events
```

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `type` | string | Event category filter (`presence`, `receipt`, `reaction`, `call`, `group`) | - |
| `limit` | number | Number of events to return (max 200) | 50 |
| `offset` | number | Pagination offset | 0 |
| `from` | string | Start date (ISO 8601) | - |
| `to` | string | End date (ISO 8601) | - |

#### Example Request

```bash
curl -X GET 'http://localhost:3000/api/v1/sessions/6137713e-97d9-4045-8b6f-857378719571/events?type=presence&limit=10' \
  -H 'X-API-Key: your-api-key'
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "uuid",
        "event_type": "presence.update",
        "event_category": "presence",
        "jid": "5511999999999@s.whatsapp.net",
        "participant": "5511999999999@s.whatsapp.net",
        "message_id": null,
        "from_me": false,
        "payload": {
          "lastKnownPresence": "composing",
          "timestamp": "2025-01-16T12:00:00.000Z"
        },
        "severity": "info",
        "created_at": "2025-01-16T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 10,
      "offset": 0,
      "has_more": true
    }
  }
}
```

---

### Get Session Calls

Retrieve call history for a specific session.

```
GET /api/v1/sessions/:id/calls
```

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `status` | string | Call status filter (`offer`, `ringing`, `accept`, `reject`, `timeout`, `terminate`) | - |
| `is_video` | boolean | Filter by video calls (`true`/`false`) | - |
| `limit` | number | Number of calls to return (max 200) | 50 |
| `offset` | number | Pagination offset | 0 |

#### Example Request

```bash
curl -X GET 'http://localhost:3000/api/v1/sessions/6137713e-97d9-4045-8b6f-857378719571/calls?status=offer&limit=20' \
  -H 'X-API-Key: your-api-key'
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "calls": [
      {
        "id": "uuid",
        "call_id": "CALL_ID_12345",
        "chat_id": "5511999999999@s.whatsapp.net",
        "from_jid": "5511888888888@s.whatsapp.net",
        "group_jid": null,
        "is_video": false,
        "is_group": false,
        "status": "offer",
        "offline": false,
        "latency_ms": 150,
        "timestamp": "2025-01-16T12:00:00.000Z",
        "created_at": "2025-01-16T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "limit": 20,
      "offset": 0,
      "has_more": true
    }
  }
}
```

---

### Send Presence Update

Send typing/recording/online status to a contact or group.

```
POST /api/v1/sessions/:id/presence
```

#### Request Body

```json
{
  "jid": "5511999999999@s.whatsapp.net",
  "type": "composing"
}
```

#### Presence Types

- `composing`: Show "typing..." indicator
- `recording`: Show "recording audio..." indicator
- `available`: Mark as online
- `unavailable`: Mark as offline

#### Example Request

```bash
curl -X POST 'http://localhost:3000/api/v1/sessions/6137713e-97d9-4045-8b6f-857378719571/presence' \
  -H 'X-API-Key: your-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "jid": "5511999999999@s.whatsapp.net",
    "type": "composing"
  }'
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "sessionId": "6137713e-97d9-4045-8b6f-857378719571",
    "jid": "5511999999999@s.whatsapp.net",
    "type": "composing",
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

> **Note**: Presence updates expire after ~10 seconds. Send periodically to maintain status.

---

### Subscribe to Presence Updates

Subscribe to receive presence updates for a specific contact or group.

```
POST /api/v1/sessions/:id/presence/subscribe
```

#### Request Body

```json
{
  "jid": "5511999999999@s.whatsapp.net"
}
```

#### Example Request

```bash
curl -X POST 'http://localhost:3000/api/v1/sessions/6137713e-97d9-4045-8b6f-857378719571/presence/subscribe' \
  -H 'X-API-Key: your-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "jid": "5511999999999@s.whatsapp.net"
  }'
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "sessionId": "6137713e-97d9-4045-8b6f-857378719571",
    "jid": "5511999999999@s.whatsapp.net",
    "subscribed": true,
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

> **Important**: You must subscribe before receiving presence updates. WhatsApp only sends presence to subscribed contacts.

---

## Webhooks

All events can be delivered via webhooks when configured in the session.

### Webhook Configuration

Set webhook URL when creating/updating a session:

```json
{
  "name": "My Session",
  "webhook_url": "https://yourapp.com/webhooks/whatsapp"
}
```

### Webhook Request Format

ZapHub sends POST requests to your webhook URL:

```
POST https://yourapp.com/webhooks/whatsapp
Content-Type: application/json
X-ZapHub-Signature: sha256=...
X-ZapHub-Event: presence.update
X-ZapHub-Session-Id: 6137713e-97d9-4045-8b6f-857378719571
```

```json
{
  "event": "presence.update",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "data": {
    "jid": "5511999999999@s.whatsapp.net",
    "participant": "5511999999999@s.whatsapp.net",
    "presence": "composing",
    "timestamp": "2025-01-16T12:00:00.000Z"
  }
}
```

### Event Types

| Event | Description |
|-------|-------------|
| `presence.update` | User typing, recording, online/offline |
| `message.receipt.delivered` | Message delivered |
| `message.receipt.read` | Message read |
| `message.reaction` | Message reaction added/removed |
| `message.edited` | Message edited (conteúdo atualizado) |
| `message.deleted` | Message deleted (após revogação) |
| `call.offer` | Incoming call offer |
| `call.ringing` | Call is ringing |
| `call.accept` | Call accepted |
| `call.reject` | Call rejected |
| `call.timeout` | Call timeout (missed) |
| `call.terminate` | Call ended |
| `group.participants.add` | Participant added |
| `group.participants.remove` | Participant removed |
| `group.participants.promote` | Participant promoted to admin |
| `group.participants.demote` | Admin demoted |
| `group.update` | Group metadata updated |

### Mensagens editadas e deletadas

O WhatsApp entrega `messages.update` com `editedMessage` ou `protocolMessage.REVOKE` quando alguém edita ou apaga uma mensagem. O ZapHub transforma esses eventos em `message.edited` e `message.deleted` e envia o payload (campo `data`, também duplicado em `payload`) para o webhook configurado.

Campos principais entregues em ambos os eventos:

- `messageId`: UUID interno do ZapHub
- `waMessageId`: ID do WhatsApp (`wamid.HBgM...`)
- `remoteJid`: chat (pode ser `5511999999999@s.whatsapp.net` ou grupo)
- `participant`: autor real em grupos (`null` para conversas 1:1)
- `fromMe`: indica se a mensagem foi enviada pela sessão atual
- `type`: tipo de mensagem (`text`, `image`, `video`, etc.)
- `content`: payload atual (novo texto no `message.edited`, última versão visível no `message.deleted`)
- `timestamp`: quando o evento foi registrado

O evento `message.edited` ainda inclui:

- `previousContent`: corpo anterior, útil para mostrar o delta no front-end
- `editedAt` e `editedBy`: carimbos de data/autor da edição

O evento `message.deleted` adiciona:

- `deletedAt` e `deletedBy`: quem removeu a mensagem e quando

#### Exemplo `message.edited`

```json
{
  "type": "message",
  "event": "message.edited",
  "sessionId": "6137713e-97d9-4045-8b6f-857378719571",
  "payload": {
    "messageId": "8d6af8c3-2e3f-4a1c-b1e8-7b12c5f143de",
    "waMessageId": "wamid.HBgM...",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "participant": null,
    "fromMe": true,
    "type": "text",
    "content": {
      "text": "Agora com a versão corrigida"
    },
    "previousContent": {
      "text": "Versão inicial com erro"
    },
    "editedAt": "2025-05-01T12:34:56.789Z",
    "editedBy": "5511999999999@s.whatsapp.net",
    "timestamp": "2025-05-01T12:34:56.789Z"
  },
  "data": {
    "messageId": "8d6af8c3-2e3f-4a1c-b1e8-7b12c5f143de",
    "waMessageId": "wamid.HBgM...",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "participant": null,
    "fromMe": true,
    "type": "text",
    "content": {
      "text": "Agora com a versão corrigida"
    },
    "previousContent": {
      "text": "Versão inicial com erro"
    },
    "editedAt": "2025-05-01T12:34:56.789Z",
    "editedBy": "5511999999999@s.whatsapp.net",
    "timestamp": "2025-05-01T12:34:56.789Z"
  },
  "timestamp": "2025-05-01T12:34:56.789Z",
  "deliveryId": "webhook-6137713e-...-0"
}
```

#### Exemplo `message.deleted`

```json
{
  "type": "message",
  "event": "message.deleted",
  "sessionId": "6137713e-97d9-4045-8b6f-857378719571",
  "payload": {
    "messageId": "5c1bde9f-43b4-4c82-a6f9-9f1ef81a2f4a",
    "waMessageId": "wamid.HBgN...",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "participant": null,
    "fromMe": false,
    "type": "text",
    "content": {
      "text": "Mensagem original que foi removida"
    },
    "deletedAt": "2025-05-01T12:40:00.000Z",
    "deletedBy": "5511999999999@s.whatsapp.net",
    "timestamp": "2025-05-01T12:40:00.000Z"
  },
  "data": {
    "messageId": "5c1bde9f-43b4-4c82-a6f9-9f1ef81a2f4a",
    "waMessageId": "wamid.HBgN...",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "participant": null,
    "fromMe": false,
    "type": "text",
    "content": {
      "text": "Mensagem original que foi removida"
    },
    "deletedAt": "2025-05-01T12:40:00.000Z",
    "deletedBy": "5511999999999@s.whatsapp.net",
    "timestamp": "2025-05-01T12:40:00.000Z"
  },
  "timestamp": "2025-05-01T12:40:00.000Z",
  "deliveryId": "webhook-6137713e-...-1"
}
```

---

## Database Schema

### Events Table

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL,
  jid VARCHAR(255),
  participant VARCHAR(255),
  message_id VARCHAR(255),
  from_me BOOLEAN DEFAULT false,
  payload JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Calls Table

```sql
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  call_id VARCHAR(255) NOT NULL,
  chat_id VARCHAR(255) NOT NULL,
  from_jid VARCHAR(255) NOT NULL,
  group_jid VARCHAR(255),
  is_video BOOLEAN DEFAULT false,
  is_group BOOLEAN DEFAULT false,
  status VARCHAR(50) NOT NULL,
  offline BOOLEAN DEFAULT false,
  latency_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calls_unique_call_id UNIQUE (session_id, call_id)
);
```

---

## Examples

### Example 1: Show Typing Indicator

```javascript
// Subscribe to presence updates
await fetch(`${API_URL}/sessions/${sessionId}/presence/subscribe`, {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jid: '5511999999999@s.whatsapp.net',
  }),
});

// Send typing indicator
await fetch(`${API_URL}/sessions/${sessionId}/presence`, {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jid: '5511999999999@s.whatsapp.net',
    type: 'composing',
  }),
});

// Stop typing after 3 seconds
setTimeout(async () => {
  await fetch(`${API_URL}/sessions/${sessionId}/presence`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jid: '5511999999999@s.whatsapp.net',
      type: 'available',
    }),
  });
}, 3000);
```

### Example 2: Track Message Read Status

```javascript
// Webhook handler
app.post('/webhooks/whatsapp', (req, res) => {
  const { event, data } = req.body;

  if (event === 'message.receipt.read') {
    console.log(`Message ${data.messageId} was read by ${data.userJid}`);
    console.log(`Read at: ${new Date(data.readTimestamp)}`);
    
    // Update your UI, database, etc.
    updateMessageStatus(data.messageId, 'read');
  }

  res.status(200).send('OK');
});
```

### Example 3: Auto-Respond to Missed Calls

```javascript
app.post('/webhooks/whatsapp', async (req, res) => {
  const { event, session_id, data } = req.body;

  if (event === 'call.timeout') {
    // Call was missed - send auto-reply
    await fetch(`${API_URL}/sessions/${session_id}/messages/send`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: data.from,
        type: 'text',
        content: {
          text: 'Desculpe, não pude atender. Como posso ajudar?',
        },
      }),
    });
  }

  res.status(200).send('OK');
});
```

### Example 4: Monitor Group Activity

```javascript
app.post('/webhooks/whatsapp', async (req, res) => {
  const { event, data } = req.body;

  switch (event) {
    case 'group.participants.add':
      console.log(`New member ${data.participants[0].id} added to group ${data.groupId}`);
      // Send welcome message
      break;

    case 'group.participants.remove':
      console.log(`Member ${data.participants[0].id} removed from group ${data.groupId}`);
      break;

    case 'group.update':
      if (data.updates.subject) {
        console.log(`Group name changed to: ${data.updates.subject}`);
      }
      break;
  }

  res.status(200).send('OK');
});
```

---

## Best Practices

1. **Subscribe Before Listening**: Always call `/presence/subscribe` before expecting presence events
2. **Refresh Typing Status**: Presence expires after ~10s, send updates periodically
3. **Handle Webhooks Idempotently**: Events may be delivered multiple times
4. **Use Pagination**: Query events/calls with proper limit/offset for large datasets
5. **Filter by Category**: Use `type` parameter to get specific event types
6. **Monitor Worker Health**: Ensure event workers are running (`npm run worker:events`)
7. **Database Cleanup**: Implement retention policies for old events
8. **Webhook Validation**: Verify `X-ZapHub-Signature` header in production

---

## Troubleshooting

### Events Not Appearing

1. Check if event workers are running: `npm run worker:events`
2. Verify Redis connection
3. Check database migrations are applied
4. Enable debug logs: `LOG_LEVEL=debug`

### Webhooks Not Firing

1. Verify `webhook_url` is set in session
2. Check webhook worker is running: `npm run worker`
3. Ensure webhook endpoint is reachable
4. Check webhook queue: query `bullmq` Redis keys

### Presence Updates Not Received

1. Must call `/presence/subscribe` first
2. Check session is connected
3. Verify JID format is correct
4. Ensure presence worker is running

---

## Architecture

```
┌─────────────┐
│   Baileys   │ WebSocket events
│   Socket    │
└──────┬──────┘
       │
       │ socket.ev.on('presence.update')
       │ socket.ev.on('message-receipt.update')
       │ socket.ev.on('call')
       │ socket.ev.on('group-participants.update')
       │ socket.ev.on('groups.update')
       │ socket.ev.on('messages.reaction')
       ▼
┌──────────────────┐
│ ConnectionManager│
└──────┬───────────┘
       │
       │ Enqueue to BullMQ
       ▼
┌──────────────────┐      ┌─────────────┐
│  Event Queues    │─────▶│   Workers   │
│                  │      │             │
│ - presence       │      │ - Save to DB│
│ - receipt        │      │ - Trigger   │
│ - call           │      │   webhooks  │
└──────────────────┘      └─────────────┘
       │                         │
       ▼                         ▼
┌──────────────────┐      ┌─────────────┐
│   PostgreSQL     │      │  Webhook    │
│                  │      │  Endpoint   │
│ - events table   │      │             │
│ - calls table    │      │ (Your App)  │
└──────────────────┘      └─────────────┘
```

---

## Support

For issues or questions:
- GitHub Issues: [Create an issue](https://github.com/yourorg/zaphub/issues)
- Documentation: [Full Docs](../README.md)
- API Reference: [OpenAPI Spec](../docs/api.yaml)

---

**ZapHub** - Enterprise WhatsApp API Platform
