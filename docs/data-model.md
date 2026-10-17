# QuickNotes Data Model

## 1. Entities

### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGINT | **Primary key**, generated automatically |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE |
| `password_hash` | VARCHAR(255) | NOT NULL (never store the plain password) |
| `display_name` | VARCHAR(100) | NOT NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now |

### `notes`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGINT | **Primary key**, generated automatically |
| `user_id` | BIGINT | NOT NULL, **foreign key** -> `users(id)` |
| `title` | VARCHAR(100) | NOT NULL |
| `body` | TEXT | optional |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now |

### `tags`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | BIGINT | **Primary key**, generated automatically |
| `user_id` | BIGINT | NOT NULL, **foreign key** -> `users(id)` |
| `name` | VARCHAR(50) | NOT NULL, unique per user |

### `note_tags` (join table)

| Column | Type | Constraints |
|--------|------|-------------|
| `note_id` | BIGINT | **Foreign key** -> `notes(id)` |
| `tag_id` | BIGINT | **Foreign key** -> `tags(id)` |
| | | **Primary key** is the pair (`note_id`, `tag_id`) |

## 2. Relationships

```text
users 1 ----< notes >----< note_tags >----< tags >---- 1 users
  |                                                      |
  +-------------------------- 1 ----< -------------------+
```

- **One-to-many: `users` -> `notes`.** One user owns many notes, and each note belongs to exactly one user (`notes.user_id`).
- **One-to-many: `users` -> `tags`.** One user creates many tags, and each tag belongs to one user (`tags.user_id`), so users do not share or clash over tag names.
- **Many-to-many: `notes` <-> `tags`.** A note can have many tags ("work", "urgent") and a tag can be on many notes. A relational database cannot store this directly, so the join table `note_tags` holds one row per (note, tag) pair. Its composite primary key also stops the same tag being attached twice to a note.

## 3. CREATE TABLE statements (PostgreSQL)

```sql
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE notes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(100) NOT NULL,
    body       TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE tags (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    VARCHAR(50) NOT NULL,
    UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
    note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
```

## 4. Index and reason

```sql
-- Speeds up "show my newest notes" (GET /notes)
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);

-- Speeds up "which notes have this tag?" (the primary key only helps lookups starting with note_id)
CREATE INDEX idx_note_tags_tag ON note_tags (tag_id);
```

**Reason:** the most frequent query is "the newest notes of one user". Without an index, the database would scan the whole `notes` table (about 146 million rows after one year at 1 million users). The composite index on `(user_id, created_at DESC)` lets it jump straight to one user's notes already sorted by date, so the query stays fast as the table grows. The second index helps the tag filter, which starts from `tag_id`.

## 5. Example queries

**1. Get the 10 newest notes of user 7 (page 1 of `GET /notes`)**

```sql
SELECT id, title, body, created_at
FROM notes
WHERE user_id = 7
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;
```

**2. Get all notes of user 7 with a given tag (uses JOINs)**

```sql
SELECT n.id, n.title, n.created_at
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 7
  AND t.name = 'study'
ORDER BY n.created_at DESC;
```

**3. Count how many notes each tag has for user 7 (JOIN with aggregation)**

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 7
GROUP BY t.id, t.name
ORDER BY note_count DESC;
```

**4. Create a note and attach a tag in one transaction (POST /notes)**

```sql
BEGIN;
INSERT INTO notes (user_id, title, body) VALUES (7, 'Buy groceries', 'Milk, eggs, bread') RETURNING id;
-- suppose the new note id is 42 and the tag "shopping" has id 3
INSERT INTO note_tags (note_id, tag_id) VALUES (42, 3);
COMMIT;
```

**5. Delete a note (DELETE /notes/42); its `note_tags` rows are removed by `ON DELETE CASCADE`**

```sql
DELETE FROM notes WHERE id = 42 AND user_id = 7;
```

## 6. SQL or NoSQL?

I chose **SQL (PostgreSQL)**. The data is clearly structured and relational: users own notes, and notes and tags have a many-to-many relationship that is queried with JOINs ("all notes with tag X"). SQL enforces these relationships with foreign keys, keeps data consistent with transactions (a note and its tags are saved together or not at all), and supports ad-hoc queries without redesigning the schema. The expected size is also modest: about 146 GB of new notes per year for 1 million users, which one PostgreSQL primary with read replicas handles comfortably. A NoSQL document store (such as MongoDB) would be simpler for storing a note as one JSON document, but it would make tag queries and consistency harder; I would only consider NoSQL if the data grew far beyond what one primary can handle, and even then I would shard the SQL database first.
