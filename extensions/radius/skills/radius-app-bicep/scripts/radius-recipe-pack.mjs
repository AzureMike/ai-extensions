const RESOURCE_TYPES_CONTRIB_REPOSITORY =
  "radius-project/resource-types-contrib";
const COMMIT = /^[0-9a-f]{40}$/iu;
const PREDEFINED_RESOURCE_TYPE =
  /^Radius(?:\.[A-Za-z][A-Za-z0-9]*)+\/[A-Za-z][A-Za-z0-9]*$/u;

export function parseAzureRecipePackPin(source) {
  if (typeof source !== "string") {
    throw new Error("Radius release defaults must be text.");
  }

  const entries = [];
  let recipePacksIndent;
  let current;
  let currentIndent;
  for (const line of source.replaceAll("\r\n", "\n").split("\n")) {
    if (recipePacksIndent === undefined) {
      const section = /^([ \t]*)recipePacks:\s*$/u.exec(line);
      if (section === null) continue;
      recipePacksIndent = section[1].length;
      continue;
    }
    const trimmed = line.trim();
    const indentation = /^[ \t]*/u.exec(line)[0].length;
    const nameMatch = /^([ \t]*)-\s+name:\s*(\S+)\s*$/u.exec(line);
    const indentationlessEntry =
      nameMatch !== null && indentation === recipePacksIndent;
    if (
      trimmed !== "" &&
      !trimmed.startsWith("#") &&
      indentation <= recipePacksIndent &&
      !indentationlessEntry
    ) {
      break;
    }

    const name = nameMatch?.[2];
    if (name !== undefined) {
      if (current !== undefined) entries.push(current);
      current = { name };
      currentIndent = nameMatch[1].length;
      continue;
    }
    if (current === undefined) continue;

    const field = /^([ \t]*)(repo|ref):\s*(\S+)\s*$/u.exec(line);
    if (field !== null && field[1].length > currentIndent) {
      const property = field[2] === "repo" ? "repository" : "commit";
      if (current[property] !== undefined) {
        throw new Error(
          'Radius release Recipe pack entry contains a duplicate "repo" or "ref" field.'
        );
      }
      current[property] = field[3];
    }
  }
  if (current !== undefined) entries.push(current);

  const azureEntries = entries.filter((entry) => entry.name === "azure");
  if (azureEntries.length !== 1) {
    throw new Error(
      azureEntries.length === 0 ?
        "Radius release defaults do not contain an Azure Recipe pack."
      : "Radius release defaults contain multiple Azure Recipe packs."
    );
  }
  const azure = azureEntries[0];
  const expectedRepository = `github.com/${RESOURCE_TYPES_CONTRIB_REPOSITORY}`;
  if (azure.repository !== expectedRepository) {
    throw new Error(
      `The Azure Recipe pack must come from ${expectedRepository}.`
    );
  }
  if (typeof azure.commit !== "string" || !COMMIT.test(azure.commit)) {
    throw new Error("The Azure Recipe pack ref must be a full commit SHA.");
  }
  return {
    repository: RESOURCE_TYPES_CONTRIB_REPOSITORY,
    commit: azure.commit.toLowerCase()
  };
}

export function extractRecipeDefinition(source, resourceType) {
  if (typeof source !== "string") {
    throw new Error("The Azure Recipe pack must be text.");
  }
  if (
    typeof resourceType !== "string" ||
    !PREDEFINED_RESOURCE_TYPE.test(resourceType) ||
    resourceType.startsWith("Radius.Resources/")
  ) {
    throw new Error(
      `Recipe lookup requires an exact predefined resource type, received "${resourceType}".`
    );
  }
  const escapedType = resourceType.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const starts = [
    ...source.matchAll(
      new RegExp(
        `^([ \\t]*)'${escapedType}'[ \\t]*:[ \\t]*\\{[ \\t]*(?:\\/\\/[^\\r\\n]*)?(?=\\r?$)`,
        "gmu"
      )
    )
  ];
  if (starts.length === 0) return undefined;
  if (starts.length > 1) {
    throw new Error(
      `The Azure Recipe pack contains multiple Recipe definitions for "${resourceType}".`
    );
  }

  const start = starts[0];
  const indentation = start[1].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const boundary = new RegExp(
    `^${indentation}(?:'Radius(?:\\.[A-Za-z][A-Za-z0-9]*)+\\/[A-Za-z][A-Za-z0-9]*'[ \\t]*:[ \\t]*\\{|\\})[ \\t]*(?:\\/\\/[^\\r\\n]*)?(?=\\r?$)`,
    "gmu"
  );
  boundary.lastIndex = start.index + start[0].length;
  const end = boundary.exec(source);
  if (end === null || end[0].trimStart().startsWith("'")) {
    throw new Error(
      `The Azure Recipe pack contains an incomplete Recipe definition for "${resourceType}".`
    );
  }
  return source.slice(start.index, end.index + end[0].length);
}

export function extractRecipeOutputPaths(definition) {
  if (typeof definition !== "string") {
    throw new Error("The Recipe definition must be text.");
  }
  const lines = definition.replaceAll("\r\n", "\n").split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([ \t]*)outputs[ \t]*:[ \t]*\{[ \t]*(?:\/\/.*)?$/u.exec(
      lines[index]
    );
    if (match !== null) starts.push({ index, indentation: match[1].length });
  }
  if (starts.length === 0) return undefined;
  if (starts.length > 1) {
    throw new Error("The Recipe definition contains multiple outputs blocks.");
  }

  const { index: start, indentation: outputIndentation } = starts[0];
  const parents = [];
  const paths = [];
  let closed = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    const indentation = /^[ \t]*/u.exec(line)[0].length;
    if (
      indentation === outputIndentation &&
      /^\}[ \t]*(?:\/\/.*)?$/u.test(trimmed)
    ) {
      closed = true;
      break;
    }
    if (indentation <= outputIndentation) break;

    const property =
      /^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_]*))[ \t]*:[ \t]*(.*)$/u.exec(
        trimmed
      );
    if (property === null) continue;
    while (
      parents.length > 0 &&
      indentation <= parents[parents.length - 1].indentation
    ) {
      parents.pop();
    }
    const name = (property[1] ?? property[2]).replaceAll("''", "'");
    paths.push([...parents.map((parent) => parent.name), name].join("."));
    if (/^\{(?:[ \t]*\/\/.*)?$/u.test(property[3])) {
      parents.push({ indentation, name });
    }
  }
  if (!closed) {
    throw new Error(
      "The Recipe definition contains an incomplete outputs block."
    );
  }
  return paths;
}

export function validateAzureRecipePack(source) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("The Azure Recipe pack must be non-empty text.");
  }
  if (
    !/^[ \t]*resource[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]+'Radius\.Core\/recipePacks@[A-Za-z0-9.-]+'[ \t]*=[ \t]*\{[ \t]*(?:\/\/[^\r\n]*)?(?=\r?$)/mu.test(
      source
    ) ||
    !/^[ \t]*recipes[ \t]*:[ \t]*\{[ \t]*(?:\/\/[^\r\n]*)?(?=\r?$)/mu.test(
      source
    ) ||
    !/^[ \t]+'Radius(?:\.[A-Za-z][A-Za-z0-9]*)+\/[A-Za-z][A-Za-z0-9]*'[ \t]*:[ \t]*\{[ \t]*(?:\/\/[^\r\n]*)?(?=\r?$)/mu.test(
      source
    )
  ) {
    throw new Error(
      "The Azure Recipe pack does not contain the expected Recipe-pack structure."
    );
  }
}
