# Runtime Bindings

Read [runtime-contract.md](runtime-contract.md), [runtime-bindings.md](runtime-bindings.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Map every required value

For each required app-native input, choose exactly one supported source:

- explicit `env.value` from a literal or verified nonsecret resource output;
- direct `env.value` from a developer-supplied `@secure()` parameter only as an explicit schema-supported or legacy compatibility fallback when the native contract requires it; prefer an authored Secret with `secretKeyRef` or a compatible Secret connection because direct `env.value` stores the resolved value in the Radius container resource and generated Pod specification;
- a connection to an authored `Radius.Security/secrets` resource through `<secret>.id`, producing secret-backed `CONNECTION_<CONNECTION>_<SECRETKEY>` values from its data keys;
- a connection to `<producer>.id`, producing secret-backed `CONNECTION_<CONNECTION>_<SECRETKEY>` values from its Recipe `result.secrets` keys;
- `valueFrom.secretKeyRef` through `<secret>.name` and a declared authored data key when preserving a required native variable or compatibility fallback;
- `valueFrom.secretKeyRef` through `<producer>.properties.secrets.name` and a declared Recipe result key only for a required custom Kubernetes environment variable name;
- an authored `Radius.Security/secrets` delivered through a schema-supported mount for app secrets/config files, or referenced by a resource schema whose credential property takes a secret-resource reference;
- runtime composition from previously bound values when the app requires a larger URL/config value; or
- a generic Radius connection only when the source parses the exact connection projection supplied by the configured Radius version.

Do not leave a required input implicit because a resource is connected. A direct property or secret reference creates a dependency edge without a connection.

Environment values are strings unless the exact container contract proves otherwise. Trace source parsing and unset behavior. Do not encode false as the non-empty string `'false'` when source uses truthiness such as `Boolean(value)`; omit an optional key or use the exact false representation the pinned source accepts.

An authored secret containing Bicep interpolation that constructs a credential-bearing aggregate value is not runtime composition. Prefer source-native decomposed host, port, database, username, password, and TLS inputs when the application safely composes them. If the workload accepts only one credential-bearing value, prove an exact compatible managed-secret output or a verified runtime encoder/composer before generation. Never assume an unconstrained credential is URL-safe.

## Prove each dependency client tuple

For every workload-to-resource edge, account for all applicable fields:

**Field** / **Proof**

- Resource/subresource: Exact database, topic, queue, container, model, or index selected by the profile
- Endpoint: Complete hostname/FQDN or URL, including any recipe-documented suffix/path transformation
- Port: Client port from an explicitly mapped Recipe output or a provider-fixed literal proven by the concrete provider profile
- Protocol: Client wire protocol and version supported by the concrete backend
- Transport security: TLS mode, certificate behavior, and encryption flags expected by source
- Authentication: Mechanism, identity/username, and source-supported config syntax
- Secret: An authored-secret connection through `<secret>.id`; an authored explicit fallback through `valueFrom.secretKeyRef` with `<secret>.name` and its declared data key; a Recipe-output connection through `<producer>.id`; or a custom Kubernetes binding through `<producer>.properties.secrets.name`
- Final format: Native URL, nested environment key, JAAS/config block, or generated file actually parsed by the workload

A resource output named `host` may be only one segment of the endpoint. A type name such as Kafka or RabbitMQ does not prove broker compatibility. Apply provider-specific values in `app.bicep` when the application must consume them, while keeping provider provisioning in Environment Bicep.

Treat every network/database client initializer as a pre-resolution gate. Use one focused source search to trace both its endpoint argument and complete sibling options/config object to every endpoint, TLS/SSL, certificate-validation, and authentication input. Map every found input independently; a URL never subsumes sibling client options.

## Process, network, and storage checks

- `containerPort` exposes a network endpoint; it does not change the process listener. Set the app's listener configuration when its default differs.
- Kubernetes `command` replaces the image `ENTRYPOINT`; `args` replaces `CMD`. Preserve the image defaults unless an inspected runtime contract requires an override.
- Before using shell-based runtime composition, confirm the image contains that shell and every invoked binary.
- A shell expansion is not URL encoding. Prove the runtime encoder or use source-native decomposed inputs that handle arbitrary valid credentials.
- Ensure config/data paths are writable for the image user. Add persistent storage only when state must survive restarts.
- Keep migrations and verification probes distinct from the long-running application. Use an init role only when the application genuinely requires it.
- When a selected profile requires multiple roles, model every role and its complete command/configuration. Do not collapse producer and consumer behavior into an idle process.
- Treat replica counts and CPU/memory requests and limits from the selected profile as required behavior whenever the resolved schema can represent them. Preserve explicit zero-like values; do not omit a budget merely because it is operational metadata rather than application configuration.
- If required configuration is not packaged in the image, generate or mount it only through a schema-supported mechanism. Validate the complete file syntax, expansion rules, destination ownership, and command that consumes it.
- For `Radius.Compute/containerImages`, pin the Git source to the exact modeled checkout. Inspect the exact Recipe's omitted-tag path and set a Docker-valid immutable tag only when that contract requires one.
- Decide each source build's `build.platforms` from the Dockerfile's own cross-compilation strategy, using the [Choosing build.platforms](bicep-structure-rules.md#choosing-buildplatforms) procedure. Do not treat builder emulation as a substitute: the type definition states there is no QEMU/binfmt fallback, so an image the Dockerfile cannot cross-compile must be pinned or reported rather than assumed to work.
- BuildKit Git contexts omit `.git` by default. When the Dockerfile or required build step demonstrably needs Git metadata, require schema-supported `BUILDKIT_CONTEXT_KEEP_GIT_DIR=1`; otherwise report the packaging gap.

## Provider compatibility and ownership

Inspect the concrete type, Recipe contract, and client source together. For the managed-default profile, Recipe inspection means reading the complete `recipe.definition` already returned by the required `show-radius-type.mjs` batch; do not follow references from that definition. For an explicit target profile, inspect only Recipe artifacts already supplied in the user brief or managed context, or repository-pinned local Recipe files. Neither path permits querying a control plane, registry, GitHub, or another external source. Do not execute `rad`, fetch versions or Recipe metadata, or visit external links to discover compatibility. Secret-backed connection projection is established only when the managed resolver result or explicit target Recipe evidence identifies the Kubernetes Container Recipe; otherwise preserve schema-supported explicit wiring. Derive FQDN suffixes, TLS, ports, auth modes, connection-string formats, protocol compatibility, network/firewall requirements, and sensitive outputs from that contract. A type named Kafka or RabbitMQ may be backed by a managed service with a compatible surface; the client must support the actual protocol and authentication mode.

`app.bicep` owns developer intent and runtime wiring. Environment/provider Bicep owns recipe modules, SKUs, region, quota, firewall/network policy, and provider-output mapping. Add provider-specific values to the app model only when the application must consume them at runtime.
