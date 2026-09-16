# Resource Type Resolution

Use this reference when resolving predefined Radius types. The main skill owns the common command sequence; this file covers the resolver contract and failure cases.

## Invocation

Pass every planned predefined type in one batch:

```text
node "<loaded-skill-base>/scripts/show-radius-type.mjs" \
  --staging "<staging-dir>" \
  "Radius.Core/applications" \
  "Radius.Compute/containerImages" \
  "Radius.Compute/containers" \
  "Radius.Data/postgreSqlDatabases"
```

Do not pass generated `Radius.Resources/*` types or legacy `Applications.*` types. Run the batch directly and inspect its returned JSON before the next model step. Do not pipe through `head`, `tail`, `grep`, `2>&1`, or another filter, and do not redirect, save, or reopen stdout. The compact result is the complete model-facing contract; do not rerun a successful batch to inspect another field.

Normally omit `@<api-version>`. When exactly one version exists, the script selects it. When several versions exist, it exits `1`, lists them on stderr, leaves staged configuration unchanged, and emits no JSON. For an existing model, select its listed version. For a new model, rerun one batch with explicit listed versions and choose the newest schema that satisfies the runtime contract.

## Successful result

On exit `0`, the script updates staged configuration and prints one line of contract-version `2` JSON with:

- `resourceEnvelope`: shared top-level authoring and output rules
- `schemaFormat`: the property-path notation and marker legend
- `resources[]`: exact `type`, `apiVersion`, complete `propertySchema`, and `recipe`
- `notFound[]`: selectors absent from the managed catalog

Inspect every entry. Duplicate selectors resolve once. A required type in `notFound` is a blocker, including when all requested types are missing. Do not omit it, substitute a similar type, or recreate a predefined contract under `Radius.Resources`.

The script reads staged `bicepconfig.json`, then current `.radius/bicepconfig.json`, then an empty object. It preserves unrelated settings, enables extensibility, and fills an absent `extensions.radius`. A conflicting nonblank alias fails without changing the file. Do not create or replace the `radius` alias yourself.

The script also merges `<staging-dir>/resolved-types.json`. That file records schema sensitivity for `validate-bicep.mjs`. Do not author, edit, or delete it. Resolve every predefined type the model uses.

## Property-schema contract

Every `propertySchema` entry is relative to the resource's `properties` object. Follow the returned `schemaFormat` exactly: `!` means required in its parent, `ro` may be referenced but not set, `wo` may be set but not referenced, and `secret` means sensitive. `[]` identifies array items, `*` identifies map values, `{name}` identifies a discriminated variant, and `|N` identifies a `oneOf` branch. Apply returned `const`, `enum`, and numeric, length, item-count, and pattern constraints. Objects are closed unless the index includes a matching `*` child.

A writable path marked `secret` takes a named `@secure()` parameter at that depth. A sensitive read-only path is generated output metadata, not a value to copy into plain state, and must remain unset. A plain string property documented as a `Radius.Security/secrets` resource ID takes the Secret resource ID, not a raw credential.

The script retains the full recursive generated schema internally and stages its sensitivity contract in `<staging-dir>/resolved-types.json` for `validate-bicep.mjs`. The compact stdout contract is authoritative for authoring; do not search for or reconstruct another schema representation.

## Recipe evidence

`recipe.status: "available"` includes the exact managed-release default Azure Recipe definition for that type. It proves only that matching definition. It does not prove target-Environment registration, omitted-input behavior outside the returned definition, connection projection, declarations referenced elsewhere, or application compatibility.

When the schema declares read-only `secrets.name` and the inline Recipe maps a secret key, Radius materializes a managed Secret and synthesizes its reserved name. The resolver records that path in `recipe.managedOutputPaths` and includes it in `recipe.outputPaths`; it need not appear literally in the module's `outputs` block. Bind a declared key through `valueFrom.secretKeyRef` with that name, not by copying the secret output into `env.value`. When the output-path list is present, an unlisted read-only path still needs separate proof. When the list is absent because the selected module is opaque, its outputs are unknown rather than proven absent; seek separate exact-type evidence before reading such a path.

Use the returned definition as managed-default evidence unless explicit target evidence selects another Recipe. Inspect only returned or repository-pinned evidence. Do not follow repository, registry, module, provider, `defaults.yaml`, or other external references.

`recipe.status: "notFound"` means the managed pack has no exact entry. `recipe.status: "unavailable"` means the pack could not be loaded or inspected. Either is a blocker when the model depends on Recipe behavior.

## Exit codes

- `0`: schema resolution completed, including partial or all-missing results. Inspect `notFound`.
- `1`: version ambiguity, unavailable explicit version, staging, managed-CLI, schema-source, schema, configuration, or other resolution failure. Stderr contains diagnostics and stdout contains no contract JSON.
- `2`: usage error.

Abort the modeling run after a nonzero exit. Never repair the managed CLI or search for another binary.

## Predefined type allow-list

| Need                  | Resource type                      |
| --------------------- | ---------------------------------- |
| Application           | `Radius.Core/applications`         |
| Container images      | `Radius.Compute/containerImages`   |
| Containers            | `Radius.Compute/containers`        |
| External-client route | `Radius.Compute/routes`            |
| MySQL                 | `Radius.Data/mySqlDatabases`       |
| PostgreSQL            | `Radius.Data/postgreSqlDatabases`  |
| Neo4j                 | `Radius.Data/neo4jDatabases`       |
| MongoDB               | `Radius.Data/mongoDatabases`       |
| Redis                 | `Radius.Data/redisCaches`          |
| SQL Server            | `Radius.Data/sqlServerDatabases`   |
| Kafka                 | `Radius.Messaging/kafka`           |
| RabbitMQ              | `Radius.Messaging/rabbitMQ`        |
| AI model              | `Radius.AI/models`                 |
| AI search             | `Radius.AI/search`                 |
| Object storage        | `Radius.Storage/objectStorage`     |
| Persistent storage    | `Radius.Compute/persistentVolumes` |
| Secrets               | `Radius.Security/secrets`          |

Do not invent properties or substitute one predefined type for another. If an essential service has no matching candidate, follow [custom-resource-types.md](custom-resource-types.md).
