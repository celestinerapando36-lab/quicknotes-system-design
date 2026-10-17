# QuickNotes System Design

QuickNotes is a small note-taking app, designed and built as a capstone project. It has two parts:

1. **A working API client** (HTML, CSS and vanilla JavaScript) that loads, creates and deletes notes using `fetch` and shows loading, success, error and empty states.
2. **Three design documents** that describe how QuickNotes would work as a real system for 1 million users: the REST API, the database, and the overall architecture.

The client uses the free fake API [JSONPlaceholder](https://jsonplaceholder.typicode.com/posts) as a stand-in backend (its "posts" are used as "notes"). It accepts POST and DELETE requests and returns realistic responses, but it **does not save changes**, so a created note disappears when you reload the page.

## How to run the API client

You need a modern browser and an internet connection. No installation or build step is required.

**Option 1: open the file**

1. Download or clone this repository.
2. Open `index.html` in your browser (double-click it).

**Option 2: use a local server**

```bash
git clone https://github.com/<your-username>/quicknotes-system-design.git
cd quicknotes-system-design
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

**Using the app**

- Click **Load notes** to fetch 10 notes (GET).
- Fill in the form and click **Add note** to create a note (POST). A title is required and can be at most 100 characters.
- Click **Delete** on a note to remove it (DELETE).
- The status line shows what is happening: loading (blue), success (green), error (red) or empty (yellow). Buttons are disabled while a request is running.

## Documentation

- [API design](docs/api-design.md): REST endpoints, JSON examples and error codes
- [Data model](docs/data-model.md): tables, keys, relationships, SQL, index and SQL vs NoSQL
- [Architecture](docs/architecture.md): requirements, load estimate, diagram, request flows, trade-offs

## Project structure

```text
quicknotes-system-design/
├── index.html          # page structure
├── style.css           # styling, including status message colours
├── api.js              # request(), GET / POST / DELETE, validation, UI states
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I learned

- **One reusable `request()` function keeps error handling in one place.** Checking `response.ok` matters because `fetch` only rejects on network failures, not on HTTP errors like 404 or 500. Wrapping every call in `try / catch / finally` meant buttons were always re-enabled.
- **Good UI shows every state.** Loading, success, error and empty states each need their own message and style, and disabling buttons during a request prevents duplicate submissions. Validating on the client (a required title of at most 100 characters) gives instant feedback, but the server must validate again.
- **A REST API is designed around resources and status codes.** Using nouns (`/notes`), the right method (`GET`, `POST`, `DELETE`) and the right status (`201` for create, `204` for delete, `400` / `401` / `403` / `404` for client errors) makes an API predictable.
- **A many-to-many relationship needs a join table.** Notes and tags are connected through `note_tags`, and an index such as `(user_id, created_at DESC)` keeps the most common query fast as the data grows.
- **Estimating load drives the architecture.** The numbers (about 46 reads and 4.6 writes per second, 146 GB per year) showed the system is read-heavy, which justified a cache and a read replica, and thinking about single points of failure showed why every component needs a second copy.
- **Every design choice is a trade-off.** Caching and replicas buy speed at the cost of slightly stale data, and queues buy responsiveness at the cost of eventual consistency.
