const videoUpload = document.getElementById("videoUpload");
const matchVideo = document.getElementById("matchVideo");
const currentTimestamp = document.getElementById("currentTimestamp");
const pitch = document.getElementById("pitch");
const pitchMarker = document.getElementById("pitchMarker");
const coordDisplay = document.getElementById("coordDisplay");
const homePlayers = document.getElementById("homePlayers");
const awayPlayers = document.getElementById("awayPlayers");
const eventTypes = document.getElementById("eventTypes");
const recordEvent = document.getElementById("recordEvent");
const eventLog = document.getElementById("eventLog");
const eventCount = document.getElementById("eventCount");
const exportCsv = document.getElementById("exportCsv");
const clearEvents = document.getElementById("clearEvents");

const STORAGE_KEY = "touchline-events";

const EVENT_OPTIONS = [
  "Pass",
  "Shot",
  "Tackle",
  "Dribble",
  "Clearance",
  "Foul",
  "Corner",
  "Free Kick",
];

let selectedPlayer = null;
let selectedEventType = null;
let selectedCoordinates = { x: 50, y: 50 };
let events = [];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function updateTimestamp() {
  currentTimestamp.textContent = formatTime(matchVideo.currentTime || 0);
}

function buildButtons() {
  for (let i = 1; i <= 11; i += 1) {
    const homeButton = document.createElement("button");
    homeButton.type = "button";
    homeButton.textContent = i;
    homeButton.className = "player-button";
    homeButton.dataset.player = `H${i}`;
    homePlayers.appendChild(homeButton);

    const awayButton = document.createElement("button");
    awayButton.type = "button";
    awayButton.textContent = i;
    awayButton.className = "player-button";
    awayButton.dataset.player = `A${i}`;
    awayPlayers.appendChild(awayButton);
  }

  EVENT_OPTIONS.forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = type;
    button.className = "event-button";
    button.dataset.eventType = type;
    eventTypes.appendChild(button);
  });
}

function setActiveButton(container, selector, value) {
  container.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.player === value || button.dataset.eventType === value
    );
  });
}

function updatePitchMarker() {
  pitchMarker.style.left = `${selectedCoordinates.x}%`;
  pitchMarker.style.top = `${selectedCoordinates.y}%`;
  coordDisplay.textContent = `X: ${selectedCoordinates.x}% · Y: ${selectedCoordinates.y}%`;
}

function handlePitchClick(event) {
  const rect = pitch.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  selectedCoordinates = {
    x: Math.min(100, Math.max(0, Math.round(x))),
    y: Math.min(100, Math.max(0, Math.round(y))),
  };
  updatePitchMarker();
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function loadEvents() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      events = JSON.parse(stored);
    } catch (error) {
      events = [];
    }
  }
  renderEvents();
}

function renderEvents() {
  eventLog.innerHTML = "";
  if (events.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No events recorded yet.";
    eventLog.appendChild(empty);
  } else {
    events.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "event-entry";
      row.innerHTML = `
        <span>${entry.timestamp}</span>
        <span>Player ${entry.player}</span>
        <span>${entry.eventType}</span>
        <span>${entry.x}% / ${entry.y}%</span>
        <button class="delete-button" data-id="${entry.id}">Delete</button>
      `;
      eventLog.appendChild(row);
    });
  }
  eventCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
}

function recordCurrentEvent() {
  if (!selectedPlayer || !selectedEventType) {
    alert("Select a player and event type before recording.");
    return;
  }

  const newEvent = {
    id: crypto.randomUUID(),
    timestamp: formatTime(matchVideo.currentTime || 0),
    player: selectedPlayer,
    eventType: selectedEventType,
    x: selectedCoordinates.x,
    y: selectedCoordinates.y,
  };

  events.unshift(newEvent);
  saveEvents();
  renderEvents();
}

function removeEvent(id) {
  events = events.filter((entry) => entry.id !== id);
  saveEvents();
  renderEvents();
}

function exportToCsv() {
  if (events.length === 0) {
    alert("No events to export.");
    return;
  }

  const rows = [
    ["Timestamp", "Player", "Event Type", "X Coordinate", "Y Coordinate"],
    ...events.map((entry) => [
      entry.timestamp,
      entry.player,
      entry.eventType,
      entry.x,
      entry.y,
    ]),
  ];

  const csvContent = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "touchline-events.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function clearAllEvents() {
  if (!events.length) {
    return;
  }
  const confirmed = confirm("Clear all recorded events?");
  if (!confirmed) {
    return;
  }
  events = [];
  saveEvents();
  renderEvents();
}

videoUpload.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  const fileUrl = URL.createObjectURL(file);
  matchVideo.src = fileUrl;
  matchVideo.load();
});

matchVideo.addEventListener("timeupdate", updateTimestamp);

pitch.addEventListener("click", handlePitchClick);

homePlayers.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLButtonElement)) {
    return;
  }
  selectedPlayer = event.target.dataset.player;
  setActiveButton(homePlayers, ".player-button", selectedPlayer);
  setActiveButton(awayPlayers, ".player-button", selectedPlayer);
});

awayPlayers.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLButtonElement)) {
    return;
  }
  selectedPlayer = event.target.dataset.player;
  setActiveButton(homePlayers, ".player-button", selectedPlayer);
  setActiveButton(awayPlayers, ".player-button", selectedPlayer);
});

eventTypes.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLButtonElement)) {
    return;
  }
  selectedEventType = event.target.dataset.eventType;
  setActiveButton(eventTypes, ".event-button", selectedEventType);
});

recordEvent.addEventListener("click", recordCurrentEvent);

eventLog.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLButtonElement)) {
    return;
  }
  const id = event.target.dataset.id;
  if (id) {
    removeEvent(id);
  }
});

exportCsv.addEventListener("click", exportToCsv);
clearEvents.addEventListener("click", clearAllEvents);

buildButtons();
updatePitchMarker();
updateTimestamp();
loadEvents();
