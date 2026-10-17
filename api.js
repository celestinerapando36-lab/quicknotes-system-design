"use strict";



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

let notes = [];       
let isBusy = false;   
let nextKey = 1;      


function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status status-${type}` : "";
}

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
    return "We could not reach the server. Please check your internet connection and try again.";
  }
  return `The server had a problem (${error.message}). Please try again in a moment.`;
}

function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No notes to show yet. Click \"Load notes\" or add a new note.";
    notesList.append(empty);
    return;
  }

  for (const note of notes) {
    const li = document.createElement("li");

    const title = document.createElement("h3");
    title.textContent = note.title;          

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


async function request(url, options = {}) {
  const config = { ...options };
  if (config.body !== undefined) {
    config.headers = { "Content-Type": "application/json; charset=UTF-8", ...config.headers };
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`.trim());
  }
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}


async function loadNotes() {
  setBusy(true);
  setStatus("Loading notes...", "loading");
  try {
    const { data } = await request(`${API_URL}?_limit=${NOTES_LIMIT}`);
    notes = data.map((note) => ({ ...note, _key: nextKey++ }));
    renderNotes();
    if (notes.length === 0) {
      setStatus("No notes found on the server.", "empty");
    } else {
      const word = notes.length === 1 ? "note" : "notes";
      setStatus(`Loaded ${notes.length} ${word} from the server.`, "success");
    }
  } catch (error) {
    setStatus(`Sorry, we couldn't load your notes. ${describeError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}


function validateTitle(title) {
  if (title.length === 0) {
    return "A title is required.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title is too long (${title.length}/${MAX_TITLE_LENGTH} characters).`;
  }
  return "";
}


async function createNote(title, body) {
  setBusy(true);
  setStatus("Saving note...", "loading");
  try {
    const { status, data } = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title, body, userId: 1 }),
    });
    notes.unshift({ ...data, _key: nextKey++ });   
    renderNotes();
    form.reset();                                  
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    setStatus(`Sorry, we couldn't create the note. ${describeError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}


async function deleteNote(key) {
  const note = notes.find((n) => n._key === key);
  if (!note) return;

  setBusy(true);
  setStatus("Deleting note...", "loading");
  try {
    const { status } = await request(`${API_URL}/${note.id}`, { method: "DELETE" });
    notes = notes.filter((n) => n._key !== key);
    renderNotes();
    if (notes.length === 0) {
      setStatus(`Note deleted (status ${status}). There are no notes left.`, "empty");
    } else {
      setStatus(`Note deleted (status ${status}).`, "success");
    }
  } catch (error) {
    setStatus(`Sorry, we couldn't delete the note. ${describeError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}


loadBtn.addEventListener("click", loadNotes);
setStatus("Click \"Load notes\" to fetch your notes.", "");

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

notesList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-btn");
  if (button && !isBusy) {
    deleteNote(Number(button.dataset.key));
  }
});