# BidForGood Database Setup

The backend supports two repository modes:

- `DATA_STORE=memory` for local development and fast CI tests.
- `DATA_STORE=postgres` for a real PostgreSQL-backed deployment.

Apply the schema before switching an environment to PostgreSQL:

```bash
psql "postgresql://USER:PASSWORD@HOST:5432/bidforgood" -f backend/db/schema.sql
```

Then set the backend environment:

```bash
DATA_STORE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bidforgood
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=replace_with_at_least_32_random_characters
```

Keep `DATA_STORE=memory` for automated tests unless a test intentionally starts a real PostgreSQL instance.
