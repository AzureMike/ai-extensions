# Bicep Image Structure and Output Rules

Read [bicep-structure-rules.md](bicep-structure-rules.md), [bicep-image-structure.md](bicep-image-structure.md), [bicep-service-structure.md](bicep-service-structure.md) in full as one reference. These required companion parts can be read in the same parallel batch.

## Radius.Compute/containerImages structure

```bicep
resource myImage 'Radius.Compute/containerImages@2025-08-01-preview' = {
  name: 'myapp-image'
  properties: {
    environment: environment
    application: app.id
    tag: 'v1.2.3'   // immutable; omit only when the exact Recipe supports omission
    build: {
      source: 'git::https://github.com/<org>/<repo>.git//<subdir>?ref=<sha-or-tag>'
    }
  }
}
```

Rules:

- The image is BUILT from `build.source` — there is NO `image` property and NO `param image string`
- `build.source` is the repo git URL: `git::https://github.com/<org>/<repo>.git//<subdir>?ref=<sha-or-tag>`. Omit `//<subdir>` when the build context is the repo root; pin `?ref=` to the exact modeled checkout or an explicit immutable release tag. Never copy `main`, `edge`, or another mutable ref from an existing deployment file. When the ref is a commit, use its full 40-character SHA; never use an abbreviated SHA. The image `tag` may remain abbreviated because it is not a Git ref
- Optional `build.dockerfile` (path to the Dockerfile relative to the source; defaults to `Dockerfile`)
- Inspect the exact Recipe before deciding whether to set `tag`. Omit it when the current contract's omitted-tag path is proven usable; otherwise set a Docker-valid immutable tag derived from the modeled source revision. Do not claim omission is broken without current Recipe evidence
- Decide `build.platforms` per image from the Dockerfile's own cross-build strategy — see [Choosing build.platforms](#choosing-buildplatforms). Never infer it from the language, a package manager, or the presence of a native dependency alone
- Inspect the Dockerfile and build commands for required Git metadata. BuildKit Git contexts omit `.git`; when the build demonstrably requires it, set schema-supported `build.args.BUILDKIT_CONTEXT_KEEP_GIT_DIR: '1'` or report the packaging gap
- The container references the built image via `<serviceName>Image.properties.imageReference`; this reference creates the dependency edge, so NO separate connection to the image is needed
- Use `containerImages` only when the source includes a complete, practical Dockerfile and build context. Do not invent a wrapper build merely to avoid a maintained published image
- Registry credentials used to push a generated image are distinct from Kubernetes credentials used to pull it at runtime

### Registry push credentials (required only for an authenticated registry)

The `containerImages` recipe builds the image in-cluster and pushes it to the OCI
registry the recipe pack configures via `containerImagesRegistry`. When that
registry requires authentication (the common case — e.g. `ghcr.io/<owner>/<repo>`,
which needs a token to push), the recipe reads the push credentials from a
Kubernetes Secret named by the pack's `containerImagesRegistrySecretName` =
**`radius-ghcr-registry-creds`** on the target cluster. So the app definition must stay
in parity with that pack parameter: when the target registry needs credentials,
author a matching registry-credentials Secret named exactly `radius-ghcr-registry-creds`.

An **unauthenticated** registry (e.g. a local/in-cluster registry the recipe pack
configures with an empty `containerImagesRegistrySecretName`) needs no
credentials — in that case do NOT author the Secret or the
`registryUsername`/`registryPassword` params, and do NOT add the `dependsOn`.
Default to authoring the Secret whenever the push registry is `ghcr.io` or any
other registry that requires a login; omit it only when you can confirm the
target registry is unauthenticated.

```bicep
@description('Username for the OCI registry the containerImages recipe pushes to (the GitHub actor for ghcr.io).')
@secure()
param registryUsername string

@description('Password/token for the OCI registry the containerImages recipe pushes to (a GitHub token with write:packages for ghcr.io).')
@secure()
param registryPassword string

// Do not change this Secret's name value from 'radius-ghcr-registry-creds'.
// The containerImages recipe looks up registry credentials by that fixed name.
resource registryCreds 'Radius.Security/secrets@2025-08-01-preview' = {
  name: 'radius-ghcr-registry-creds'
  properties: {
    environment: environment
    application: app.id
    data: {
      username: {
        value: registryUsername
      }
      password: {
        value: registryPassword
      }
    }
  }
}

resource myImage 'Radius.Compute/containerImages@2025-08-01-preview' = {
  name: 'myapp-image'
  properties: {
    environment: environment
    application: app.id
    build: {
      source: 'git::https://github.com/<org>/<repo>.git//<subdir>?ref=<sha-or-tag>'
    }
  }
  // The build reads the registry Secret at recipe execution time, so the Secret
  // must exist before the image is built and pushed. Omit this dependsOn when the
  // registry is unauthenticated and no Secret is authored.
  dependsOn: [
    registryCreds
  ]
}
```

Registry-credentials rules:

- Author the registry Secret only when the push registry requires authentication. For an unauthenticated registry, omit the Secret, the `registryUsername`/`registryPassword` params, and the `dependsOn` — the recipe pack registers the recipe with an empty `containerImagesRegistrySecretName` in that case
- WHEN the Secret is authored, its `name` property value MUST be exactly `radius-ghcr-registry-creds` — it is not free-form. It is the fixed `containerImagesRegistrySecretName` the recipe pack registers the recipe with; any other value means the recipe can't find the push credentials
- Emit the exact two-line warning comment shown above immediately before the Secret; do not vary its wording or omit it from generated `app.bicep`. Do not emit the example's explanatory comment above `dependsOn`
- Author it with the two keys `username` and `password` (lowercase, exactly these keys — the recipe reads them by name)
- Populate the keys from an `@secure() param registryUsername string` and an `@secure() param registryPassword string`. Do NOT hardcode the credentials. Both parameters are `@secure()` because both values land in `data.<key>.value`, which the Secret schema marks sensitive; a plain `param` there fails the build with `use-secure-value-for-secure-inputs`, and the username is a sensitive value in this position regardless of how identifying it is on its own
- Add `dependsOn: [registryCreds]` on the `containerImages` resource so the Secret exists on the target cluster before the build/push runs
- Do NOT set a registry on the `containerImages` resource — the push registry (`ghcr.io/<owner>/<repo>`) is an operator concern supplied by the recipe pack's `containerImagesRegistry` parameter, not the app definition
- `registryUsername`/`registryPassword` are supplied by the deploy workflow from the runner identity (`github.actor` / `GITHUB_TOKEN`); they are workflow-managed parameters, so the extension never surfaces them in the deploy UI or auto-generates values for them. Declare them but do not give them defaults
- When authored, use exactly one `radius-ghcr-registry-creds` Secret even when the app builds several images — all `containerImages` resources share the one registry Secret and each `dependsOn` it

### Choosing build.platforms

Omitting `build.platforms` builds `linux/amd64` and `linux/arm64`. Both come from one BuildKit instance, so every platform other than the builder's own needs cross-compilation in the Dockerfile; the `containerImages` type definition states there is no QEMU/binfmt emulation fallback. Without cross-compilation, a target-platform `RUN` can fail during the build with `exec format error`, while build-platform output copied into another platform's image can build cleanly and fail only at runtime. Decide from the Dockerfile's own cross-compilation strategy and never assume emulation covers either gap.

Decide for each `containerImages` resource separately. A repository that builds several images usually mixes safe and unsafe ones, and pinning them all to the least capable Dockerfile discards architecture support the others have.

Read the Dockerfile named by `build.dockerfile` (default `Dockerfile`) at the modeled commit. An image builds correctly for a platform when ALL of the following hold.

**A. The final image is not fixed to one architecture.**

Take the last `FROM` and walk its ancestry through `FROM <stage>` inheritance only. `COPY --from=<stage>` is NOT inheritance — a stage referenced only by `COPY --from` is not an ancestor.

The image is fixed when the final stage or one of its ancestors uses `FROM --platform=$BUILDPLATFORM` or a literal such as `FROM --platform=linux/amd64`. A plain `FROM` and `FROM --platform=$TARGETPLATFORM` are NOT pins; both follow the requested platform. A digest-pinned base (`FROM alpine:3.21@sha256:…`) is not a pin either when the digest names a multi-platform manifest list, which is the usual case for official images; it fixes the image only when it names one platform's manifest.

**B. Every architecture-specific artifact reaching the final image is built for the requested architecture.**

Consider each stage that contributes to the final image: the final stage's own `RUN` steps, and every stage it takes a `COPY --from` from. For each, ask whether it emits architecture-specific output, and if so whether it targets the requested architecture.

- **Architecture-specific output**: compiled binaries (C, C++, Rust, Go, .NET native), Python C extensions and any wheel built from source, Node native addons (`node-gyp`, `npm rebuild`, packages shipping `.node`), and anything a package manager compiles rather than downloads prebuilt.
- **Architecture-neutral output**: shell and interpreted scripts, `.pyc` and JVM bytecode, static web bundles from `npm run build`, and data or configuration files.
- **Targeting the requested architecture**: the toolchain receives the target from `TARGETARCH`/`TARGETPLATFORM` or an equivalent — `GOARCH=$TARGETARCH`, Rust `--target`, .NET `-r`, `pip install --platform … --only-binary` — or the package manager installs a prebuilt binary for the target, such as a `manylinux`/`musllinux` aarch64 wheel. `TARGETARCH` and `TARGETPLATFORM` are automatic build arguments, so each consuming stage must re-declare them with its own `ARG TARGETARCH`; a stage that references one without declaring it gets an empty value and silently targets the builder. Declaring a fallback default (`ARG TARGETARCH=amd64`) is still correct, because the value BuildKit supplies for the requested platform takes precedence over the default. What does NOT target the request is a hardcoded architecture (`GOARCH=arm64`, `--target=aarch64-…`), which forces one architecture always.

An artifact is safe when it is architecture-neutral, or when it is architecture-specific and correctly targeted. The canonical correct pattern satisfies both: `FROM --platform=$BUILDPLATFORM golang AS build` compiling with `GOARCH=$TARGETARCH`, copied into an unpinned final stage. That build stage is pinned, but it targets the requested architecture, so the artifact is correct — a pinned build stage is not by itself a problem.

A `RUN` in an UNPINNED stage would execute inside a container of the requested platform, so whatever it compiles or installs is target-architecture by construction and satisfies B without needing `TARGETARCH`. That establishes artifact correctness only when the stage can execute; apply C separately.

`COPY --from` an external image rather than a stage (`COPY --from=golang:1.22`) is safe when that image publishes the requested platform, and fixes the artifact when it is single-arch or digest-pinned to one platform.

**C. Every `RUN` can execute on the builder for the requested platform.**

The builder is `linux/amd64` and has no QEMU/binfmt emulation. A `RUN` is executable when its stage uses `FROM --platform=$BUILDPLATFORM` or is otherwise fixed to `linux/amd64`. A `RUN` in a plain unpinned stage or a `$TARGETPLATFORM` stage requires the builder to execute target-platform binaries, so it is not buildable for `linux/arm64` even if its output would satisfy B. This includes ordinary single-stage images that run `yarn install`, `pip install`, `apt-get`, or any other command. Pin such images to `linux/amd64`; otherwise their arm64 build fails with `exec format error`.

Verdict:

- **A, B, and C hold for both default platforms** — omit `build.platforms` and keep the multi-arch default.
- **Any test fails, and the image can still be built for `linux/amd64`** — set `build.platforms: ['linux/amd64']`. Report which images were pinned, why, and that a pinned image will not run on an arm64 cluster until its Dockerfile cross-compiles. Do NOT pin silently.
- **The image is fixed to an architecture other than the builder's** — a final stage pinned to `linux/arm64`, or a hardcoded non-amd64 target — then `linux/amd64` is not buildable either. Do not emit a platform the Dockerfile cannot honor; report the packaging gap.
- **The Dockerfile cannot be read** at the modeled commit — report that the decision could not be made rather than guessing.

Do not infer from the language alone. Go is not automatically safe (`CGO_ENABLED=1` against a C dependency is not), and Python is not automatically unsafe (a pure-Python service, or one whose dependencies ship target wheels, cross-builds fine).

**Pattern** / **Verdict**

- `FROM --platform=$BUILDPLATFORM` build stage, `GOARCH=$TARGETARCH`, unpinned distroless final: Omit — pinned build stage, correctly targeted artifact
- Wheels built with `g++` in a `$BUILDPLATFORM` stage, final stage `FROM base` inheriting it: `['linux/amd64']` — A fails
- `node-gyp` addons compiled in a build stage, copied into unpinned `alpine`: `['linux/amd64']` — B fails
- `npm run build` static bundle from a `$BUILDPLATFORM` stage, copied into `nginx`: Omit — artifact is architecture-neutral
- Single unpinned stage running `yarn install` or `pip install`: `['linux/amd64']` — C fails without target-platform emulation
- `FROM --platform=$TARGETPLATFORM` final stage: Not a pin; judge on B and C
- `pip install --platform manylinux2014_aarch64 --only-binary=:all:` in a build-platform stage: Omit — executable build stage installs a prebuilt target wheel
- Rust `cargo build --target=<triple derived from TARGETARCH>` in a build-platform stage: Omit — executable stage produces correctly targeted output
- Final stage `FROM --platform=linux/arm64`: Report packaging gap — `linux/amd64` is not buildable either

## Output rules

- Apart from the exact two-line `radius-ghcr-registry-creds` warning required above, do NOT include comments explaining skill rules in generated Bicep
- Do NOT set readOnly properties
- Reference read-only outputs only when the exact schema declares the value and the exact target Recipe maps it
- Do NOT add `@description` decorators unless the user asks for them
