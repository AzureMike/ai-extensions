# Recipe-Generated Secrets and Runtime Composition

Read [secrets-handling.md](secrets-handling.md), [secret-inputs.md](secret-inputs.md), [secret-runtime.md](secret-runtime.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Recipe-generated secret results

Some Recipes generate sensitive values such as access keys, URLs, or connection strings through `result.secrets`. Their contract varies:

- a schema version may expose a public managed-secret name and declared `result.secrets` keys;
- another version may use a different output shape or key names; or
- the configured recipe may not expose the value in a form containers can bind.

Use a connection to the producer resource for the standard connection environment:

```bicep
connections: {
  service: {
    source: service.id
  }
}
```

If the Recipe declares `apiKey` in `result.secrets`, Radius injects it as secret-backed `CONNECTION_SERVICE_APIKEY`. The `APIKEY` suffix is the uppercased exact result key; it does not come from a guessed resource property. Connect only to `service.id`, not `service.properties.secrets.name`.

Radius materializes Recipe `result.secrets` entries into a managed Kubernetes Secret and keeps `<producer>.properties.secrets.name` public as that Kubernetes Secret name. Use it only when the application requires an explicit custom environment name:

The batched resolver lists this reserved path in `recipe.managedOutputPaths` when both the schema and inline Recipe prove it. It is synthesized by Radius, so it does not appear as a literal `secrets.name` in the Recipe module's `outputs` mapping.

```bicep
APP_API_KEY: {
  valueFrom: {
    secretKeyRef: {
      secretName: service.properties.secrets.name
      key: 'apiKey'
    }
  }
}
```

The key must be declared by the exact Recipe `result.secrets` contract. Never create an authored `Radius.Security/secrets` wrapper whose `data` copies a Recipe-generated value from a resource property. An authored secret is not an adapter for a missing or different output shape.

The public Recipe-managed property is `properties.secrets.name`; do not invent an alternate nested identifier or guess a key. If the exact schema/Recipe does not expose the required managed-secret name and key, report the gap. If a mutable compiled extension disagrees with that exact contract, report version drift rather than inventing a convenience property or wrapper.

If the exact contract cannot deliver a required secret by reference, report the schema/recipe gap rather than placing it in plain state.

## Runtime composition

Applications often require one URL or config value that embeds a secret. Bicep interpolation would materialize the combined value before the container starts, so prefer runtime composition:

1. Bind the secret into a helper environment variable: through an authored-secret connection for a developer-supplied credential, through a producer connection for a Recipe-generated standard `CONNECTION_*` variable, or through `secretKeyRef` from `<producer>.properties.secrets.name` for an explicit custom Kubernetes environment name.
2. Bind nonsecret host, port, database, and username values from verified outputs or literals.
3. Make sure the helper actually reaches the container's environment before the value that reads it. Authoring order does not decide this — see below.
4. Compose the final app-native value in the container runtime or let the application construct it. The final key and syntax must exactly match the selected pinned-source contract.

For a non-URL format, the application or entrypoint can compose a generated secret-backed variable such as `CONNECTION_DATABASE_PASSWORD` with separately bound nonsecret values. When preserving a pre-existing native name for a Recipe-generated credential instead, bind the declared Recipe result through an explicit `secretKeyRef`:

```bicep
env: {
  APP_DATABASE_OPTIONS: {
    // cache is the resource symbol; substitute your actual resource
    value: 'host=${cache.properties.host};password=$(DB_PASSWORD)'
  }
  DB_PASSWORD: {
    valueFrom: {
      secretKeyRef: {
        secretName: cache.properties.secrets.name
        key: 'password'
      }
    }
  }
}
```

`DB_PASSWORD` sorts after the value that reads it, and still resolves: the recipe emits every `secretKeyRef` variable ahead of every plain value, so a recipe-generated credential is bound under the exact name the application reads and ordering never enters into it.

Kubernetes expands `$(VAR_NAME)` only from variables earlier in the container's environment list, and the recipe decides that order, not the order you write the `env` map in. The containers recipe builds the list with `items()`, which sorts by key, so authored order is discarded — writing the helper first buys nothing.

What the Kubernetes recipe does guarantee is that `secretKeyRef` variables are emitted before plain `value` variables. So a composed value can always read a secret-backed helper, whatever the two keys are called, and that is the form to prefer.

Two plain values are sorted against each other by name. This still matters when preserving an existing developer-supplied `@secure()` `env.value` fallback: if the application dictates both names and the helper's does not sort first, that composition cannot be expressed — report it rather than renaming a key the application reads. On a verified compatible Kubernetes Container Recipe, an explicitly requested migration may instead use an authored or reused Secret connection, whose generated value is secret-backed and emitted before plain values. `validate-bicep.mjs` fails the model when a plain value reads a plain helper that cannot reach it.

Verify this against the exact target recipe rather than carrying it over: the Azure ACI recipe emits every variable in one name-sorted list with no such separation, and `$(VAR_NAME)` expansion is a Kubernetes container behavior to begin with, so this composition pattern does not hold on every platform.

Preserve escaping through Bicep and any shell/config layer, and confirm the image has every shell or utility used by an entrypoint wrapper. The inverse direction — the contract exposes one aggregate value and the application wants the parts — is governed by [Credential shape](secrets-handling.md#credential-shape); it is not symmetric with composition and is usually a contract gap to report.

Credentials embedded in URLs must be URL-encoded. Kubernetes variable expansion does not encode them; use application logic or a verified runtime helper. If safe encoding cannot be guaranteed, do not generate a fragile connection string.

Do not assume an unconstrained developer-supplied password is URL-safe, recommend a restricted character set as a workaround, or treat shell expansion as encoding. Prefer source-native decomposed host, port, database, username, password, and TLS flags or fields when the application safely assembles the final client value.

### Authored secrets are not composition engines

`Radius.Security/secrets` can carry an exact application secret, but it does not turn Bicep interpolation into runtime composition. Never manufacture an aggregate credential-bearing URL or configuration in authored `data.value`, regardless of whether its other parts come from outputs, parameters, variables, or literals.

When the application accepts only one credential-bearing value, choose one proven path:

1. Bind an exact, source-compatible connection string from schema-declared managed-secret metadata.
2. Bind the parts separately and use a verified application, entrypoint, or helper that safely encodes and composes them at runtime.

If neither path exists, report the schema/application contract gap and do not emit a definition described as deployable.
