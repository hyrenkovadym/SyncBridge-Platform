'use client';

import { FormEvent, useMemo, useState } from 'react';

type Field = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  placeholder: string;
};

export function AuthForm({
  title,
  subtitle,
  fields,
  buttonLabel,
  onSubmit,
  errorMessage,
  isSubmitting = false,
  footerNote,
}: {
  title: string;
  subtitle: string;
  fields: Field[];
  buttonLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  errorMessage?: string;
  isSubmitting?: boolean;
  footerNote?: string;
}) {
  const initialValues = useMemo(
    () =>
      fields.reduce<Record<string, string>>((acc, field) => {
        acc[field.id] = '';
        return acc;
      }, {}),
    [fields],
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <section className="card auth-card">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <form onSubmit={handleSubmit}>
        {fields.map((field) => (
          <label key={field.id} htmlFor={field.id}>
            {field.label}
            <input
              id={field.id}
              name={field.id}
              type={field.type}
              placeholder={field.placeholder}
              value={values[field.id] ?? ''}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.id]: event.target.value,
                }))
              }
              required
            />
          </label>
        ))}
        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait...' : buttonLabel}
        </button>
      </form>
      {footerNote ? <small>{footerNote}</small> : null}
    </section>
  );
}
