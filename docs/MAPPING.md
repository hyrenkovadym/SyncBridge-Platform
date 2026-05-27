# Mapping and Transformation (Phase 7)

## Format
```json
{
  "fields": {
    "email": { "path": "contact.email", "required": true, "type": "string" }
  }
}
```

## Supported Type Coercion
- `string`
- `number`
- `boolean`
- `date` (ISO output)
- `json`

## Safety
- path utils reject `__proto__`, `prototype`, `constructor`
- unsupported mapping shapes are rejected

## Related Endpoints
- `POST /api/pipelines/validate-mapping`
- `POST /api/pipelines/:id/preview`
- `POST /api/pipelines/:id/runs`

## Incremental Compatibility
- run payload supports `ignoreCursor`
- incremental mode uses pipeline cursor checkpoints
