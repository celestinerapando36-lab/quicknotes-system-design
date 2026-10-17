"use strict";

// ---------------------------------------------------------------
// QuickNotes API client
// Talks to JSONPlaceholder (a free fake REST API). Its "posts" are
// used as "notes": title -> title, body -> body.
// ---------------------------------------------------------------
const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTES_LIMIT = 10;
const MAX_TITLE_LENGTH = 100;

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const form = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const submitBtn = document.getElementById("submit-btn");
const notesList = document.getElementById("notes-list");

let notes = [];       // notes currently shown on the page
let isBusy = false;   // true while a request is running
let nextKey = 1;      // local unique key (the fake API returns id 101 for every new note)

// ---------- UI helpers ----------

// type: "loading" | "success" | "error" | "empty"
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status status-${type}` : "";
}

// Disable every button while a request is running.
function setBusy(busy) {
  isBusy = busy;
  loadBtn.disabled = busy;
  submitBtn.disabled = busy;
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.disabled = busy;
  });
}

function describeError(error) {
  if (error instanceof TypeError) {
    return "Network error: check your internet connection and try again.";
  }
  return error.message;
}

function renderNotes() {
  notesList.replaceChildren();
  for (const note of notes) {
    const li = document.createElement("li");

    const title = document.createElement("h3");
    title.textContent = note.title;          // textContent: never inserts raw HTML

    const body = document.createElement("p");
    body.textContent = note.body || "(no text)";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-btn";
    del.textContent = "Delete";
    del.dataset.key = note._key;
    del.disabled = isBusy;

    li.append(title, body, del);
    notesList.append(li);
  }
}

// ---------- Reusable request function ----------

async function request(url, options = {}) {
  const config = { ...options };
  if (config.body !== undefined) {
    config.headers = { "Content-Type": "application/json; charset=UTF-8", ...config.headers };
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`.trim());
  }
  if (response.status === 204) {
    return null; // success with no body
  }
  return response.json();
}

// ---------- GET: load 10 notes ----------

async function loadNotes() {
  setBusy(true);
  setStatus("Loading notes...", "loading");
  try {
    const data = await request(`${API_URL}?_limit=${NOTES_LIMIT}`);
    notes = data.map((note) => ({ ...note, _key: nextKey++ }));
    renderNotes();
    if (notes.length === 0) {
      setStatus("No notes found. Add one below!", "empty");
    } else {
      setStatus(`Loaded ${notes.length} notes.`, "success");
    }
  } catch (error) {
    setStatus(`Could not load notes. ${describeError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Validation ----------

// Returns an error message, or "" when the title is valid.
function validateTitle(title) {
  if (title.length === 0) {
    return "A title is required.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title is too long (${title.length}/${MAX_TITLE_LENGTH} characters).`;
  }
  return "";
}

// ---------- POST: create a note ----------

async function createNote(title, body) {
  setBusy(true);
  setStatus("Saving note...", "loading");
  try {
    const created = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title, body, userId: 1 }),
    });
    notes.unshift({ ...created, _key: nextKey++ });
    renderNotes();
    form.reset();
    setStatus(`Note "${title}" was created (server id ${created.id}).`, "success");
  } catch (error) {
    setStatus(`Could not create the note. ${describeError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- DELETE: remove a note ----------

async function deleteNote(key) {
  const note = notes.find((n) => n._key === key);
  if (!note) return;

  setBusy(true);
  setStatus("Deleting note...", "loading");
  try {
    await request(`${API_URL}/${note.id}`, { method: "DELETE" });
    notes = notes.filter((n) => n._key !== key);
    renderNotes();
    if (notes.length === 0) {
      setStatus("Note deleted. There are no notes left.", "empty");
    } else {
      setStatus("Note deleted.", "success");
    }
  } catch (error) {
    setStatus(`Could not delete the note. ${describeError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Events ----------

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isBusy) return;

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const problem = validateTitle(title);

  if (problem) {
    titleInput.setAttribute("aria-invalid", "true");
    setStatus(problem, "error");
    titleInput.focus();
    return;
  }
  titleInput.removeAttribute("aria-invalid");
  createNote(title, body);
});

// One listener for all Delete buttons (event delegation)
notesList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-btn");
  if (button && !isBusy) {
    deleteNote(Number(button.dataset.key));
  }
});

loadBtn.addEventListener("click", loadNotes);
setStatus("Click \"Load notes\" to fetch your notes.", "");
