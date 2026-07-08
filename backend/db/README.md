# BidForGood Database Setup

The backend is PostgreSQL-backed. Apply the schema before starting the backend:

```bash
psql "postgresql://USER:PASSWORD@HOST:5432/bidforgood" -f backend/db/init/schema.sql
```

Or, with the backend's `.env` already configured:

```bash
cd backend && npm run migrate
```

Then set the backend environment:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bidforgood
DB_USER=app_user
DB_PASSWORD=your_app_user_password_here
DB_ADMIN_USER=postgres
DB_ADMIN_PASSWORD=your_postgres_password_here
JWT_SECRET=replace_with_at_least_32_random_characters
LOGIN_ATTEMPT_CACHE=memory
```

For a multi-server deployment, use the central Redis-compatible in-memory
cache for failed-login tracking:

```bash
LOGIN_ATTEMPT_CACHE=redis
REDIS_URL=redis://127.0.0.1:6379/0
```

## Database roles

Two roles, so that a SQL injection or backend compromise can't drop tables, read
password hashes out of `pg_authid`, create roles, or read host files via
`COPY FROM PROGRAM`:

| Role | Privileges | Used by |
|---|---|---|
| `postgres` | superuser | `npm run migrate`, the seed scripts, DB admin, container init |
| `app_user` | `CONNECT`, `USAGE` on `public`, `SELECT/INSERT/UPDATE/DELETE` on tables, `USAGE/SELECT` on sequences — no DDL, no `TRUNCATE`, no superuser | the running backend (`src/utils/db.ts`) |

The backend reads `DB_USER`/`DB_PASSWORD` (→ `app_user`). `migrate.js` and the
`seed*.js` scripts prefer `DB_ADMIN_USER`/`DB_ADMIN_PASSWORD`, falling back to
`DB_USER`/`DB_PASSWORD` if unset.

`init/zz-app-user.sh` creates the role from `APP_DB_USER`/`APP_DB_PASSWORD` (set in
`backend/db/.env`), but Postgres only runs `docker-entrypoint-initdb.d` scripts on a
**fresh, empty** `db-data` volume. Either recreate the volume:

```bash
cd backend/db && docker compose down -v && docker compose up -d
```

...or, for an existing database, run the equivalent SQL once as `postgres`
(`docker ps` first — the container's host port has flip-flopped between 5432 and 5433):

```bash
docker exec -it db-db-1 psql -U postgres -d bidforgood
```

```sql
CREATE ROLE app_user LOGIN PASSWORD 'your_app_user_password_here';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE bidforgood TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO app_user;
```

Then update `backend/.env` per the block above and restart the backend. In production
(`/home/student2/app`) do the same over SSH against the production DB, then
`pm2 restart bidforgood`. Use a strong generated password; never commit it.

To roll back, point `DB_USER`/`DB_PASSWORD` back at `postgres` and restart — no schema
changes are involved. The role can be dropped with
`DROP OWNED BY app_user; DROP ROLE app_user;`.

### Running tests

`resetRepositoryForTests` issues `TRUNCATE ... RESTART IDENTITY CASCADE` between tests,
which `app_user` is deliberately not granted. Run the backend test suite with admin
credentials (e.g. `DB_USER=postgres DB_PASSWORD=... npm test`). CI already does this —
its disposable Postgres container's superuser *is* `testuser`.
