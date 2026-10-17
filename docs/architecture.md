# QuickNotes System Architecture

QuickNotes is a note-taking app: users create, view, tag and delete short text notes. This document describes how the system would be built to serve **1 million registered users**.

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can create, read, update and delete their own notes (title up to 100 characters, plus a body).
- Users can list their notes, newest first, with pagination.
- Users can add tags to notes and filter notes by tag.
- Users can only see and change their own notes.
- Background tasks run after a note is saved (for example updating a search index).

### Non-functional requirements

| Requirement | Target |
|-------------|--------|
| Availability | 99.9% uptime; no single point of failure |
| Latency | `GET /notes` under 200 ms at the 95th percentile |
| Scalability | Handle 5x the average load at peak and grow by adding servers |
| Durability | Notes are never lost: replicated database and daily backups |
| Consistency | A user sees their own new note immediately; other views may lag by a few seconds |
| Security | HTTPS everywhere, hashed passwords, token authentication, rate limiting |

## 2. Load estimate for 1 million users

### Assumptions

- Registered users: 1,000,000
- Daily active users (DAU): 20% = **200,000**
- Each active user opens or refreshes the notes list **20 times per day** (reads)
- Each active user **creates 2 notes per day** (writes)
- Average stored note: **1 KB** (title, body, ids, timestamps, tag links)
- Peak traffic = **5x** the average; one day = 86,400 seconds

### Calculations

| Metric | Calculation | Average | Peak (5x) |
|--------|-------------|---------|-----------|
| Reads per second | 200,000 x 20 = 4,000,000 reads/day, / 86,400 | **about 46 /s** | **about 231 /s** |
| Writes per second | 200,000 x 2 = 400,000 writes/day, / 86,400 | **about 4.6 /s** | **about 23 /s** |
| Storage per year | 400,000 notes/day x 365 = 146,000,000 notes, x 1 KB | **about 146 GB/year** | - |

Reads outnumber writes about **10 to 1**, so QuickNotes is **read-heavy**. The numbers are small for modern hardware (a few hundred requests per second), so the extra components are mainly for **availability and growth**, not because one server could not cope today. Storage of about 146 GB per year (a few hundred GB with indexes) fits on one database primary for many years.

## 3. Architecture diagram

```text
   +----------------------------+
   |  Client (browser / mobile) |
   +-------------+--------------+
                 |
                 v
   +----------------------------+
   |            DNS             |   quicknotes.example -> CDN / load balancer
   +------+--------------+------+
          |              |
  static  |              |  API calls (/v1/...)
  files   v              v
   +-------------+   +----------------------------+
   |     CDN     |   |       Load Balancer        |  (2 instances, high availability)
   | HTML/CSS/JS |   +--------------+-------------+
   +-------------+                  |
                  +-----------------+-----------------+
                  |                 |                 |
                  v                 v                 v
          +--------------+  +--------------+  +--------------+
          | App Server 1 |  | App Server 2 |  | App Server N |   (stateless)
          +------+-------+  +------+-------+  +------+-------+
                 |                 |                 |
                 +-----------------+-----------------+
                 |                 |                 |
                 | (1) read first  | (3) writes      | (4) enqueue job
                 v                 v                 v
        +----------------+  +----------------+  +----------------+
        | Cache (Redis)  |  |  Primary DB    |  |     Queue      |
        | primary+replica|  |  (PostgreSQL)  |  +--------+-------+
        +--------+-------+  +--------+-------+           |
                 |                   |                   v
   (2) on a miss |                   | replication  +----------------+
                 v                   v              |   Worker(s)    |
        +------------------------------------+      | search index,  |
        |  Read Replica (serves SQL reads)   |      | cleanup        |
        +------------------------------------+      +--------+-------+
                                                             |
                                 worker writes results back  |
                                 to the Primary DB  <--------+
```

Standby copies (a standby for the primary database that can be promoted, a replica for the cache, and a second load balancer) are described in section 7.

## 4. Components: one sentence each

- **Client:** It solves the need for a user interface by letting people create, view and delete notes in a browser or mobile app, talking to the API with JSON over HTTPS.
- **DNS:** It solves the problem of users needing a stable name by turning `quicknotes.example` into the address of the CDN or load balancer, and can redirect traffic away from a failed location.
- **CDN:** It solves slow loading of static files (HTML, CSS, JS, images) by serving them from locations close to the user, which takes this traffic away from our servers.
- **Load balancer:** It solves the problem of one server being overloaded or failing by spreading API requests across several app servers and skipping unhealthy ones.
- **App servers:** They solve the need to run the business logic (authentication, validation, building responses), and because they are stateless we scale by simply adding more.
- **Cache (Redis):** It solves the problem of the database answering the same "list my notes" question over and over by keeping recent results in fast memory.
- **Primary database (PostgreSQL):** It solves the need for safe, consistent, durable storage by being the single place where all writes happen, with transactions and constraints.
- **Read replica:** It solves the problem of read traffic competing with writes by holding a continuously updated copy of the database that serves list and search queries.
- **Queue:** It solves the problem of slow follow-up work delaying the user's response by holding jobs safely until a worker is free, and it smooths out traffic spikes.
- **Worker:** It solves the need to do background tasks (search indexing, cleanup, future email notifications) outside the request, and it scales independently of the app servers.

## 5. Request flows

### `GET /notes` (read path)

1. The client resolves `api.quicknotes.example` through **DNS** and sends `GET /v1/notes?page=1` over HTTPS with its token.
2. The **load balancer** picks a healthy **app server**.
3. The app server checks the token (401 if it is missing or invalid) and finds the user id.
4. It looks for the key `notes:user:{id}:page:1` in the **cache**.
5. **Cache hit:** it returns the cached JSON immediately with `200 OK`.
6. **Cache miss:** it runs the "newest 10 notes" query on the **read replica**.
7. It stores the result in the cache with a short expiry (for example 60 seconds).
8. It returns `200 OK` with the notes (or an empty `data` list).

### `POST /notes` (write path)

1. The client sends `POST /v1/notes` with the JSON body and its token; DNS and the **load balancer** route it to an **app server**.
2. The app server authenticates the user and validates the body (title required, at most 100 characters); invalid input gets `400 Bad Request`.
3. It starts a transaction on the **primary database**, inserts the note (and any tag links), and commits.
4. It deletes the user's cached note-list keys so the next read is fresh (cache invalidation).
5. It puts a `note.created` job on the **queue**; this takes milliseconds and does not wait for the work to finish.
6. It returns `201 Created` with the new note and a `Location` header.
7. A **worker** later takes the job from the queue, updates the search index, and marks the job done. If the worker fails, the job is retried.

## 6. Trade-offs

1. **Cache: speed versus freshness.** The cache makes reads fast and protects the database, but cached data can be slightly out of date (for example a note edited on another device). We reduce this by invalidating the user's cache keys on every write and by using a short expiry; the cost is extra code and the occasional cache miss.
2. **Read replica: scalability versus replication lag.** The replica lets us scale reads, but it receives data a moment after the primary, so a user might not see a note they just created. We handle this by invalidating the cache on write and, for a user's own request right after a write, reading from the primary.
3. **Queue and worker: responsiveness versus complexity and eventual consistency.** The user gets a quick response because slow work happens in the background, but background results (like the search index) appear a little later, and we must run and monitor extra components. Because a queue may deliver a job twice, workers must be idempotent (safe to run twice).
4. **SQL primary: simplicity and consistency versus write scaling.** A single primary gives strong consistency and simple queries, but all writes go to one machine. At 23 writes per second at peak this is no problem; if writes grew far beyond one machine we would have to shard by `user_id`, which adds complexity.
5. **CDN for static files only.** Notes are private, so API responses are not cached on the CDN; we give up CDN speed for API data in exchange for privacy and correctness.

## 7. Avoiding single points of failure

| Component | How a single point of failure is avoided |
|-----------|-------------------------------------------|
| DNS | Use a managed DNS provider that is already distributed worldwide, with health checks. |
| CDN | Distributed by design; if one location fails, traffic goes to another. |
| Load balancer | Run two or more instances (active-active or active-passive with a floating IP) in different availability zones. |
| App servers | At least two stateless servers in different zones; the load balancer removes a failed one automatically, and no user data lives on the server itself. |
| Cache | Redis with a replica and automatic failover; if the whole cache is lost, the system still works (just slower) because the database is the source of truth. |
| Primary database | Streaming replication to a standby/replica in another zone, with automatic promotion if the primary fails; plus daily backups and point-in-time recovery. |
| Read replica | Two or more replicas; if one fails, reads go to another or to the primary. |
| Queue | A replicated, managed queue; jobs are stored durably and retried until a worker acknowledges them. |
| Worker | Two or more workers; if one dies mid-job, the job becomes visible again and another worker takes it. |

The most difficult component to protect is the primary database, because it is the only one that accepts writes. During a failover, writes may fail for a short time (tens of seconds), which the client handles by showing an error and letting the user retry.
