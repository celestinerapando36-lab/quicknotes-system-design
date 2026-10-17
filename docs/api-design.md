# QuickNotes API Design

This document describes the REST API that QuickNotes would expose in production. The client in this repository uses JSONPlaceholder as a stand-in (its `/posts` resource plays the role of `/notes`), but the design below is the real target.

- **Base URL:** `https://api.quicknotes.example/v1`
- **Format:** JSON (`Content-Type: application/json`)
- **Authentication:** `Authorization: Bearer <token>` on every endpoint except register and login
- **Conventions:** plural nouns for resources, HTTP methods for actions, ids are integers, timestamps are ISO 8601 in UTC

## 1. Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/users` | Register a new user | `201 Created` |
| 2 | POST | `/auth/login` | Log in and receive a token | `200 OK` |
| 3 | GET | `/notes` | List the current user's notes (supports `?page=`, `?limit=`, `?tag=`, `?q=`) | `200 OK` |
| 4 | POST | `/notes` | Create a note | `201 Created` |
| 5 | GET | `/notes/{id}` | Get one note | `200 OK` |
| 6 | PUT | `/notes/{id}` | Replace a note (title and body required) | `200 OK` |
| 7 | PATCH | `/notes/{id}` | Partially update a note (any of title, body) | `200 OK` |
| 8 | DELETE | `/notes/{id}` | Delete a note | `204 No Content` |
| 9 | GET | `/tags` | List the current user's tags | `200 OK` |
| 10 | PUT | `/notes/{id}/tags/{tag_id}` | Attach a tag to a note (idempotent) | `204 No Content` |
| 11 | DELETE | `/notes/{id}/tags/{tag_id}` | Remove a tag from a note | `204 No Content` |

Notes:
- `PUT` replaces the whole note and `PATCH` changes only the sent fields.
- Every `/notes` and `/tags` endpoint only returns data that belongs to the logged-in user.
- `GET /notes` is paginated so a response never grows without limit (default `limit=10`, maximum `100`).

## 2. Request and response examples

### Create a note: `POST /notes`

Request:

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

```json
{
  "title": "Buy groceries",
  "body": "Milk, eggs, bread",
  "tags": ["shopping"]
}
```

Response: `201 Created` with a `Location: /v1/notes/42` header

```json
{
  "id": 42,
  "title": "Buy groceries",
  "body": "Milk, eggs, bread",
  "tags": ["shopping"],
  "created_at": "2025-01-15T09:30:00Z",
  "updated_at": "2025-01-15T09:30:00Z"
}
```

### List notes: `GET /notes?page=1&limit=2`

Response: `200 OK`

```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy groceries",
      "body": "Milk, eggs, bread",
      "tags": ["shopping"],
      "created_at": "2025-01-15T09:30:00Z",
      "updated_at": "2025-01-15T09:30:00Z"
    },
    {
      "id": 41,
      "title": "Read chapter 5",
      "body": "REST and HTTP status codes",
      "tags": ["study"],
      "created_at": "2025-01-14T18:05:00Z",
      "updated_at": "2025-01-14T18:05:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 27
  }
}
```

An empty list is still a success: `200 OK` with `"data": []` and `"total": 0`.

## 3. Error status codes

| Status | Meaning | When it is returned |
|--------|---------|---------------------|
| `400 Bad Request` | The request is invalid | Malformed JSON, missing or too-long title (more than 100 characters), bad query parameter |
| `401 Unauthorized` | Not authenticated | Missing, expired or invalid token; wrong email or password on login |
| `403 Forbidden` | Authenticated but not allowed | Trying to read, change or delete another user's note |
| `404 Not Found` | The resource does not exist | Unknown note id or tag id, unknown path |
| `409 Conflict` | The request conflicts with current data | Registering an email that already exists, creating a duplicate tag name |
| `429 Too Many Requests` | Rate limit exceeded | Too many requests from one user or IP in a short time |
| `500 Internal Server Error` | Unexpected server failure | Bug or database error; details are logged on the server, never sent to the client |

### Example error body

All errors use the same JSON shape, so the client can handle them in one place.

`400 Bad Request` for `POST /notes` with a missing title:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body is invalid.",
    "details": [
      { "field": "title", "issue": "Title is required and must be at most 100 characters." }
    ]
  }
}
```

`404 Not Found` for `GET /notes/9999`:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Note 9999 was not found."
  }
}
```
