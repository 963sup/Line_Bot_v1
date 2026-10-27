import fs from "node:fs";
import path from "node:path";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const arrayFields = new Set([
  "boundedContexts",
  "concepts",
  "relationships",
  "capabilities",
  "locators",
  "invariants",
  "subdomains",
  "sharedBoundedContexts",
  "preserves",
  "consumes",
  "members",
  "participants",
  "allowedWorkspaceDependencies",
  "dependsOn",
  "files",
  "relations",
]);
const recordArrays = new Set([
  "boundedContexts",
  "concepts",
  "relationships",
  "capabilities",
  "locators",
  "invariants",
  "subdomains",
  "sharedBoundedContexts",
  "files",
  "relations",
]);
function normalize(value, label, errors) {
  for (const [key, child] of Object.entries(value)) {
    if (
      arrayFields.has(key) &&
      !(key === "invariants" && label === "architecture/modules/configuration.json") &&
      !Array.isArray(child)
    ) {
      errors.push(`${label}.${key}: expected array`);
      value[key] = [];
    } else if (Array.isArray(child)) {
      value[key] = child.filter((item) => {
        if (item === null) {
          errors.push(`${label}.${key}: null array entry`);
          return false;
        }
        if (recordArrays.has(key) && !object(item)) {
          errors.push(`${label}.${key}: expected object array entry`);
          return false;
        }
        return true;
      });
      for (const item of value[key]) if (object(item)) normalize(item, `${label}.${key}`, errors);
    } else if (object(child)) normalize(child, `${label}.${key}`, errors);
  }
}
function registrySections(registry, errors, modulesOnly = false) {
  for (const section of modulesOnly ? ["modules"] : ["domain", "modules", "data"]) {
    if (!object(registry[section])) {
      errors.push(`registry.${section}: required object`);
      registry[section] = {};
    }
    const map = section === "modules" ? "entries" : "owners";
    if (!object(registry[section][map])) {
      errors.push(`registry.${section}.${map}: required map`);
      registry[section][map] = {};
    }
    for (const key of section === "domain"
      ? ["vocabulary"]
      : section === "modules"
        ? ["configuration"]
        : ["configuration", "shared"]) {
      if (typeof registry[section][key] !== "string")
        errors.push(`registry.${section}.${key}: required path string`);
    }
  }
}

function reader(root) {
  const errors = [],
    cache = new Map();
  let bytesRead = 0;
  const safe = (name) =>
    typeof name === "string" && !path.isAbsolute(name) && !name.split(/[\\/]/).includes("..");
  const read = (name) => {
    if (!safe(name)) {
      errors.push(`Unsafe architecture path: ${name}`);
      return {};
    }
    if (cache.has(name)) return cache.get(name);
    let value = {};
    try {
      const bytes = fs.readFileSync(path.join(root, name));
      bytesRead += bytes.length;
      value = JSON.parse(bytes);
      if (!object(value)) {
        errors.push(`${name}: JSON root must be an object`);
        value = {};
      }
      normalize(value, name, errors);
      if (value.schemaVersion !== 1) errors.push(`${name}: schemaVersion must be 1`);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
    cache.set(name, value);
    return value;
  };
  return { errors, read, safe, cache, stats: () => ({ filesRead: cache.size, bytesRead }) };
}

/** Read only the registry and registered module fragments. */
export function readModuleContracts(root) {
  const io = reader(root),
    registry = io.read("architecture/registry.json");
  registrySections(registry, io.errors, true);
  const modules = new Map(),
    paths = new Set(["architecture/registry.json"]);
  for (const [id, file] of Object.entries(registry.modules?.entries || {})) {
    if (paths.has(file)) io.errors.push(`Duplicate registration: ${file}`);
    paths.add(file);
    const module = io.read(file);
    if (module.id !== id) io.errors.push(`${file}: module id must be ${id}`);
    modules.set(id, module);
  }
  if (io.errors.length) throw new Error(io.errors.join("\n"));
  return modules;
}

export function checkArchitecture(root, { packages } = {}) {
  const io = reader(root),
    { errors, read } = io;
  const registry = read("architecture/registry.json");
  registrySections(registry, errors);
  for (const file of [
    "architecture/semantic-model.json",
    "architecture/implementation-topology.json",
    "architecture/data-topology.json",
  ]) {
    if (fs.existsSync(path.join(root, file)))
      errors.push(`Retired architecture authority restored: ${file}`);
  }
  const registered = new Set(["architecture/registry.json"]);
  const register = (file) => {
    if (registered.has(file)) errors.push(`Duplicate registration: ${file}`);
    registered.add(file);
    return read(file);
  };
  const vocabulary = register(registry.domain?.vocabulary);
  const owners = new Map(),
    modules = new Map(),
    records = {};
  const locatorShards = new Map();
  for (const kind of ["boundedContexts", "concepts", "relationships", "capabilities", "locators"])
    records[kind] = new Map();
  for (const [id, file] of Object.entries(registry.domain?.owners || {})) {
    const fragment = register(file);
    owners.set(id, fragment);
    if (fragment.owner?.id !== id) errors.push(`${file}: owner id must be ${id}`);
    for (const [kind, map] of Object.entries(records))
      for (const record of fragment[kind] || []) {
        if (!record.id || map.has(record.id))
          errors.push(`${file}: duplicate or missing ${kind} id ${record.id}`);
        map.set(record.id, record);
        if (kind === "locators") locatorShards.set(record.id, id);
        if (
          kind === "relationships"
            ? record.provider !== id
            : record.owner !== undefined && record.owner !== id
        )
          errors.push(`${file}: ${kind} ${record.id} ownership differs from ${id}`);
      }
  }
  const ref = (map, value, label) => {
    if (!map.has(value)) errors.push(`${label}: unknown reference ${value}`);
  };
  for (const r of records.relationships.values())
    for (const field of ["provider", "consumer", "authority"])
      ref(owners, r[field], `relationship ${r.id} ${field}`);
  const invariants = new Map((vocabulary.invariants || []).map((x) => [x.id, x]));
  for (const c of records.capabilities.values()) {
    for (const id of c.preserves || []) ref(invariants, id, `capability ${c.id} preserves`);
    for (const id of c.consumes || [])
      ref(records.relationships, id, `capability ${c.id} consumes`);
    for (const id of c.members || []) ref(records.capabilities, id, `capability ${c.id} members`);
  }
  for (const l of records.locators.values()) {
    ref(records.concepts, l.concept, `locator ${l.id} concept`);
    const conceptOwner = records.concepts.get(l.concept)?.owner;
    const shard = locatorShards.get(l.id);
    if (conceptOwner && conceptOwner !== shard)
      errors.push(`locator ${l.id}: concept owner ${conceptOwner} differs from shard ${shard}`);
    if (l.scopeAuthority) ref(owners, l.scopeAuthority, `locator ${l.id} scopeAuthority`);
  }
  const contextIds = new Set(records.boundedContexts.keys());
  for (const context of vocabulary.sharedBoundedContexts || []) {
    if (!context.id || contextIds.has(context.id))
      errors.push(`Duplicate bounded context id: ${context.id}`);
    contextIds.add(context.id);
  }
  for (const context of [
    ...(vocabulary.sharedBoundedContexts || []),
    ...(vocabulary.subdomains || []),
  ]) {
    if (!Array.isArray(context.owners)) {
      errors.push(`${context.id}: owners must be an array`);
      continue;
    }
    for (const owner of context.owners) ref(owners, owner, `${context.id} owner`);
  }
  register(registry.modules?.configuration);
  for (const [id, file] of Object.entries(registry.modules?.entries || {})) {
    const module = register(file);
    modules.set(id, module);
    if (module.id !== id) errors.push(`${file}: module id must be ${id}`);
    if (!["current", "application", "target"].includes(module.status))
      errors.push(`${file}: invalid module status ${module.status}`);
    if (module.semanticOwner) ref(owners, module.semanticOwner, `module ${id} semanticOwner`);
    if (
      module.primaryOwnerImplementation !== undefined &&
      typeof module.primaryOwnerImplementation !== "boolean"
    )
      errors.push(`${file}: primaryOwnerImplementation must be boolean`);
  }
  for (const [id, module] of modules) {
    const declared =
      module.status === "target"
        ? module.dependsOn || []
        : module.allowedWorkspaceDependencies || [];
    for (const dependency of declared) {
      ref(modules, dependency, `module ${id} dependency`);
      if (module.status !== "target" && modules.get(dependency)?.status === "target")
        errors.push(`module ${id}: current dependency ${dependency} is target-only`);
    }
    if (!packages) continue;
    const actual = packages.get(id);
    if (!actual) {
      if (module.status !== "target") errors.push(`module ${id}: missing workspace manifest`);
      continue;
    }
    if (module.status === "target")
      errors.push(`module ${id}: target-only module has an actual workspace manifest`);
    const actualPath = path.relative(root, actual.path).split(path.sep).join("/");
    if (actualPath !== `${module.path}/package.json`)
      errors.push(
        `module ${id}: manifest path ${actualPath} differs from ${module.path}/package.json`,
      );
    const deps = new Set(
      Object.entries({
        ...actual.manifest.dependencies,
        ...actual.manifest.devDependencies,
        ...actual.manifest.optionalDependencies,
        ...actual.manifest.peerDependencies,
      })
        .filter(([name, version]) => modules.has(name) || String(version).startsWith("workspace:"))
        .map(([name]) => name),
    );
    for (const dep of deps)
      if (!declared.includes(dep))
        errors.push(`module ${id}: undeclared workspace dependency ${dep}`);
    for (const dep of declared)
      if (!deps.has(dep))
        errors.push(`module ${id}: declared dependency ${dep} missing from manifest`);
  }
  for (const owner of owners.keys()) {
    const primary = [...modules.values()].filter(
      (module) => module.semanticOwner === owner && module.primaryOwnerImplementation === true,
    );
    if (primary.length !== 1)
      errors.push(
        `owner ${owner}: expected one primaryOwnerImplementation, found ${primary.length}`,
      );
  }
  if (packages)
    for (const [id, actual] of packages) {
      if (path.resolve(root, actual.path) === path.join(path.resolve(root), "package.json"))
        continue;
      if (!modules.has(id)) errors.push(`workspace package ${id}: missing module registration`);
    }
  for (const [id, module] of modules) {
    if (module.status === "application" && module.semanticOwner != null)
      errors.push(`module ${id}: application host must not claim a semanticOwner`);
    if (module.primaryOwnerImplementation && !module.semanticOwner)
      errors.push(`module ${id}: primaryOwnerImplementation requires semanticOwner`);
  }
  const configuration = register(registry.data?.configuration);
  const data = [
    { file: registry.data?.shared, value: register(registry.data?.shared), shared: true },
  ];
  for (const [owner, file] of Object.entries(registry.data?.owners || {})) {
    const value = register(file);
    ref(owners, owner, `data ${file} owner`);
    if (value.owner !== owner) errors.push(`${file}: data owner must be ${owner}`);
    data.push({ file, value, owner });
  }
  const files = new Map(),
    relations = new Map();
  for (const fragment of data) {
    for (const file of fragment.value.files || []) {
      if (files.has(file.path)) errors.push(`Duplicate SQL file: ${file.path}`);
      files.set(file.path, { ...file, fragmentOwner: fragment.owner });
      if (file.mechanismOwner && file.mechanismOwner !== fragment.owner)
        errors.push(`${file.path}: mechanism owner differs from data fragment`);
    }
    for (const relation of fragment.value.relations || []) {
      if (relations.has(relation.name)) errors.push(`Duplicate relation: ${relation.name}`);
      relations.set(relation.name, relation);
      if (fragment.shared && relation.authority !== false)
        errors.push(`${relation.name}: shared relation must have authority false`);
      if (relation.semanticOwner) {
        ref(owners, relation.semanticOwner, `relation ${relation.name} semanticOwner`);
        if (relation.semanticOwner !== fragment.owner)
          errors.push(`${relation.name}: semantic owner differs from data fragment`);
      } else if (relation.authority)
        errors.push(`${relation.name}: authoritative relation missing semanticOwner`);
      if (relation.concept) {
        ref(records.concepts, relation.concept, `relation ${relation.name} concept`);
        const concept = records.concepts.get(relation.concept);
        if (concept && relation.semanticOwner !== concept.owner)
          errors.push(`${relation.name}: concept owner mismatch`);
      }
      for (const owner of relation.participants || [])
        ref(owners, owner, `relation ${relation.name} participant`);
    }
  }
  for (const relation of relations.values())
    if (!files.has(relation.path))
      errors.push(`${relation.name}: undeclared SQL file ${relation.path}`);
  for (const file of files.values()) {
    if (!io.safe(file.path) || !fs.existsSync(path.join(root, file.path)))
      errors.push(`Missing or unsafe SQL file: ${file.path}`);
    if (!file.mechanismOwner && file.fragmentOwner) {
      const sourceOwners = new Set(
        [...relations.values()]
          .filter((r) => r.path === file.path && r.semanticOwner)
          .map((r) => r.semanticOwner),
      );
      if (sourceOwners.size !== 1 || !sourceOwners.has(file.fragmentOwner))
        errors.push(`${file.path}: file owner is not the unique relation semanticOwner`);
    }
  }
  for (const concept of records.concepts.values())
    if (
      concept.persistenceExpectation === "relation" &&
      ![...relations.values()].some((r) => r.concept === concept.id && r.authority)
    )
      errors.push(`concept ${concept.id}: missing authoritative relation`);
  if (io.safe(configuration.schemaRoot)) {
    try {
      const sql = fs
        .readdirSync(path.join(root, configuration.schemaRoot))
        .filter((f) => f.endsWith(".sql"));
      for (const name of sql)
        if (!files.has(`${configuration.schemaRoot}/${name}`))
          errors.push(`Unregistered SQL file: ${name}`);
      for (const name of files.keys())
        if (typeof name !== "string" || !name.startsWith(`${configuration.schemaRoot}/`))
          errors.push(`SQL file outside schemaRoot: ${name}`);
    } catch (error) {
      errors.push(`schemaRoot: ${error.message}`);
    }
  } else errors.push("Missing or unsafe schemaRoot");
  const scan = (directory) => {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`;
      if (entry.isDirectory()) scan(name);
      else if (entry.name.endsWith(".json") && !registered.has(name))
        errors.push(`Unregistered architecture JSON: ${name}`);
    }
  };
  for (const directory of [
    "architecture/domain/owners",
    "architecture/modules",
    "architecture/data",
  ])
    scan(directory);
  return {
    errors,
    counts: {
      owners: owners.size,
      modules: modules.size,
      contexts: records.boundedContexts.size + (vocabulary.sharedBoundedContexts || []).length,
      concepts: records.concepts.size,
      relationships: records.relationships.size,
      capabilities: records.capabilities.size,
      locators: records.locators.size,
      files: files.size,
      relations: relations.size,
    },
    ...io.stats(),
  };
}
