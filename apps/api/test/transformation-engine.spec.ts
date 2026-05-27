import { TransformationEngineService } from '../src/transformations/transformation-engine.service';
import { getByPath, setByPath } from '../src/transformations/path-utils';

describe('TransformationEngineService', () => {
  const service = new TransformationEngineService();

  it('nested path read works', () => {
    const value = getByPath({ a: { b: { c: 123 } } }, 'a.b.c');
    expect(value).toBe(123);
  });

  it('nested path write works', () => {
    const output: Record<string, unknown> = {};
    setByPath(output, 'a.b.c', 'ok');
    expect(output).toEqual({ a: { b: { c: 'ok' } } });
  });

  it('dangerous path is rejected', () => {
    expect(() => getByPath({ a: 1 }, '__proto__.x')).toThrow('unsafe segment');
    expect(() => setByPath({}, 'a.prototype.b', 1)).toThrow('unsafe segment');
  });

  it('string coercion works with trim/lowercase', () => {
    const result = service.transformRecord(
      { profile: { email: '  USER@EXAMPLE.COM  ' } },
      {
        fields: {
          email: {
            path: 'profile.email',
            type: 'string',
            trim: true,
            lowercase: true,
          },
        },
      },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toEqual({ email: 'user@example.com' });
  });

  it('number coercion works', () => {
    const result = service.transformRecord(
      { invoice: { total: '42.5' } },
      {
        fields: {
          amount: {
            path: 'invoice.total',
            type: 'number',
          },
        },
      },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toEqual({ amount: 42.5 });
  });

  it('boolean coercion works', () => {
    const result = service.transformRecord(
      { active: 'yes' },
      {
        fields: {
          isActive: {
            path: 'active',
            type: 'boolean',
          },
        },
      },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toEqual({ isActive: true });
  });

  it('date coercion works', () => {
    const result = service.transformRecord(
      { ts: '2026-01-10T15:30:00Z' },
      {
        fields: {
          createdAt: {
            path: 'ts',
            type: 'date',
          },
        },
      },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toEqual({ createdAt: '2026-01-10T15:30:00.000Z' });
  });

  it('default value works', () => {
    const result = service.transformRecord(
      {},
      {
        fields: {
          fullName: {
            path: 'contact.name',
            default: 'Unknown',
            type: 'string',
          },
        },
      },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toEqual({ fullName: 'Unknown' });
  });

  it('required missing field creates error', () => {
    const result = service.transformRecord(
      {},
      {
        fields: {
          email: {
            path: 'contact.email',
            required: true,
            type: 'string',
          },
        },
      },
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
  });

  it('unsupported type is rejected during mapping validation', () => {
    const result = service.validateMapping({
      fields: {
        amount: {
          path: 'invoice.total',
          type: 'currency',
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Unsupported field type');
  });

  it('simple computed field works', () => {
    const result = service.transformRecord(
      {},
      {
        fields: {
          generatedId: {
            path: 'ignored.path',
            type: 'string',
            compute: 'uuid',
          },
        },
      },
    );

    expect(result.errors).toHaveLength(0);
    expect(typeof result.normalized.generatedId).toBe('string');
    expect((result.normalized.generatedId as string).length).toBeGreaterThan(0);
  });
});
