# Queue Cure '26

Queue Cure '26 is a beginner-friendly full-stack clinic queue prototype. It replaces paper token slips with a live receptionist console and patient waiting-room board.

## Features

- Add patients with automatic token numbers.
- Call the next token from the receptionist screen.
- Set average consultation time from real receptionist input.
- Patient screen shows current token, tokens ahead, and estimated wait.
- Live updates across open browser tabs without refresh using Server-Sent Events.
- No external dependencies required.

## Run Locally

```bash
npm start
```

Open:

- Receptionist + patient board: `http://localhost:3000`
- To test live sync, open the same URL in two tabs or two browser windows.

## How Wait Time Is Computed

The server owns the queue state. For each waiting patient:

```text
estimated wait = remaining time for current consultation + tokens ahead * average consultation minutes
```

The current consultation remaining time is calculated from the actual `calledAt` timestamp and the receptionist's average consultation setting.

## Project Structure

```text
server.js                    HTTP API, queue state, live event stream
public/index.html            Two-screen prototype UI
public/styles.css            Responsive clinic dashboard styling
public/app.js                Browser actions and live rendering
SOCKET_EVENT_DIAGRAM.md      Submission event diagram
THOUGHT_PROCESS.md           Concurrency and edge-case notes
```

## API

```text
GET  /api/state       Current queue snapshot
GET  /events          Live event stream
POST /api/patients    Add a waiting patient
POST /api/call-next   Move next waiting patient into current consultation
POST /api/settings    Update average consultation minutes
```
