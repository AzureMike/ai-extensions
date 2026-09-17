# Secret Input Reference

Read [secrets-handling.md](secrets-handling.md), [secret-inputs.md](secret-inputs.md), [secret-runtime.md](secret-runtime.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Developer-supplied secret inputs

Decide each credential input from the schema, never from the property's name. A credential input property is one of two kinds:

- **Inline sensitive value** — the schema marks the property `x-radius-sensitive: true`. Assign the `@secure()` parameter directly to that property, as `Radius.Data/mySqlDatabases.password` requires.
- **Secret resource reference** — the schema types the property as a plain, non-sensitive `string` whose description identifies it as the resource ID of a `Radius.Security/secrets` resource. Author or reuse that Secret and assign `<secret>.id`, as `Radius.Messaging/rabbitMQ.password` requires. Never assign a `@secure()` parameter to a reference property.
- If the schema defines no credential input, do not invent one. Where a reference property is optional and the application does not need to own the credential, omitting it and consuming the Recipe-generated credential is valid.

A property named `password` may be either kind, and a reference property may be named `password`, `passwordSecret`, or `secretName`. The name carries no information — read the schema. Assigning a raw credential to a reference property is a deployment failure rather than a style difference: the Recipe derives the Kubernetes Secret name for `secretKeyRef` from that value, and Kubernetes rejects a password as an RFC 1123 subdomain.

These two kinds classify the envelope's own credential properties. Sensitivity is not confined to that level: see [Sensitivity marks a schema node, not a top-level property](#sensitivity-marks-a-schema-node-not-a-top-level-property) for the nested and object cases, and [What counts as a secure value](#what-counts-as-a-secure-value) for what may be assigned once a node is marked.

Two checks enforce this from different evidence, and neither substitutes for the other:

- **Bicep** rejects a value it cannot prove secure on a node the compiled type marks sensitive, at any depth and for generated custom types too, as `use-secure-value-for-secure-inputs`. This is the direction that catches a hardcoded credential.
- **`validate-bicep.mjs`** covers the opposite direction, which Bicep cannot see: it reads the sensitivity `show-radius-type.mjs` staged for every resolved type and fails the compile when a `@secure()` parameter is assigned directly to a property the schema does *not* mark sensitive, naming the resource and property it rejected. It reads the compiled template, so it sees a whole `@secure()` parameter assigned to a property of a resource's properties envelope; a credential that reaches such a property through a variable, a string interpolation, or a nested object is not reported and remains yours to get right.

Neither check inspects what an authored Secret puts inside: the data-key contract below is not verified anywhere, so a Secret with the wrong key casing compiles, passes both checks, and still fails at container start.

When the workload consumes a developer-supplied credential through connection projection, author or reuse a `Radius.Security/secrets` resource and connect the workload to its resource ID. A sensitive backing-resource input is not readable back from that resource, so do not connect to the backing resource and expect Radius to project the supplied value. Developer-owned inputs remain inputs and must not be returned through Recipe `result.secrets`, as reflected by the PostgreSQL and MySQL ownership corrections in [resource-types-contrib#298](https://github.com/radius-project/resource-types-contrib/pull/298) and [resource-types-contrib#315](https://github.com/radius-project/resource-types-contrib/pull/315):

```bicep
@secure()
param password string

resource mysql 'Radius.Data/mySqlDatabases@2025-08-01-preview' = {
  name: 'mysql'
  properties: {
    environment: environment
    application: app.id
    username: 'myadmin'
    password: password
  }
}

resource mysqlCredentials 'Radius.Security/secrets@2025-08-01-preview' = {
  name: 'mysql-client-credentials'
  properties: {
    environment: environment
    application: app.id
    data: {
      password: {
        value: password
      }
    }
  }
}

resource apiContainer 'Radius.Compute/containers@2025-08-01-preview' = {
  name: 'api'
  properties: {
    environment: environment
    application: app.id
    containers: {
      api: {
        image: apiImage.properties.imageReference
      }
    }
    connections: {
      mysql: {
        source: mysql.id
      }
      mysqlSecret: {
        source: mysqlCredentials.id
      }
    }
  }
}
```

The `mysql` producer connection projects verified ordinary outputs such as `CONNECTION_MYSQL_HOST` and `CONNECTION_MYSQL_PORT`. The authored Secret connection injects `CONNECTION_MYSQLSECRET_PASSWORD`: `MYSQLSECRET` is the `mysqlSecret` connection map key uppercased without inserting a separator, and `PASSWORD` is the uppercased authored `password` data key. The names are illustrative. Confirm the resource properties, connection keys, Secret data key, generated environment names, and required value format against the target version and source. Keep the authored Secret name distinct from Recipe-owned Kubernetes Secret names. If the application requires a different native name, model an explicit supported binding rather than assuming the connection renames it.

### The same property name, the opposite form

`Radius.Messaging/rabbitMQ` also defines a property named `password`, but its schema types it as a plain, non-sensitive `string` whose description identifies it as the resource ID of a `Radius.Security/secrets` resource holding the broker password under the data key `password`. It therefore takes `<secret>.id` — the exact opposite of the identically named `Radius.Data/mySqlDatabases.password` above, which takes the secure parameter inline:

```bicep
@secure()
param rabbitmqPassword string

resource rabbitmqCredentials 'Radius.Security/secrets@2025-08-01-preview' = {
  name: 'rabbitmq-credentials'
  properties: {
    environment: environment
    application: app.id
    data: {
      password: {
        value: rabbitmqPassword
      }
    }
  }
}

resource rabbitmq 'Radius.Messaging/rabbitMQ@2025-08-01-preview' = {
  name: 'rabbitmq'
  properties: {
    environment: environment
    application: app.id
    queue: 'orders'          // derived from source (e.g. ORDER_QUEUE_NAME)
    username: 'myadmin'      // authored broker administrator; consumers authenticate as this same value
    password: rabbitmqCredentials.id
  }
}
```

Writing `password: rabbitmqPassword` here deploys a broken application: the Recipe reads the property as a resource ID and uses its last segment as the Kubernetes Secret name in `secretKeyRef`, so the supplied password becomes the looked-up Secret name and Kubernetes rejects the Deployment because a password is not a lowercase RFC 1123 subdomain. Because the property is optional, omitting it entirely and consuming the Recipe-generated credential is also valid. Resolve every credential property's kind from `show-radius-type.mjs` output before assigning it; two types that share a property name do not share a convention.

### The data key is part of the contract

Pointing at the right Secret is only half of a reference property's contract. When a schema property references a `Radius.Security/secrets` resource, the authored Secret must expose the value under the exact data key the consuming schema names, matching case. The key is fixed by the consuming type and its Recipe, not chosen by the model.

- Data keys are case-sensitive. Do not uppercase them by convention, and do not assume the key matches the property name, the resource name, or the application's environment-variable name.
- Read the required key from the consuming type's schema description, not from the native variable the application happens to call it. `Radius.Messaging/rabbitMQ.password` is documented as the resource ID of the `Radius.Security/secrets` resource that holds the broker password under the data key `password`, so the authored key is exactly `password`.
- Every `secretKeyRef.key` that reads the same authored Secret must use that same exact key. The uppercased form appears only in a generated `CONNECTION_<CONNECTION>_<SECRETKEY>` variable name; it is a projection of the key, never a replacement for it.

In the example above the authored data key is `password`, the broker receives `rabbitmqCredentials.id`, and a container reading the same Secret uses the identical lowercase key:

```bicep
RABBITMQ_PASSWORD: {
  valueFrom: {
    secretKeyRef: {
      secretName: rabbitmqCredentials.name
      key: 'password'
    }
  }
}
```

Authoring that data key as `PASSWORD` fails even though the Bicep compiles and the resource ID is correct. The RabbitMQ Kubernetes Recipe reads a hardcoded lowercase `password` key from the resolved Secret, so the broker Pod resolves the right Secret, finds no `password` entry, and never starts — a `CreateContainerConfigError` rather than an admission failure. A key-casing mismatch is not cosmetic, and it survives every check that only validates the resource ID.

### Sensitivity marks a schema node, not a top-level property

`x-radius-sensitive: true` belongs to the schema node it is written on, which is not always a property of the properties envelope. Read the resolved schema recursively and treat every **writable** node it marks `"sensitive": true` as taking a secure value, whatever its depth:

- a top-level string, as in `Radius.Data/mySqlDatabases.password`;
- a leaf inside an open map, as in `Radius.Security/secrets.data.<key>.value` — the enclosing `data` is *not* marked, so a rule that reads only the envelope's own properties misses the value that actually holds the credential;
- a leaf inside a nested object, such as a custom type's `tls.clientKey`; and
- a whole object, which compiles to a `secureObject` and takes one `@secure() param object` rather than an object literal whose fields are individually secure.

Sensitivity says how a value is handled, not who supplies it, so it is not on its own an instruction to assign anything. A node the schema also marks `"readOnly": true` is a sensitive **output**: the Recipe populates it, it is never set in `app.bicep`, and it takes no `@secure()` parameter. Read it back through the Recipe's `result.secrets` contract described in [Recipe-generated secret results](secret-runtime.md#recipe-generated-secret-results). Decide from the two flags together — `sensitive` and `readOnly` — because a schema can and does mark both on one node.

The same rule governs the custom types this skill authors. `x-radius-sensitive` in `custom-types.yaml` is compiled into `custom-types.tgz`, so a generated `Radius.Resources/*` type carries the flag exactly as a predefined type does — including on a `readOnly: true` output, which stays unassigned for the same reason.

### What counts as a secure value

Only a `@secure()` parameter referenced **by name** — directly, or through a `var` that aliases it. Everything else is rejected, whatever it holds:

**Assignment** / **Secure**

- `password: dbPassword` where `dbPassword` is a `@secure() param`: yes
- `password: alias` where `var alias = dbPassword`: yes
- `password: 'hunter2'`: no — a literal
- `password: plainPassword` where `plainPassword` is a plain `param`: no — not marked `@secure()`
- `password: '${dbPassword}'`: no — interpolation discards secureness, even when every operand is secure

Because interpolation discards secureness, never assemble a credential-bearing string such as a connection URL in Bicep. Bind the credential on its own and compose the final value only through a path the pinned application source proves it supports, as [Runtime composition](secret-runtime.md#runtime-composition) describes. That path is not guaranteed to exist: the application is not yours to change, so when it accepts only one credential-bearing value and no verified entrypoint or helper can compose it safely, report the contract gap rather than falling back to interpolation.

Give a `@secure()` parameter no default value: a default would commit the credential to the application definition, which is the outcome the parameter exists to prevent.

A nested sensitive leaf is assigned exactly like a top-level one:

```bicep
@secure()
param dbPassword string

resource credentials 'Radius.Security/secrets@2025-08-01-preview' = {
  name: 'db-credentials'
  properties: {
    environment: environment
    application: app.id
    data: {
      password: {
        value: dbPassword     // data.<key>.value is the sensitive node
      }
    }
  }
}
```

The compiler enforces this for predefined and generated custom types alike: Bicep reports `use-secure-value-for-secure-inputs` for any value it cannot prove secure. Radius emits that finding with no severity, so `validate-bicep.mjs` prints it as a `warning` and still **fails** the build — it is not advisory, and it spends a repair attempt. Two related rules apply to the parameter itself. `secure-parameter-default` rejects a hardcoded default on a secure parameter. `secure-secrets-in-params` is a **name** heuristic — it reports that a parameter *may* be a credential "according to its name" — so it has two different repairs: add `@secure()` when the parameter really carries the credential, but rename it when it carries a `Radius.Security/secrets` resource ID instead. Adding `@secure()` to a reference parameter trades this warning for a `secure-parameter-target` failure, because a reference property is not sensitive and must not receive a secure parameter.
