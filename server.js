const http = require("http");
const fs = require("fs");
const path = require("path");

const portArg = process.argv.find(arg => arg.startsWith("--port="));
const PORT = Number(process.env.PORT || (portArg ? portArg.split("=")[1] : 3000));
const PUBLIC_DIR = path.join(__dirname, "public");

const state = {
  avgConsultationMinutes: 8,
  nextToken: 1,
  current: null,
  waiting: [],
  served: [],
  updatedAt: new Date().toISOString(),
  version: 0
};

const clients = new Set();

function minutesToMs(minutes) {
  return Number(minutes) * 60 * 1000;
}

function remainingCurrentMinutes(now = Date.now()) {
  if (!state.current) return 0;
  const elapsed = now - new Date(state.current.calledAt).getTime();
  const remainingMs = Math.max(0, minutesToMs(state.avgConsultationMinutes) - elapsed);
  return Math.ceil(remainingMs / 60000);
}

function publicState() {
  const now = Date.now();
  const currentRemainingMinutes = remainingCurrentMinutes(now);
  const waiting = state.waiting.map((patient, index) => {
    const estimatedWaitMinutes = currentRemainingMinutes + index * state.avgConsultationMinutes;
    return {
      ...patient,
      position: index + 1,
      tokensAhead: index,
      estimatedWaitMinutes
    };
  });

  return {
    avgConsultationMinutes: state.avgConsultationMinutes,
    current: state.current
      ? {
          ...state.current,
          elapsedMinutes: Math.max(0, Math.floor((now - new Date(state.current.calledAt).getTime()) / 60000)),
          remainingMinutes: currentRemainingMinutes
        }
      : null,
    waiting,
    served: state.served.slice(-8).reverse(),
    nextToken: state.nextToken,
    updatedAt: state.updatedAt,
    version: state.version,
    stats: {
      waitingCount: waiting.length,
      servedCount: state.served.length
    }
  };
}

function touch() {
  state.version += 1;
  state.updatedAt = new Date().toISOString();
}

function broadcast(eventName = "queue:update") {
  const payload = JSON.stringify(publicState());
  for (const client of clients) {
    client.write(`event: ${eventName}\n`);
    client.write(`data: ${payload}\n\n`);
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function addPatient(input) {
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const concern = String(input.concern || "").trim();

  if (!name) {
    return { error: "Patient name is required." };
  }

  const patient = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    token: state.nextToken,
    name,
    phone,
    concern,
    addedAt: new Date().toISOString()
  };

  state.nextToken += 1;
  state.waiting.push(patient);
  touch();
  return { patient };
}

function callNext() {
  if (state.waiting.length === 0) {
    return { error: "No patients are waiting." };
  }

  if (state.current) {
    state.served.push({
      ...state.current,
      completedAt: new Date().toISOString()
    });
  }

  const next = state.waiting.shift();
  state.current = {
    ...next,
    calledAt: new Date().toISOString()
  };
  touch();
  return { patient: state.current };
}

function updateSettings(input) {
  const avg = Number(input.avgConsultationMinutes);
  if (!Number.isFinite(avg) || avg < 1 || avg > 120) {
    return { error: "Average consultation time must be between 1 and 120 minutes." };
  }
  state.avgConsultationMinutes = Math.round(avg);
  touch();
  return { avgConsultationMinutes: state.avgConsultationMinutes };
}

function serveStatic(req, res) {
  const rawPath = req.url === "/" ? "/index.html" : req.url;
  const pathname = decodeURIComponent(rawPath.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    };

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/state") {
      sendJson(res, 200, publicState());
      return;
    }

    if (req.method === "GET" && req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.write(`event: queue:update\n`);
      res.write(`data: ${JSON.stringify(publicState())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "POST" && req.url === "/api/patients") {
      const result = addPatient(await parseBody(req));
      if (result.error) return sendJson(res, 400, result);
      broadcast("patient:added");
      sendJson(res, 201, { ...result, state: publicState() });
      return;
    }

    if (req.method === "POST" && req.url === "/api/call-next") {
      const result = callNext();
      if (result.error) return sendJson(res, 409, result);
      broadcast("token:called");
      sendJson(res, 200, { ...result, state: publicState() });
      return;
    }

    if (req.method === "POST" && req.url === "/api/settings") {
      const result = updateSettings(await parseBody(req));
      if (result.error) return sendJson(res, 400, result);
      broadcast("settings:updated");
      sendJson(res, 200, { ...result, state: publicState() });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error("Close the other app or run: npm run start:4000");
    process.exit(1);
  }

  throw error;
});

server.listen(PORT, () => {
  console.log(`Queue Cure '26 is running at http://localhost:${PORT}`);
});
