# Runtime Contract

A compiling `app.bicep` proves only that its syntax and resource shapes are accepted. The generated model must also satisfy every workload's real process, configuration, storage, and dependency contract.

Read [runtime-contract.md](runtime-contract.md), [runtime-bindings.md](runtime-bindings.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Evidence to inspect

Start with an explicit request or scenario contract, then inspect primary evidence before relying on prose documentation:

1. Explicit profile: requested Radius types, provider/backend, resource-name parameters, workload roles/count, app-native keys, protocol/config values, secret bindings, and relationship names. Include deployment contracts in the target repository's documentation, Environment definition, and verification workflow.
2. Dockerfile and complete build context: stages, copied files, build arguments, target platforms, cross-build strategy, `ENTRYPOINT`, `CMD`, `WORKDIR`, `USER`, installed shells/tools, required Git metadata, and writable paths.
3. Compose/Helm/Kubernetes manifests: service roles, images, commands, environment, mounted config, ports, volumes, health checks, and dependency topology.
4. Entrypoints and source: environment/config reads, defaults, client constructors, URL assembly, protocol options, listener address/port, migrations, and worker-versus-web behavior.
5. Example configuration and documentation: use these to confirm source behavior, not to override pinned source or an explicit compatible profile.

For Radius Recipe and Environment evidence, use only material explicitly supplied in the modeling context, returned by `show-radius-type.mjs`, or stored in the target repository. Do not search local Radius caches, installed plugins, `defaults.yaml`, GitHub, registries, or provider repositories to fill a missing contract.

`EXPOSE`, a Compose port mapping, or a health endpoint alone is not proof that the process listens correctly or can reach its dependencies. For external-client ingress, follow the route authoring rule in [app.bicep Structure](../SKILL.md#appbicep-structure-mandatory-order).

## Select the deployment profile

Choose the runtime path before choosing resources:

1. If the request supplies a profile, treat every named type, role, key, required value, secret binding, and connection as an acceptance criterion.
2. Confirm the pinned source revision contains the adapter, client, configuration syntax, and image tools needed to implement that profile.
3. Do not replace the requested profile with a source default or another supported backend. Defaults only resolve choices the request leaves open.
4. If no profile is supplied, choose the first complete primary profile proven by the highest-precedence available evidence and anchor it to exactly one documented manifest/service set or run command/example. Treat its roles, command, settings, volumes, probes, scale, and budgets as one indivisible profile. Every service in an anchored manifest is required unless that same manifest's condition/profile or exact launch documentation excludes it; calling a service auxiliary, monitoring, or a sidecar does not make it optional. Do not inspect, compare, or combine alternate-profile documents after anchoring unless resolution blocks this profile. Ask when materially different runnable profiles remain at the same evidence precedence.
5. Stop when the requested profile is impossible for the pinned revision or exact Radius schema/recipe; do not emit a partial definition with a caveat.
6. When no profile was requested and resolution blocks the selected profile, discard its entire ledger and try one other complete documented profile before stopping. First enumerate entrypoints across root Compose files, `deploy/**`, `helm/**`, `charts/**`, `kubernetes/**`, and deployment documentation, then choose the next independently runnable default/documented profile. A hardened, override, development, or test variant of the blocked profile is not an alternate unless its own launch documentation proves independence. A Helm values file without a long-running workload template is not runnable by itself. Carry no roles, settings, or storage decisions from the blocked profile.
7. Include a backing service only when the selected startup/configuration path necessarily initializes or consumes it. A package import, optional extra, adapter, test fixture, example, or alternate profile elsewhere in the repository is not evidence that the service is required.

Create a requirement ledger before writing Bicep:

**Criterion** / **Required evidence**

- Typed resource: Exact extension type/schema, a usable Recipe registered in the target Environment, and the selected source adapter or client
- Resource property reference: Verbatim read/write path in the exact schema/API version; exact Recipe mapping when the value is generated
- Workload role: Runnable image process and complete feature configuration
- Native key/value: Pinned-source read and exact expected format/value
- Secret binding: Developer-supplied `@secure()` parameter or exact managed/authored secret resource path and key, as appropriate
- Provider behavior: Exact Environment Recipe, resolver-returned managed Recipe, or immutable provider recipe-pack artifact and revision already supplied or stored in the target repository, plus verbatim output mapping and endpoint, protocol, TLS, and auth transformation
- Provider resource name: Exact explicit parameter and provider naming/uniqueness constraint when the Recipe or verification couples them
- Connection: Exact requested relationship name and source; projection use if relied upon

Every row must map to emitted Bicep and a real consumer. A declared but unused variable, connection, or resource does not close the row. A Recipe in a default pack does not prove that a custom target Environment registers it.

Before writing Bicep, record and prove each distinct resource property read/write path once per exact target type, API version, and selected Recipe. Each resource instance must link every planned read/write to that shared proof; check its actual values and workload contract separately. Reuse evidence, not unchecked assumptions about another workload. For a generated output, inspect the exact target Environment Recipe, the managed Recipe returned by `show-radius-type.mjs`, or a matching immutable provider recipe-pack source supplied in the modeling context or stored in the target repository, then record the verbatim output mapping. Schema prose, property names, READMEs, managed-release type names, and provider files found elsewhere do not prove that a deployed Recipe returns a value or that the target Environment registers it. Also prove that the target Environment registers every emitted type and that every omitted optional Recipe input has a safe absent/null path. For a managed secret, prove the exact authored data key or Recipe `result.secrets` key. The consumer connects to `<secret>.id` for an authored input or `<producer>.id` for a Recipe result; only a custom Kubernetes environment binding uses `<producer>.properties.secrets.name` plus the declared key. Any row that reads the key as a resource property or copies a Recipe result into an authored secret fails preflight.

Reject the model before generation if any schema path is absent, generated output lacks an exact Recipe mapping or proven Radius-managed metadata path, omitted input is unsafe, or required Recipe is unavailable in the target Environment. The reserved `secrets.name` can be Radius-managed when the resolver lists it in `recipe.managedOutputPaths`; it is not missing merely because it is absent from the Recipe module's `outputs` block. Do not repair a missing output by guessing a direct convenience property, choosing a similarly named alias, copying it through an authored secret wrapper, or retaining only an unconsumed connection. Compilation is downstream confirmation, not property-path discovery.

When mutable local extension metadata disagrees with the exact target schema and Recipe, the target deployment contract outranks the mutable artifact. Refresh or pin a verified compatible extension. If none is available, fail closed before writing rather than removing feature-critical wiring or changing the model to a stale shape.

## Inventory each workload

Record this contract for every executable role:

**Field** / **Questions to answer**

- Role: Long-running web service, worker, scheduler, migration/init job, sidecar, or one-shot CLI?
- Image: For the application's own code, which complete Dockerfile context and exact checkout commit or immutable release tag will be source-built? For a genuinely third-party/backing container, which pinned image tag or digest is used? Does the exact Recipe safely handle omitted `tag` and other optional inputs? Which platforms can this Dockerfile actually build (see [Choosing build.platforms](bicep-structure-rules.md#choosing-buildplatforms))?
- Process: What do the image entrypoint and command run? Is an override required and does the image contain the required executable or shell?
- Listener: Which address, port, and protocol does the process actually use? Which setting configures it?
- Configuration: Which exact environment variables, flags, files, nesting syntax, casing, version-specific names, representations, parser coercions, unset behavior, and defaults are consumed?
- Dependencies: Which hosts, ports, database/topic/queue names, credentials, URLs, TLS modes, and protocol versions does the client require?
- Secrets: Which values are supplied by the developer and which are produced by a recipe? Can the container consume them by reference?
- Storage: Which paths must be writable or persistent? What ownership and access mode does the process require?
- Scale/budget: Which replica counts and CPU/memory requests and limits does the selected profile declare? Which resolved schema paths preserve them?
- Primary feature: What model route, storage backend, database client, input/output pipeline, authentication/bootstrap setup, or other config proves this role performs the requested function?

Model separate web, worker, producer, consumer, and init roles separately even when they share an image.

## Prove primary-feature readiness

Process startup is insufficient for configurable proxies, gateways, file servers, and processing engines. The emitted workload must activate the selected feature path:

- a model-backed proxy has a usable model alias/provider route and endpoint/key/version wiring;
- a stream or queue pipeline has complete input and output roles/configuration;
- a storage-backed service configures the selected remote filesystem rather than leaving credential variables unused; a file server also has a bootstrapped account, folder, or equivalent runnable path that selects that filesystem;
- a database UI/client has a complete preconfigured native connection and usable noninteractive authentication/bootstrap path; and
- every generated config file is passed to the process that consumes it.

Do not count an empty default config, placeholder pipeline, admin UI or login-screen startup, health endpoint, or a dependency reserved for later manual configuration as readiness.

## Static consistency pass

Before returning the model:

1. Account for every required app-native environment/config input or document an intentional source default. For an unset value, verify the consuming code tolerates its absence on the selected request or worker path. Check application-owned session, signing, and encryption secrets independently of backend credentials; a health endpoint that bypasses their consumers does not close this check.
2. Close every explicit acceptance criterion in the requirement ledger; preserve required literal values, resource-name parameters, and exact relationship names.
3. Reject every resource property read/write that lacks a closed ledger row proving its exact schema path and, for generated outputs, its exact Recipe mapping.
4. Confirm every developer-supplied credential consumed through connection projection is in an authored or reused Secret connected through `<secret>.id`; every Recipe-generated credential consumed through standard projection comes from `<producer>.id`; and every custom Kubernetes environment binding uses `<producer>.properties.secrets.name` with the exact declared key. Confirm generated suffixes are uppercased authored data keys or Recipe `result.secrets` keys. Explicit `env` precedence must be intentional; a managed secret-derived generated value must win over an ordinary projected property with the same normalized name; two secret-derived values with the same normalized name must fail; and `disableDefaultEnvVars` must not suppress required values. No authored wrapper copies a Recipe result or composes a credential-bearing aggregate.
5. Confirm every declared port matches a configured process listener.
6. Confirm every source build pins the modeled revision, validates optional Recipe paths, records a per-image `build.platforms` decision, and preserves required Git metadata.
7. Confirm every command/argument and generated config file is compatible with the image entrypoint and available binaries.
8. Confirm every writable/persistent path has the required ownership and access mode.
9. Confirm every connection is consumed by source or intentionally retained because the selected profile requires Radius relationship metadata.
10. Confirm the complete dependency tuple for every edge, including provider-specific endpoint transformations, TLS, auth, URL encoding, and final client syntax.
11. Confirm each workload's primary feature is ready and every selected typed resource is both mandatory and used by that feature.
12. Confirm every route follows the authoring rule in [app.bicep Structure](../SKILL.md#appbicep-structure-mandatory-order).
13. Confirm no required binding or dependency was deleted to satisfy stale mutable extension metadata or obtain a clean compile.

## Map every required value

See [Map every required value](runtime-bindings.md#map-every-required-value).

## Prove each dependency client tuple

See [Prove each dependency client tuple](runtime-bindings.md#prove-each-dependency-client-tuple).

## Process, network, and storage checks

See [Process, network, and storage checks](runtime-bindings.md#process-network-and-storage-checks).

## Provider compatibility and ownership

See [Provider compatibility and ownership](runtime-bindings.md#provider-compatibility-and-ownership).
