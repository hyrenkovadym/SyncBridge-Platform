# Mapping and Transformation Guide (v1.0.0)

## Mapping JSON Format

```json
{
  "fields": {
    "email": {
      "path": "contact.email",
      "required": true,
      "type": "string",
      "trim": true,
      "lowercase": true
    }
  }
}
```

## Supported Field Options

- `path`: nested source path in raw payload
- `required`: validates value presence
- `default`: fallback value
- `type`: `string | number | boolean | date | json`
- `trim`, `lowercase`, `uppercase` for string normalization
- `compute`: `now | uuid` for simple deterministic computed fields

## Safety Rules

- Dangerous path segments are rejected (`__proto__`, `prototype`, `constructor`).
- Unsupported field types or malformed mapping shape are rejected.

## Related Endpoints

- `POST /api/pipelines/validate-mapping`
- `POST /api/pipelines/:id/preview`
- `POST /api/pipelines/:id/runs`

## Incremental Compatibility

- Incremental mode uses `cursorJson` checkpoints on pipeline.
- Manual run payload can set `ignoreCursor: true`.