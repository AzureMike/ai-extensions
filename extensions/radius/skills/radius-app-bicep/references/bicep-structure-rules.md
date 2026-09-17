# Bicep Structure Rules

These rules apply to all generated `app.bicep` files. Resolve property names and types from the exact extension configured by the target repository and the matching registered schema/recipe contract. This file covers structural patterns only.

Read [bicep-structure-rules.md](bicep-structure-rules.md), [bicep-image-structure.md](bicep-image-structure.md), [bicep-service-structure.md](bicep-service-structure.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## General

- `extension radius` is the only extension line and comes first (it provides every Radius type; no per-namespace or per-type extensions)
- `param environment string` always declared
- A `@secure()` parameter is declared for each developer-supplied secret
- Exactly ONE `Radius.Core/applications` resource using the matching `resources[].apiVersion` returned by `show-radius-type.mjs`
- The `@<apiVersion>` shown in the examples below (e.g. `2025-08-01-preview`) is illustrative; replace it with the matching `resources[].apiVersion` returned by `show-radius-type.mjs`
- All output files go in `.radius/` directory
- Compile with an extension compatible with the exact target Environment schema and Recipe contract; stale mutable metadata never overrides deployment-required wiring
- Emit every exact type, workload role, native key/value, secret binding, and relationship required by the selected compatible deployment profile

## Radius.Compute/containers structure

```bicep
resource myContainer 'Radius.Compute/containers@2025-08-01-preview' = {
  name: 'my-container'
  properties: {
    environment: environment
    application: app.id
    containers: {                     // object map, NOT array
      myapp: {                        // key = container name (camelCase)
        image: myImage.properties.imageReference
        ports: {                      // object map, NOT array
          web: {
            containerPort: 3000       // NOT "port"
          }
        }
        env: {                        // exact app-native variable names
          MY_VAR: {
            value: 'some-value'       // must use { value: '...' } syntax
          }
          SECRET_VAR: {               // bind a recipe-managed secret
            valueFrom: {
              secretKeyRef: {
                secretName: service.properties.secrets.name
                key: 'apiKey'
              }
            }
          }
        }
      }
    }
    connections: {                    // optional TOP-LEVEL relationship map
      credentials: {                 // object map, NOT array
        source: dbSecret.id           // authored secret, or producer.id for Recipe outputs
      }
    }
  }
}
```

Rules:

- `containers` is an object map, NOT an array
- `ports` is an object map, NOT an array
- `connections` is an object map, NOT an array
- `connections` is a TOP-LEVEL property under `properties` — NOT inside `containers`
- `disableDefaultEnvVars` goes on the connection entry, NOT on the container; omit it when the workload relies on generated `CONNECTION_<CONNECTION>_<SECRETKEY>` variables
- Port property is `containerPort`, NOT `port`
- `env.value` uses `{ value: ... }` for a literal or verified nonsecret output. Direct `{ value: <secure-param> }` is allowed only as an explicit schema-supported or legacy compatibility fallback required by the native contract; prefer an authored Secret with `secretKeyRef` or a compatible Secret connection because the direct form stores the resolved value in the Radius container resource and generated Pod specification. Use `{ valueFrom: { secretKeyRef: { secretName: ..., key: ... } } }` with `<secret>.name` and a declared authored data key when preserving a native variable or compatibility fallback, or with `<producer>.properties.secrets.name` and a declared Recipe `result.secrets` key for a custom Kubernetes name
- `containerPort` exposes the process port; it does not configure the process listener
- `command` replaces the image `ENTRYPOINT`, and `args` replaces `CMD`; override only after inspecting the image contract and required binaries
- Never **set** a read-only property. Reference a nonsecret read-only output only when the exact schema declares it and the exact target Recipe explicitly maps it
- A connection to an authored or reused Secret uses `<secret>.id`; a connection for Recipe-generated `result.secrets` entries uses only `<producer>.id`. In `CONNECTION_<CONNECTION>_<SECRETKEY>`, `<CONNECTION>` is the connection map key uppercased without inserting separators, and `<SECRETKEY>` is the uppercased authored data key or Recipe result key; case-normalized Secret-key collisions fail validation
- An explicit `env` entry with the same name takes precedence over a generated connection variable. `disableDefaultEnvVars: true` suppresses all generated variables for that connection
- A direct resource output, image, or secret reference creates dependency ordering; `connections` is not mandatory for ordering except when connection projection is consumed
- Include every co-scheduled role required by the selected profile in the `containers` map. A producer, consumer, proxy, worker, or sidecar must have its own complete image/process/configuration entry
- A startup-generated config file is valid only when the pinned image contains the shell/tools, the destination is writable, interpolation is safe, and the process is explicitly launched with that file

### Config file delivery

Prefer a complete config already included by the source build. When an unmodified image needs an external config file and the exact schemas support it, a mounted `Radius.Security/secrets` resource avoids assuming the image has a shell. The file content is supplied through a `@secure()` parameter: every `data.<key>.value` is a sensitive schema node, so an inline literal here fails `use-secure-value-for-secure-inputs` even when the configuration holds no credential.

```bicep
@description('Complete source-supported contents of app.yaml, supplied at deployment time.')
@secure()
param appConfig string

resource runtimeConfig 'Radius.Security/secrets@2025-08-01-preview' = {
  name: 'runtime-config'
  properties: {
    environment: environment
    application: app.id
    data: {
      'app.yaml': {
        value: appConfig
      }
    }
  }
}

resource workload 'Radius.Compute/containers@2025-08-01-preview' = {
  name: 'workload'
  properties: {
    environment: environment
    application: app.id
    containers: {
      app: {
        image: '<pinned-image>'
        args: ['--config', '/etc/app/app.yaml']
        volumeMounts: [
          {
            volumeName: 'config'
            mountPath: '/etc/app'
          }
        ]
      }
    }
    volumes: {
      config: {
        secretName: runtimeConfig.name
      }
    }
  }
}
```

Confirm the mounted filename, process argument, and secret/container schemas at the configured versions. Keep credentials out of the file when it can reference environment variables; use an authored-secret connection for a developer-supplied credential, or a producer connection for a Recipe-managed value. Preserve an existing custom native name with an explicit supported binding when required. Use startup generation only when mounting cannot satisfy the source contract and the image's shell, tools, writable path, expansion, and final command are all verified.

## Image resolution

The repository must contain a Dockerfile; a repo without one is unsupported at launch and the skill stops before modeling (see the [Prerequisites in SKILL.md](../SKILL.md#prerequisites)). Building the application's own workloads from that Dockerfile is the default path:

1. Build the application's own workloads from a complete, practical repository Dockerfile/context using `Radius.Compute/containerImages` with an immutable `build.source` ref, Recipe-validated tag behavior, and target-compatible platforms.
2. Use a published image (immutable digest or pinned release tag) only for a genuinely third-party/backing container (for example a stock proxy, admin UI, or monitoring sidecar), never for the application's own code.
3. If a required workload has neither a usable Dockerfile (application code) nor a suitable maintained published image (third-party component), report the packaging gap instead of using a bare runtime base image or inventing a fragile build wrapper.

Do not use branch refs or `latest` when an immutable commit, tag, or digest is available.

## Runtime semantics

- Infer the listener address and port from the process/configuration, not only `EXPOSE`, compose mappings, or health checks.
- Model web, worker, producer, consumer, init, and one-shot roles according to their actual lifecycle.
- Preserve image entrypoint behavior unless a required override is verified. Confirm any shell, templating command, or helper binary exists in the image.
- Model writable and persistent paths with the ownership and access mode required by the process.
- Preserve exact required provider literals and nested configuration keys from an explicit compatible profile. A complete FQDN, TLS/SASL/encryption setting, model alias, or config-file stanza is application runtime wiring, not provider provisioning.
- Preserve source parser semantics, including type coercion and unset behavior. A non-empty string such as `'false'` may be truthy in the pinned source.
- Model only backing services mandatory for the selected source path. Optional dependencies, adapters, tests, examples, and alternate profiles do not become resources.
- Do not return an idle default, placeholder config, or UI-only process when the selected profile requires a functioning model route, remote storage backend, database connection, or message pipeline.
- Follow [runtime-contract.md](runtime-contract.md) for the full consistency pass.

## Application/provider boundary

`app.bicep` expresses developer intent and app-facing runtime values. Environment/provider Bicep owns recipe modules, cloud SKUs, regions, quota, network/firewall configuration, and output mapping. Keep provider implementation out of the app model unless the application itself must consume a provider-specific runtime value.

## Properties that do NOT exist

These are commonly hallucinated. They will cause deployment errors:

**Resource Type** / **Invalid property**

- `Radius.Compute/containers`: `port` (use `containerPort`), `image` at top level
- `Radius.Compute/routes`: `target`, `source`, `destination`, `backend`

## Radius.Compute/containerImages structure

See [Radius.Compute/containerImages structure](bicep-image-structure.md#radiuscomputecontainerimages-structure).

### Registry push credentials (required only for an authenticated registry)

See [Registry push credentials (required only for an authenticated registry)](bicep-image-structure.md#registry-push-credentials-required-only-for-an-authenticated-registry).

### Choosing build.platforms

See [Choosing build.platforms](bicep-image-structure.md#choosing-buildplatforms).

## Radius.Data/* structure

See [Radius.Data/* structure](bicep-service-structure.md#radiusdata-structure).

## Radius.Security/secrets structure

See [Radius.Security/secrets structure](bicep-service-structure.md#radiussecuritysecrets-structure).

## Radius.Compute/routes structure

See [Radius.Compute/routes structure](bicep-service-structure.md#radiuscomputeroutes-structure).

## Output rules

See [Output rules](bicep-image-structure.md#output-rules).
