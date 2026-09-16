# Naming Conventions

| Element                              | Convention                                  | Example                               |
|--------------------------------------|---------------------------------------------|---------------------------------------|
| Bicep symbolic name                  | camelCase, descriptive                      | `todoApp`, `mysqlDb`, `todoContainer` |
| Data store symbolic name             | `<engine>` + role suffix, camelCase         | `mysqlDb`, `postgresDb`, `redisCache` |
| Secret symbolic name                 | `<engine>Secret` or `appSecrets`, camelCase | `appSecrets`                          |
| Resource `name` property             | kebab-case, matches app/repo name           | `'todo-list-app'`, `'my-database'`    |
| Connection keys                      | lowercase, engine + role                    | `mysqldb`, `postgresdb`, `rediscache` |
| Application name                     | kebab-case, matches repository name         | `'todo-list-app'`                     |
| Container keys (in `containers` map) | camelCase, describes the container role     | `todo`, `frontend`, `api`             |
| Port keys (in `ports` map)           | camelCase, describes the protocol/use       | `web`, `http`, `grpc`                 |
| Volume keys (in `volumes` map)       | camelCase, describes the data               | `data`, `cache`, `secrets`            |

## Rules

- Bicep symbolic names (left side of `=`) are always camelCase
- Resource `name` properties (string values) are always kebab-case
- Map keys inside `containers`, `ports`, and `volumes` are camelCase; `connections` keys are lowercase (engine + role)
- Never use spaces, underscores, or special characters in any name
- Explicit deployment-contract names and parameters take precedence over defaults. Preserve a documented resource-name parameter when a target Environment Recipe or verification couples it to a provider resource with naming or uniqueness constraints.

## Deterministic output

Two runs over the same source, generator version, schema, and Recipe contract must produce byte-identical `app.bicep`.

- Order declarations as extensions, parameters, the application, backing services, Secrets, container images, containers, then routes.
- Order parameters and same-type resources by their authored `name` using ASCII ordering, except where a declaration must follow a referenced resource.
- Put `name` before `properties`. Order keys chosen by the generator inside `env`, `ports`, `containers`, `connections`, and similar maps with ASCII ordering.
- Do not emit timestamps, random values, temporary paths, local absolute paths, or generator-machine environment values. Pin revision-derived values to the modeled commit or explicit immutable tag.
- Use two-space indentation, single-quoted strings, one trailing newline, no trailing whitespace, and no repeated blank lines.
- Preserve explicit profile-required resource, relationship, parameter, and app-native configuration names even when they differ from these defaults.
