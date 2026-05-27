# Mapping Engine Guide (Phase 3)

## Supported Mapping Format
Primary mapping format:

```json
{
  "fields": {
    "email": {
      "path": "contact.email",
      "required": true,
      "type": "string",
      "trim": true,
      "lowercase": true
    },
    "fullName": {
      "path": "contact.name",
      "default": "Unknown",
      "type": "string",
      "trim": true
    },
    "amount": {
      "path": "invoice.total",
      "type": "number"
    },
    "isActive": {
      "path": "active",
      "type": "boolean",
      "default": true
    }
  }
}
```

## Field Options
- `path`: source path in raw record
- `required`: mark missing/empty as error
- `default`: fallback when value missing
- `type`: `string | number | boolean | date | json`
- `trim`: string-only
- `lowercase`: string-only
- `uppercase`: string-only
- `compute`: `now | uuid` (simple computed value generation)

## Type Coercion Rules
- `string`: `String(value)` + optional trim/case transforms
- `number`: finite numeric coercion from number/string
- `boolean`: accepts `true/false`, `1/0`, `yes/no`
- `date`: converted to ISO string
- `json`: passthrough (structured clone)

If coercion fails, transformation error is returned for that field.

## Required Handling
If a required field is missing after default resolution:
- field error code: `REQUIRED_FIELD_MISSING`
- record is treated as invalid for sync run persistence

## Nested Path Safety
`getByPath` / `setByPath` reject dangerous segments:
- `__proto__`
- `prototype`
- `constructor`

Unsafe paths are rejected at mapping validation time.

## Preview Endpoint
`POST /api/pipelines/:id/preview`

- Input: sample records with `raw` payloads
- Output: per-record `normalized` + `errors` + summary
- No DB writes for runs/records

## Run Integration
`POST /api/pipelines/:id/runs`

- Applies the same transformation engine used by preview
- Stores only valid transformed records
- Updates run counters and failure status
- In `QUEUE_MODE=async`, the same mapping logic executes in worker context.

## Current Limitations
- No expression language / advanced computed formulas yet
- Preview uses stored pipeline mapping (not unsaved frontend edits)
