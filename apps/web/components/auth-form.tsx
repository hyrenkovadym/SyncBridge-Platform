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
}: {
  title: string;
  subtitle: string;
  fields: Field[];
  buttonLabel: string;
}) {
  return (
    <section className="card auth-card">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <form>
        {fields.map((field) => (
          <label key={field.id} htmlFor={field.id}>
            {field.label}
            <input id={field.id} name={field.id} type={field.type} placeholder={field.placeholder} />
          </label>
        ))}
        <button type="button">{buttonLabel}</button>
      </form>
      <small>Phase 1 note: form submission wiring will be added in Phase 2.</small>
    </section>
  );
}
