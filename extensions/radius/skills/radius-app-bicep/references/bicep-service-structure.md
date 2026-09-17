# Bicep Data, Secret, and Route Structure

Read [bicep-structure-rules.md](bicep-structure-rules.md), [bicep-image-structure.md](bicep-image-structure.md), [bicep-service-structure.md](bicep-service-structure.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Radius.Data/* structure

```bicep
resource mysqlDb 'Radius.Data/mySqlDatabases@2025-08-01-preview' = {
  name: 'mysql'
  properties: {
    environment: environment
    application: app.id
    database: 'todos'      // derived from source (e.g. MYSQL_DATABASE)
    version: '8.0'         // derived from source (e.g. image tag mysql:8.0)
    username: 'myadmin'    // administrator you author for the provisioned DB
    password: password     // from a @secure() param
  }
}
```

Rules:

- Credential inputs follow the type's schema, classified by sensitivity rather than by property name (do not assume by engine, and do not assume by the word `password`):
  - property marked `x-radius-sensitive: true`: set it on the resource from a `@secure() param` (`Radius.Data/mySqlDatabases.password`)
  - plain, non-sensitive `string` property whose schema description identifies it as the resource ID of a `Radius.Security/secrets` resource: create or reuse that Secret and assign `<secret>.id`, never a `@secure() param` (`Radius.Messaging/rabbitMQ.password`, and likewise a property named `passwordSecret` or `secretName`); assigning the raw credential makes it the Kubernetes Secret name the Recipe looks up and fails the deployment
  - schema has neither: do not invent credentials; inspect the recipe outputs and application auth requirements
  - sensitivity is not limited to the envelope's own properties: read the schema recursively and give every **writable** node marked `x-radius-sensitive: true` a `@secure() param` by name, including a leaf inside an open map (`Radius.Security/secrets.data.<key>.value`), a leaf inside a nested object, and an object that compiles to a `secureObject`. A literal, a plain `param`, and any interpolation are all rejected by `use-secure-value-for-secure-inputs`, which fails the build despite printing as a warning. A node marked sensitive **and** `readOnly: true` is a Recipe output: it is covered by the readOnly rule below and takes no parameter
- Symbolic name is engine/instance-derived (`mysqlDb`), NOT fixed — so multiple data stores never collide
- Developer-facing props (`database`, `version`, `size`, `topic`, `queue`, `container`) are derived from source — do NOT hardcode; only set properties the schema defines
- Do NOT set readOnly properties (`host`, `port`, `connectionString`) — these are recipe outputs
- A nonsecret read-only output such as `host`, `port`, or `endpoint` may be referenced for app-native wiring only when the exact schema declares it and the selected Recipe explicitly maps it. Schema presence alone is insufficient; use a provider-fixed literal only with proof from the concrete provider contract
- Resolve sensitive results from the exact schema and Recipe `result.secrets` contract. On a verified compatible Kubernetes Container Recipe, connect to the producer for standard `CONNECTION_*` projection; for an explicit custom Kubernetes environment name, bind its declared name/key through `valueFrom.secretKeyRef`. Never copy the value into an authored Secret or guess a sibling convenience property. See [secrets-handling.md](secrets-handling.md)
- A selected resource is incomplete until a workload's primary feature consumes its exact subresource, endpoint, protocol/TLS/auth settings, and secret contract

## Radius.Security/secrets structure

```bicep
@secure()
param username string

@secure()
param password string

resource dbSecret 'Radius.Security/secrets@2025-08-01-preview' = {
  name: 'db-secret'
  properties: {
    environment: environment
    application: app.id
    data: {
      USERNAME: {
        value: username
      }
      PASSWORD: {
        value: password
      }
    }
  }
}
```

Rules:
Rules:

- Use only when the exact schema supports it: for a type's secret-reference credential input, app secrets/config files, or the `radius-ghcr-registry-creds` registry-push Secret required by a `Radius.Compute/containerImages` build when the push registry is authenticated (see [containerImages](bicep-image-structure.md#radiuscomputecontainerimages-structure))
- Do not re-author a recipe-generated output. Bind directly from its schema-declared managed secret, or report that the exact contract cannot supply it
- Never set authored secret `data.value` from a recipe resource's sensitive output or a guessed convenience property
- Every `value` in an authored Secret's `data` is a sensitive schema node, so each one comes from a `@secure() param` — including a value that is not itself a credential, such as an administrator or registry username. Never hardcode any of them. The node is sensitive because of where the value is stored, not because of what it identifies
- `data` is an object map, NOT an array
- Keys in `data` must match their exact consumer or schema contract; do not impose universal casing
- `USERNAME` is the database administrator you author — it is not derived from the source. Author it as a `@secure() param` here even though the same administrator name is a plain literal on the backing resource's own `username` property (`mySqlDatabases.username`, `rabbitMQ.username`). That is not a contradiction: the resource property is a plain non-sensitive `string`, while every `data.<key>.value` in a Secret is a sensitive node. The same name takes a literal in one position and a `@secure() param` in the other, so decide from the position, not the word
- A developer-supplied credential consumed through connection projection belongs in an authored `Radius.Security/secrets`; connect the workload to `<secret>.id` so Radius injects a secret-backed `CONNECTION_<CONNECTION>_<SECRETKEY>` variable
- For Recipe-generated credentials, connect only to `<producer>.id`. Use `valueFrom.secretKeyRef` with `<producer>.properties.secrets.name` and the declared Recipe `result.secrets` key only when an explicit custom Kubernetes environment variable name is required
- Never use `<producer>.properties.secrets.name` as a connection source or author a secret to wrap a Recipe output
- Never use authored secret `data.value` interpolation to manufacture a credential-bearing URL or configuration value

## Radius.Compute/routes structure

```bicep
resource myRoute 'Radius.Compute/routes@2025-08-01-preview' = {
  name: 'my-route'
  properties: {
    environment: environment
    application: app.id
    kind: 'HTTP'
    rules: [
      {
        matches: [
          { httpPath: '/' }
        ]
        destinationContainer: {
          resourceId: myContainer.id
          containerName: 'myapp'
          containerPort: 3000
        }
      }
    ]
  }
}
```

Rules:

- Do NOT use `target`, `source`, `destination`, or `backend` — these do NOT exist
- `rules` is a required array of objects with `matches` and `destinationContainer`
- `kind` supports `HTTP`, `TCP`, `TLS`, and `UDP`; when omitted, it defaults to `HTTP`
- Omit `hostnames` unless the request names an exact HTTP Host or TLS SNI value; it does not assign the exposed hostname, which the Recipe determines
- Do not author the read-only `listener`; the Recipe assigns the route to a Gateway listener, and the Gateway may use a public or private load balancer
- `destinationContainer` requires ALL THREE: `resourceId`, `containerName`, `containerPort`
- Follow the route authoring rule in [app.bicep Structure](../SKILL.md#appbicep-structure-mandatory-order)
