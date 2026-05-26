export default function NewConnectorPage() {
  return (
    <section className="card">
      <h2>New Connector</h2>
      <p>Phase 1 placeholder form for connector creation.</p>
      <form>
        <label htmlFor="name">
          Name
          <input id="name" name="name" placeholder="Primary ERP Connector" />
        </label>
        <label htmlFor="type">
          Type
          <input id="type" name="type" placeholder="REST_API | WEBHOOK | CSV_UPLOAD..." />
        </label>
        <label htmlFor="configJson">
          Config JSON
          <input id="configJson" name="configJson" placeholder='{"baseUrl":"https://example.local"}' />
        </label>
        <button type="button">Save Connector</button>
      </form>
      <small>Production note: secrets must be stored in a secure secret manager.</small>
    </section>
  );
}
