export default function NewPipelinePage() {
  return (
    <section className="card">
      <h2>New Pipeline</h2>
      <p>Phase 1 placeholder form for pipeline creation.</p>
      <form>
        <label htmlFor="name">
          Name
          <input id="name" name="name" placeholder="CRM to Internal Contacts" />
        </label>
        <label htmlFor="sourceConnectorId">
          Source Connector ID
          <input id="sourceConnectorId" name="sourceConnectorId" placeholder="connector_id" />
        </label>
        <label htmlFor="targetName">
          Target Name
          <input id="targetName" name="targetName" placeholder="contacts_target" />
        </label>
        <label htmlFor="mappingJson">
          Mapping JSON
          <input id="mappingJson" name="mappingJson" placeholder='{"externalName":"fullName"}' />
        </label>
        <button type="button">Save Pipeline</button>
      </form>
    </section>
  );
}
