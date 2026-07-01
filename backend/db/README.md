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
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=replace_with_at_least_32_random_characters
```
