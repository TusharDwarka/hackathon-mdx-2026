# API contract (P1 only edits — FROZEN for everyone else)

Every endpoint the demo needs: minimum only. One mock JSON per endpoint in `contracts/mocks/`; the front end uses the mocks until the API is ready.

## Template
### POST /api/example
- Request: `{ "field": "string" }`
- Response: `{ "id": "string", "result": "string" }`
- Mock: `contracts/mocks/example.json`
- Owner: P3 | P4 (AI)
- Errors: `{ "error": "string" }` with HTTP 4xx/5xx
