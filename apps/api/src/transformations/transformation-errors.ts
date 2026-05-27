export type TransformationErrorCode =
  | 'MAPPING_INVALID'
  | 'REQUIRED_FIELD_MISSING'
  | 'TYPE_COERCION_FAILED'
  | 'UNSUPPORTED_TYPE'
  | 'PATH_UNSAFE';

export interface TransformationErrorDetail {
  field: string;
  code: TransformationErrorCode;
  message: string;
  path?: string;
}

export class MappingValidationError extends Error {
  constructor(public readonly errors: TransformationErrorDetail[]) {
    super('Invalid mappingJson');
  }
}

export function createTransformationError(
  field: string,
  code: TransformationErrorCode,
  message: string,
  path?: string,
): TransformationErrorDetail {
  return {
    field,
    code,
    message,
    path,
  };
}
