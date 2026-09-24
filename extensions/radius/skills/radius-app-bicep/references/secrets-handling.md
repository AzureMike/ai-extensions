# Secrets and Credentials

Secret behavior is part of the exact resource type, extension, recipe, and container contract. Do not copy a secret path or key from another type or version.

Read [secrets-handling.md](secrets-handling.md), [secret-inputs.md](secret-inputs.md), [secret-runtime.md](secret-runtime.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Resolve the contract first

For every secret, inspect:

1. the exact registered resource schema for sensitive input properties, secret references, read-only outputs, and key names;
2. the configured recipe's parameters and output mapping;
3. the exact `Radius.Security/secrets` and `Radius.Compute/containers` schemas for authored-secret connections, producer connections, and `secretKeyRef` support; and
4. the application source for the final native variable/configuration name and required format.

Preserve the application's exact environment contract. Connection projection uses `CONNECTION_<CONNECTION>_<SECRETKEY>`; the suffix is the uppercased authored Secret data key or Recipe `result.secrets` key. When the application requires a different Kubernetes environment name, bind that name explicitly through `secretKeyRef`.

Never hardcode passwords, tokens, keys, or credential-bearing URLs. Use a `@secure()` parameter for developer-supplied Bicep inputs, including values placed in an authored `Radius.Security/secrets` resource. Prefer an authored Secret with `secretKeyRef` or a compatible Secret connection. Bind the secure parameter directly to `env.value` only as an explicit schema-supported or legacy compatibility fallback required by the existing native contract: it is weaker because the resolved value is stored in the Radius container resource and generated Pod specification.

## Credential shape

A resource type being available does not prove its credential fits the client. Before wiring any dependency that authenticates, resolve both sides:

- **What the contract exposes.** Use the batched resolver's exact `resources[].schema` for nonsecret read-only outputs and managed-secret metadata. Then inspect the selected Recipe that maps those values. Use `resources[].recipe.definition` for the managed-default Azure profile; when explicit target evidence selects an override, inspect that exact target Recipe instead. Prove target-Environment registration separately. `host` and `port` are an address, not a credential.
- **What the application consumes.** The exact native key and the exact value format the pinned client parses. Record literal examples from the selected manifest, chart, Compose file, or configuration alongside the source read and client constructor. A configured `host:port` value proves an address shape; do not replace it directly with a Recipe `url` or `connectionString` unless their aggregate syntax matches. A package name without a checked-in consumer is not evidence, but an exact pinned dependency plus the checked-in call site that passes the value to that client's configuration API identifies the parser contract and permits using that client's documented syntax. Combine that evidence with checked-in parser code, selected-profile literals, and the selected Recipe's auth and output mappings.

Trace every app-native environment or configuration value from the source read to the API that consumes it. Determine the exact syntax that parser accepts, including separators, option names, encoding, TLS flags, and whether it expects one aggregate value or discrete fields. Bind a Recipe output directly only when it matches that exact format; otherwise inspect schema-declared parts and use a safe runtime path proven by the checked-in application or pinned image. A matching variable name, string type, or protocol does not prove compatibility.

As a conservative executable backstop, `validate-bicep.mjs` rejects a Recipe-managed aggregate secret key such as `url`, `uri`, `dsn`, or `connectionString` assigned to an address-part environment name such as `ADDR`, `ADDRESS`, `HOST`, or `PORT`. Resolve the underlying application contract rather than renaming the environment variable to evade the `aggregate-secret-alias` check.

First look for a direct match: aggregate to aggregate or part to part. If an aggregate output does not match, inspect every schema-declared discrete output before refusing. A Recipe that exposes `host`, `port`, and a credential such as `accessKey` can support an application that reads one aggregate setting when the pinned client parser accepts a safely composed value and the runtime composition rules below are satisfied. Do not require a checked-in credential-bearing literal, because credentials must not be committed. If the client instead needs parts and the Recipe exposes only an aggregate, consider runtime decomposition under the stricter rules below. Classify compatibility as unknown only after direct binding and every supported composition or decomposition path have been exhausted.

### The Recipe decides whether there is a credential

Managed-secret metadata on a type says an aggregate output may carry a credential, not that one exists: a Recipe can map that same key to an unauthenticated value. The selected exact Recipe establishes whether the backend requires a credential and what the value's syntax is. Perform this check before authoring. For the managed-default Azure profile, inspect `resources[].recipe.definition` from the resolver without following its provenance links. For an override selected by explicit target evidence, inspect that exact Recipe from the supplied modeling context or target repository. Target-Environment registration is a separate requirement that must match the selected Recipe; do not defer the credential-shape check until registration or deployment readiness.

- **The Recipe generates a credential.** Bind it. Inspect every credential representation the Recipe exposes. If the client cannot consume one directly, use schema-declared discrete outputs for safe client-native composition or a proven runtime decomposition path. If none exists, report the gap; never fall back to wiring `host`/`port` alone. That yields a model that deploys and silently cannot authenticate, the worst available outcome, because neither the model nor the deploy says the credential was dropped.
- **The Recipe provably generates no credential.** Address-only wiring is complete for that Environment, since there is nothing to drop. Say so in the reply: name the Recipe and state that a Recipe generating a credential would require rewiring.
- **The Recipe cannot be resolved.** Treat the declared credential as required and apply the first case. An unproven assumption that the backend is open is the same silent failure, arrived at by guessing.

### Never reconstruct a credential you cannot read

A declared managed-secret key is metadata, not a readable value, so an aggregate credential cannot be split in Bicep at all — there is nothing there to split. Do not:

- read a declared key as `<resource>.properties.<key>` or `<resource>.properties.secrets.<key>` to slice or reformat it;
- invent a discrete property (for example `password`, `accessKey`, `primaryKey`) that the exact schema does not declare, or bind a key name the managed-secret metadata does not declare;
- author a `Radius.Security/secrets` whose `data` derives parts from an aggregate output or an aggregate from parts — an authored secret is no more a decomposition engine than a composition engine; or
- generate a `Radius.Resources/*` custom type to obtain a shape the predefined type does not expose (see [custom-resource-types.md](custom-resource-types.md#when-to-generate-a-custom-type)).

### Runtime decomposition needs a proven process

Splitting an aggregate at runtime is the mirror of composing one and carries the mirror hazard: Kubernetes `$(VAR_NAME)` expansion cannot slice a value at all, and slicing in a shell does not percent-decode, so a credential that had to be URL-encoded into the aggregate comes back out wrong in exactly the cases that made encoding necessary. Treat decomposition as available only when one of these is proven:

1. the application performs the split itself — its client accepts the aggregate, or its own configuration parses it into the fields it needs. This is the preferred form, because no wrapper is involved; or
2. the pinned image already contains the shell, utilities, or executable parser the wrapper would use, the exact container schema supports the entrypoint/argument override, the override preserves the image's own entrypoint contract, and the split decodes correctly for every value the exact Recipe can generate.

Establish that from the pinned image itself, not from its base's reputation: a `scratch`, distroless, or chiseled image normally has no shell, some debug variants of the same images do, and a compiled entrypoint that parses the value can succeed where a shell wrapper is impossible. What modeling cannot do is add a parser to an image it does not build, so for a third-party image the capability either exists at the modeled revision or option 2 does not apply.

### Report the gap

When neither shape matches and no proven decomposition path exists, this is a verified incompatibility: stop before the origin record and do not publish the run. Report, in the user's terms:

- the resource type and API version, the Recipe it resolves to in the target Environment, and the credential keys that Recipe actually exposes;
- the app-native key that needs a different shape, the source file and line that reads it, and the format that client accepts;
- why runtime decomposition is unavailable — naming the pinned image and what it lacks when that is the reason; and
- what would unblock it: the application consuming the exposed shape, or a Recipe/schema that exposes the values the client needs.

Do not return the definition as deployable with the dependency unwired, silently unauthenticated, or hardcoded, and do not ask the user to choose between two wirings that are both wrong.

## Checklist

- The input property, authored secret, producer connection, managed-secret name, and key all exist in the exact configured schemas and Recipe.
- Every container variable uses the exact native name and format read by source.
- Every developer-supplied credential consumed through connection projection is in an authored `Radius.Security/secrets` connected through `<secret>.id`.
- Every authored Secret used for an explicit native or compatibility-fallback binding is referenced through `valueFrom.secretKeyRef` with `<secret>.name` and its exact declared data key.
- Every Recipe-generated credential consumed through standard connection projection comes from a connection to `<producer>.id`, and its `CONNECTION_<CONNECTION>_<SECRETKEY>` suffix is the uppercased declared Recipe `result.secrets` key.
- Every custom Kubernetes environment name for a Recipe-generated credential uses `valueFrom.secretKeyRef` with `<producer>.properties.secrets.name` and the exact declared key.
- No authored secret `data.value` references a recipe resource output or guessed convenience property.
- No authored secret `data.value` interpolates an aggregate credential-bearing URL/config.
- No secret is hardcoded, assumed URL-safe, or assumed to appear in generic connection variables.
- An explicit `env` entry takes precedence over a generated connection variable of the same name. `disableDefaultEnvVars: true` suppresses all generated variables for that connection, so it is absent whenever the workload relies on a generated secret-backed value.
- A managed `result.secrets` reference wins over an ordinary generated connection value with the same normalized name; Secret-derived keys that normalize to the same uppercase variable name fail validation.
- `properties.secrets.name` remains the public Kubernetes Secret name for Recipe outputs; connections use the producer resource ID instead.
- Runtime composition preserves dependency order, escaping, encoding, and image entrypoint behavior.
- The credential shape the exact contract exposes directly matches the shape the pinned client parses, or every schema-declared discrete output and supported runtime composition or decomposition path was considered before the mismatch was reported. Address outputs stand alone only where the exact target Recipe is proven to provision no credential and the reply says so. No undeclared discrete property or secret key is invented, and no runtime split is assumed for an image with no shell.
- A final credential-bearing URL/config is bound from a matching managed secret or safely composed at runtime; it is never reconstructed in Bicep or an authored secret.

## Developer-supplied secret inputs

See [Developer-supplied secret inputs](secret-inputs.md#developer-supplied-secret-inputs).

### The same property name, the opposite form

See [The same property name, the opposite form](secret-inputs.md#the-same-property-name-the-opposite-form).

### The data key is part of the contract

See [The data key is part of the contract](secret-inputs.md#the-data-key-is-part-of-the-contract).

### Sensitivity marks a schema node, not a top-level property

See [Sensitivity marks a schema node, not a top-level property](secret-inputs.md#sensitivity-marks-a-schema-node-not-a-top-level-property).

### What counts as a secure value

See [What counts as a secure value](secret-inputs.md#what-counts-as-a-secure-value).

## Recipe-generated secret results

See [Recipe-generated secret results](secret-runtime.md#recipe-generated-secret-results).

## Runtime composition

See [Runtime composition](secret-runtime.md#runtime-composition).

### Authored secrets are not composition engines

See [Authored secrets are not composition engines](secret-runtime.md#authored-secrets-are-not-composition-engines).
