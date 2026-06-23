# Thought Process Sheet

## Problem

Small clinics often use paper slips and verbal calls. The biggest pain is not token creation; it is uncertainty. Patients need to know what is happening, and receptionists need a fast interface that does not create duplicate or confusing calls.

## Approach

I built one shared queue state on the server and two synchronized browser views:

- Receptionist view for adding patients, calling the next token, and setting average consultation time.
- Patient waiting-room view for current token, tokens ahead, and estimated wait.
- Live sync uses a persistent event stream so open screens update immediately after each action.

## Wait-Time Logic

Wait time is not hardcoded. It uses:

```text
remaining current consultation minutes + tokens ahead * average consultation minutes
```
git remote add origin https://github.com/Nameera046/Queue-Cure-26.git
The remaining current consultation time comes from the actual `calledAt` timestamp. If no patient is currently being seen, remaining time is zero.

## Concurrency

The server is the single source of truth. Browsers never calculate or mutate the queue independently. All writes go through server endpoints:

- `POST /api/patients`
- `POST /api/call-next`
- `POST /api/settings`

Node processes each request through the event loop, and the queue mutation is synchronous. That prevents two browser tabs from both calling the same next token inside this prototype. After every mutation, the server broadcasts a full queue snapshot to all connected clients.

For production, I would persist queue state in a database transaction and put `call next` inside a row lock or atomic update so multiple receptionist devices cannot race.

## Edge Cases Covered

- Empty queue: Call Next is disabled in the UI and rejected by the server.
- Missing patient name: rejected before adding a token.
- Invalid average consultation time: rejected outside 1 to 120 minutes.
- Browser reconnect: each client receives a full snapshot when it reconnects.
- Stale UI: every live event contains full state, not just a small patch.
- Current consultation over estimated time: remaining time floors at zero instead of going negative.

## Tradeoffs

The prototype stores queue state in memory to keep the demo simple and easy to run. Restarting the server clears the queue. For a real clinic, I would add persistent storage, authentication, per-clinic queue rooms, audit logs, and SMS or WhatsApp notifications.
