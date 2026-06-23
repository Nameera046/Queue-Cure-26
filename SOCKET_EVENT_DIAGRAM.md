# Socket Event Diagram

This prototype uses Server-Sent Events for live browser sync. The behavior is the same live-update pattern expected from sockets: clients subscribe once, then receive queue events immediately after receptionist actions.

```mermaid
sequenceDiagram
  participant R as Receptionist Browser
  participant S as Node Server
  participant P as Patient Waiting Room Browser

  R->>S: GET /events
  P->>S: GET /events
  S-->>R: queue:update initial state
  S-->>P: queue:update initial state

  R->>S: POST /api/patients { name, phone, concern }
  S->>S: Assign token and append to waiting queue
  S-->>R: patient:added queue snapshot
  S-->>P: patient:added queue snapshot

  R->>S: POST /api/call-next
  S->>S: Move current to served, shift next waiting token to current
  S-->>R: token:called queue snapshot
  S-->>P: token:called queue snapshot

  R->>S: POST /api/settings { avgConsultationMinutes }
  S->>S: Recalculate estimates from live queue data
  S-->>R: settings:updated queue snapshot
  S-->>P: settings:updated queue snapshot
```

## Events

| Event | Trigger | Payload |
| --- | --- | --- |
| `queue:update` | Client connects | Full queue snapshot |
| `patient:added` | Receptionist adds patient | Full queue snapshot |
| `token:called` | Receptionist clicks Call Next | Full queue snapshot |
| `settings:updated` | Average consultation time changes | Full queue snapshot |

Every event sends a complete state snapshot so a reconnecting or slightly stale browser can recover without replaying old events.
