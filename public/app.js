const stateView = {
  current: null,
  selectedToken: null
};

const els = {
  syncStatus: document.querySelector("#syncStatus"),
  patientForm: document.querySelector("#patientForm"),
  callNextBtn: document.querySelector("#callNextBtn"),
  avgTimeInput: document.querySelector("#avgTimeInput"),
  receptionQueue: document.querySelector("#receptionQueue"),
  waitingCount: document.querySelector("#waitingCount"),
  currentToken: document.querySelector("#currentToken"),
  currentName: document.querySelector("#currentName"),
  updatedAt: document.querySelector("#updatedAt"),
  tokenSelect: document.querySelector("#tokenSelect"),
  tokensAhead: document.querySelector("#tokensAhead"),
  estimatedWait: document.querySelector("#estimatedWait"),
  patientBoard: document.querySelector("#patientBoard"),
  servedCount: document.querySelector("#servedCount"),
  toast: document.querySelector("#toast")
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function formatClock(iso) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

function concernText(patient) {
  const parts = [patient.concern, patient.phone].filter(Boolean);
  return parts.length ? parts.join(" / ") : "No extra details";
}

function empty(message) {
  const div = document.createElement("div");
  div.className = "empty";
  div.textContent = message;
  return div;
}

function queueItem(patient) {
  const row = document.createElement("div");
  row.className = "queue-item";
  row.innerHTML = `
    <div class="token">#${patient.token}</div>
    <div class="patient-meta">
      <strong></strong>
      <span></span>
    </div>
    <div class="wait-badge">${patient.estimatedWaitMinutes} min</div>
  `;
  row.querySelector("strong").textContent = patient.name;
  row.querySelector("span").textContent = concernText(patient);
  return row;
}

function tokenRow(patient) {
  const row = document.createElement("div");
  row.className = "token-row";
  row.innerHTML = `
    <div class="token">#${patient.token}</div>
    <div class="patient-meta">
      <strong></strong>
      <span>${patient.tokensAhead} ahead</span>
    </div>
    <div class="wait-badge">${patient.estimatedWaitMinutes} min</div>
  `;
  row.querySelector("strong").textContent = patient.name;
  return row;
}

function renderQueue(container, patients, renderer, emptyMessage) {
  container.replaceChildren();
  if (!patients.length) {
    container.append(empty(emptyMessage));
    return;
  }
  patients.forEach(patient => container.append(renderer(patient)));
}

function renderTokenSelect(waiting) {
  const previous = String(stateView.selectedToken || els.tokenSelect.value || "");
  els.tokenSelect.replaceChildren();

  if (!waiting.length) {
    const option = new Option("No waiting tokens", "");
    els.tokenSelect.append(option);
    els.tokenSelect.disabled = true;
    stateView.selectedToken = null;
    return;
  }

  els.tokenSelect.disabled = false;
  waiting.forEach(patient => {
    const option = new Option(`#${patient.token} - ${patient.name}`, patient.token);
    els.tokenSelect.append(option);
  });

  const stillExists = waiting.some(patient => String(patient.token) === previous);
  els.tokenSelect.value = stillExists ? previous : String(waiting[0].token);
  stateView.selectedToken = Number(els.tokenSelect.value);
}

function renderTrackedEstimate(waiting) {
  const selected = waiting.find(patient => patient.token === stateView.selectedToken);
  if (!selected) {
    els.tokensAhead.textContent = "--";
    els.estimatedWait.textContent = "--";
    return;
  }

  els.tokensAhead.textContent = String(selected.tokensAhead);
  els.estimatedWait.textContent = `${selected.estimatedWaitMinutes} min`;
}

function render(state) {
  stateView.current = state;
  els.avgTimeInput.value = state.avgConsultationMinutes;
  els.waitingCount.textContent = `${state.stats.waitingCount} waiting`;
  els.servedCount.textContent = `${state.stats.servedCount} served`;
  els.callNextBtn.disabled = state.waiting.length === 0;
  els.updatedAt.textContent = `Updated ${formatClock(state.updatedAt)}`;

  if (state.current) {
    els.currentToken.textContent = `#${state.current.token}`;
    els.currentName.textContent = `${state.current.name} / about ${state.current.remainingMinutes} min left`;
  } else {
    els.currentToken.textContent = "--";
    els.currentName.textContent = "No patient is currently with the doctor.";
  }

  renderQueue(els.receptionQueue, state.waiting, queueItem, "No patients waiting. Add the next patient above.");
  renderQueue(els.patientBoard, state.waiting, tokenRow, "The waiting room is clear.");
  renderTokenSelect(state.waiting);
  renderTrackedEstimate(state.waiting);
}

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Action failed.");
  return data;
}

els.patientForm.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(els.patientForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    await postJson("/api/patients", payload);
    els.patientForm.reset();
    els.patientForm.elements.name.focus();
    showToast(`Token added for ${payload.name.trim()}`);
  } catch (error) {
    showToast(error.message);
  }
});

els.callNextBtn.addEventListener("click", async () => {
  els.callNextBtn.disabled = true;
  try {
    const result = await postJson("/api/call-next");
    showToast(`Called token #${result.patient.token}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    els.callNextBtn.disabled = stateView.current?.waiting.length === 0;
  }
});

els.avgTimeInput.addEventListener("change", async () => {
  try {
    await postJson("/api/settings", {
      avgConsultationMinutes: els.avgTimeInput.value
    });
    showToast("Average time updated");
  } catch (error) {
    showToast(error.message);
    if (stateView.current) els.avgTimeInput.value = stateView.current.avgConsultationMinutes;
  }
});

els.tokenSelect.addEventListener("change", () => {
  stateView.selectedToken = Number(els.tokenSelect.value);
  renderTrackedEstimate(stateView.current?.waiting || []);
});

function connectEvents() {
  const events = new EventSource("/events");

  events.addEventListener("open", () => {
    els.syncStatus.textContent = "Live sync on";
    els.syncStatus.className = "sync-pill online";
  });

  events.addEventListener("error", () => {
    els.syncStatus.textContent = "Reconnecting...";
    els.syncStatus.className = "sync-pill offline";
  });

  ["queue:update", "patient:added", "token:called", "settings:updated"].forEach(eventName => {
    events.addEventListener(eventName, event => {
      render(JSON.parse(event.data));
    });
  });
}

fetch("/api/state")
  .then(response => response.json())
  .then(render)
  .catch(error => showToast(error.message));

connectEvents();
