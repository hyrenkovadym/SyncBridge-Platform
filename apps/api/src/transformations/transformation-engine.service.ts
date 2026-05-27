import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createTransformationError,
  MappingValidationError,
  TransformationErrorDetail,
} from './transformation-errors';
import { assertSafePath, getByPath, setByPath } from './path-utils';

export type TransformationValueType = 'string' | 'number' | 'boolean' | 'date' | 'json';

export interface MappingFieldDefinition {
  path: string;
  required?: boolean;
  default?: unknown;
  type?: TransformationValueType;
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  compute?: 'now' | 'uuid';
}

export interface NormalizedMappingField {
  outputPath: string;
  sourcePath: string;
  required: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  type: TransformationValueType;
  trim: boolean;
  lowercase: boolean;
  uppercase: boolean;
  compute?: 'now' | 'uuid';
}

export interface MappingValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TransformationResult {
  normalized: Record<string, unknown>;
  errors: TransformationErrorDetail[];
}

const SUPPORTED_TYPES = new Set<TransformationValueType>(['string', 'number', 'boolean', 'date', 'json']);

type MappingInput = {
  fields?: Record<string, unknown>;
};

@Injectable()
export class TransformationEngineService {
  validateMapping(mappingJson: Record<string, unknown>): MappingValidationResult {
    try {
      this.compileMapping(mappingJson);
      return {
        valid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof MappingValidationError) {
        return {
          valid: false,
          errors: error.errors.map((issue) => issue.message),
        };
      }
      return {
        valid: false,
        errors: ['Invalid mappingJson'],
      };
    }
  }

  compileMapping(mappingJson: Record<string, unknown>): NormalizedMappingField[] {
    const errors: TransformationErrorDetail[] = [];
    const normalizedFields: NormalizedMappingField[] = [];

    const mappingCandidates = this.extractMappingCandidates(mappingJson, errors);

    for (const [outputPath, value] of mappingCandidates) {
      if (typeof value === 'string') {
        try {
          assertSafePath(outputPath);
          assertSafePath(value);
        } catch (error) {
          errors.push(
            createTransformationError(
              outputPath,
              'PATH_UNSAFE',
              error instanceof Error ? error.message : 'Unsafe path detected',
              value,
            ),
          );
          continue;
        }

        normalizedFields.push({
          outputPath,
          sourcePath: value,
          required: false,
          hasDefault: false,
          type: 'json',
          trim: false,
          lowercase: false,
          uppercase: false,
        });
        continue;
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(
          createTransformationError(
            outputPath,
            'MAPPING_INVALID',
            `Field mapping for ${outputPath} must be an object`,
          ),
        );
        continue;
      }

      const definition = value as MappingFieldDefinition;

      const sourcePath = typeof definition.path === 'string' ? definition.path.trim() : '';

      if (sourcePath.length === 0 && definition.compute === undefined) {
        errors.push(
          createTransformationError(
            outputPath,
            'MAPPING_INVALID',
            `Field mapping for ${outputPath} must include a non-empty path or compute mode`,
          ),
        );
        continue;
      }

      try {
        assertSafePath(outputPath);
        if (sourcePath.length > 0) {
          assertSafePath(sourcePath);
        }
      } catch (error) {
        errors.push(
          createTransformationError(
            outputPath,
            'PATH_UNSAFE',
            error instanceof Error ? error.message : 'Unsafe path detected',
            sourcePath,
          ),
        );
        continue;
      }

      const type = (definition.type ?? 'json') as TransformationValueType;
      if (!SUPPORTED_TYPES.has(type)) {
        errors.push(
          createTransformationError(
            outputPath,
            'UNSUPPORTED_TYPE',
            `Unsupported field type for ${outputPath}: ${definition.type}`,
            sourcePath,
          ),
        );
        continue;
      }

      if (
        definition.compute !== undefined &&
        definition.compute !== 'now' &&
        definition.compute !== 'uuid'
      ) {
        errors.push(
          createTransformationError(
            outputPath,
            'MAPPING_INVALID',
            `Unsupported compute mode for ${outputPath}: ${String(definition.compute)}`,
            sourcePath,
          ),
        );
        continue;
      }

      if (definition.lowercase && definition.uppercase) {
        errors.push(
          createTransformationError(
            outputPath,
            'MAPPING_INVALID',
            `Field ${outputPath} cannot set both lowercase and uppercase`,
            sourcePath,
          ),
        );
        continue;
      }

      normalizedFields.push({
        outputPath,
        sourcePath,
        required: definition.required === true,
        hasDefault: Object.prototype.hasOwnProperty.call(definition, 'default'),
        defaultValue: definition.default,
        type,
        trim: definition.trim === true,
        lowercase: definition.lowercase === true,
        uppercase: definition.uppercase === true,
        compute: definition.compute,
      });
    }

    if (errors.length > 0) {
      throw new MappingValidationError(errors);
    }

    return normalizedFields;
  }

  transformRecord(rawRecord: Record<string, unknown>, mappingJson: Record<string, unknown>): TransformationResult {
    const fields = this.compileMapping(mappingJson);
    return this.transformRecordWithCompiledMapping(rawRecord, fields);
  }

  transformRecordWithCompiledMapping(
    rawRecord: Record<string, unknown>,
    fields: NormalizedMappingField[],
  ): TransformationResult {
    const normalized: Record<string, unknown> = {};
    const errors: TransformationErrorDetail[] = [];

    for (const field of fields) {
      let currentValue =
        field.compute !== undefined
          ? this.computeValue(field.compute)
          : getByPath(rawRecord, field.sourcePath);

      if (this.isMissingValue(currentValue) && field.hasDefault) {
        currentValue = structuredClone(field.defaultValue);
      }

      if (field.required && this.isMissingValue(currentValue)) {
        errors.push(
          createTransformationError(
            field.outputPath,
            'REQUIRED_FIELD_MISSING',
            `Required field ${field.outputPath} is missing`,
            field.sourcePath,
          ),
        );
        continue;
      }

      if (this.isMissingValue(currentValue)) {
        continue;
      }

      const coerced = this.coerceValue(currentValue, field);
      if (!coerced.ok) {
        errors.push(
          createTransformationError(
            field.outputPath,
            'TYPE_COERCION_FAILED',
            coerced.message,
            field.sourcePath,
          ),
        );
        continue;
      }

      setByPath(normalized, field.outputPath, coerced.value);
    }

    return {
      normalized,
      errors,
    };
  }

  private extractMappingCandidates(
    mappingJson: Record<string, unknown>,
    errors: TransformationErrorDetail[],
  ): Array<[string, unknown]> {
    const withFields = mappingJson as MappingInput;

    if (withFields.fields !== undefined) {
      if (!withFields.fields || typeof withFields.fields !== 'object' || Array.isArray(withFields.fields)) {
        errors.push(
          createTransformationError('fields', 'MAPPING_INVALID', 'mappingJson.fields must be an object'),
        );
        return [];
      }

      return Object.entries(withFields.fields);
    }

    return Object.entries(mappingJson);
  }

  private isMissingValue(value: unknown) {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return true;
    }

    return false;
  }

  private coerceValue(value: unknown, field: NormalizedMappingField):
    | { ok: true; value: unknown }
    | { ok: false; message: string } {
    switch (field.type) {
      case 'json':
        return {
          ok: true,
          value: structuredClone(value),
        };

      case 'string': {
        let transformed = String(value);
        if (field.trim) {
          transformed = transformed.trim();
        }
        if (field.lowercase) {
          transformed = transformed.toLowerCase();
        }
        if (field.uppercase) {
          transformed = transformed.toUpperCase();
        }
        return { ok: true, value: transformed };
      }

      case 'number': {
        const candidate =
          typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number(value.trim())
              : Number.NaN;

        if (!Number.isFinite(candidate)) {
          return {
            ok: false,
            message: `Cannot coerce field ${field.outputPath} to number`,
          };
        }

        return {
          ok: true,
          value: candidate,
        };
      }

      case 'boolean': {
        if (typeof value === 'boolean') {
          return {
            ok: true,
            value,
          };
        }

        if (typeof value === 'number') {
          if (value === 1) {
            return { ok: true, value: true };
          }
          if (value === 0) {
            return { ok: true, value: false };
          }
        }

        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', '1', 'yes'].includes(normalized)) {
            return { ok: true, value: true };
          }
          if (['false', '0', 'no'].includes(normalized)) {
            return { ok: true, value: false };
          }
        }

        return {
          ok: false,
          message: `Cannot coerce field ${field.outputPath} to boolean`,
        };
      }

      case 'date': {
        const dateValue = value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(dateValue.getTime())) {
          return {
            ok: false,
            message: `Cannot coerce field ${field.outputPath} to date`,
          };
        }

        return {
          ok: true,
          value: dateValue.toISOString(),
        };
      }

      default:
        return {
          ok: false,
          message: `Unsupported type for field ${field.outputPath}`,
        };
    }
  }

  private computeValue(mode: 'now' | 'uuid') {
    if (mode === 'now') {
      return new Date().toISOString();
    }

    return randomUUID();
  }
}
