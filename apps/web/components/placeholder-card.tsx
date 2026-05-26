export function PlaceholderCard({
  title,
  description,
  hint,
}: {
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p>{description}</p>
      {hint ? <small>{hint}</small> : null}
    </section>
  );
}
