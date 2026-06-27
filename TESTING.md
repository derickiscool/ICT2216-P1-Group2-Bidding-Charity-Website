# Testing

## Running Tests

```bash
# Backend tests (Jest)
npm test -w backend

# Frontend tests (Vitest)
npm test -w frontend

# All tests
npm test
```

## Writing Tests

### Backend

| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| HTTP assertions | supertest |
| Config file | `backend/jest.config.ts` |
| Test location | `backend/src/__tests__/` (mirrors `src/` structure) |
| File naming | `*.test.ts` |
| Example | `backend/src/__tests__/utils/db.test.ts` |

### Frontend

| Property | Value |
|----------|-------|
| Framework | Vitest |
| DOM environment | happy-dom |
| Component testing | @testing-library/react |
| Config file | `frontend/vitest.config.ts` |
| Test location | `frontend/src/__tests__/` (mirrors `src/` structure) |
| File naming | `*.test.ts` or `*.test.tsx` |
| Example | `frontend/src/__tests__/store/authStore.test.ts` |

## CI

Tests run automatically on every push and pull request via GitHub Actions.
See `.github/workflows/tests.yml` for full pipeline configuration.

## Coverage

Coverage reports are generated when running locally:
```bash
npm test -w backend -- --coverage
npm test -w frontend -- --coverage
```
