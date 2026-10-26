const scopedIdentifierAuthority = "scoped-identifiers-v1";

const authorityRelations = [
  "namespace_binding_history",
  "namespace_bindings",
  "namespace_claims",
  "number_allocations",
  "number_series",
  "scoped_identifier_authority",
];

const legacyRelations = [
  "account_logins",
  "accounts",
  "discussion_categories",
  "discussions",
  "enterprise_teams",
  "enterprises",
  "issue_types",
  "issues",
  "organizations",
  "project_field_options",
  "project_fields",
  "project_views",
  "projects",
  "repositories",
  "repository_labels",
  "repository_milestones",
  "repository_name_history",
  "teams",
];

const summaryKeys = [
  "numberSeries",
  "numberAllocations",
  "namespaceBindings",
  "namespaceClaims",
  "namespaceHistory",
];

export const identifierAuthorityCatalogSql = `
select
  ${authorityRelations
    .map((relation) => `to_regclass('app_private.${relation}') is not null as ${relation}_exists`)
    .join(",\n  ")},
  to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)') is not null
    as cutover_function_exists,
  to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)') is not null
    as runtime_activation_function_exists,
  case
    when exists(select 1 from pg_roles where rolname='line_app')
      and to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)') is not null
    then has_function_privilege(
      'line_app',
      to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)'),
      'EXECUTE'
    )
    else false
  end as line_app_cutover_execute,
  case
    when to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)') is not null
    then has_function_privilege(
      'anon',
      to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)'),
      'EXECUTE'
    )
    else false
  end as anon_cutover_execute,
  case
    when to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)') is not null
    then has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)'),
      'EXECUTE'
    )
    else false
  end as authenticated_cutover_execute,
  coalesce((
    select not p.prosecdef and r.rolname<>'line_app'
    from pg_proc p
    join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure('app_private.cutover_scoped_identifiers(text,bigint)')
  ),false) as cutover_operator_owned,
  case
    when exists(select 1 from pg_roles where rolname='line_app')
      and to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)') is not null
    then has_function_privilege(
      'line_app',
      to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)'),
      'EXECUTE'
    )
    else false
  end as line_app_runtime_activation_execute,
  case
    when to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)') is not null
    then has_function_privilege(
      'anon',
      to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)'),
      'EXECUTE'
    )
    else false
  end as anon_runtime_activation_execute,
  case
    when to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)') is not null
    then has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)'),
      'EXECUTE'
    )
    else false
  end as authenticated_runtime_activation_execute,
  coalesce((
    select not p.prosecdef and r.rolname<>'line_app'
    from pg_proc p
    join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure('app_private.activate_scoped_identifier_runtime(text,bigint)')
  ),false) as runtime_activation_operator_owned;
`;

export const identifierAuthorityMarkerSql = `
select
  authority,
  revision,
  activated_at,
  summary,
  runtime_ready,
  runtime_revision,
  runtime_activated_at
from app_private.scoped_identifier_authority
where authority='${scopedIdentifierAuthority}';
`;

export const identifierAuthorityCountsSql = `
select
  (select count(*)::bigint from app_private.number_series)::text as number_series,
  (select count(*)::bigint from app_private.number_allocations)::text as number_allocations,
  (select count(*)::bigint from app_private.namespace_bindings)::text as namespace_bindings,
  (select count(*)::bigint from app_private.namespace_claims)::text as namespace_claims,
  (select count(*)::bigint from app_private.namespace_binding_history)::text
    as namespace_history;
`;

export function classifyIdentifierAuthorityState(state, { allowRegistryOnly = false } = {}) {
  const objectFlags = [
    ...authorityRelations.map((relation) => state[`${relation}_exists`]),
    state.cutover_function_exists,
    state.runtime_activation_function_exists,
  ];
  if (objectFlags.some((value) => typeof value !== "boolean")) {
    throw new Error("Scoped identifier authority catalog readback is incomplete.");
  }

  const existingObjects = objectFlags.filter(Boolean).length;
  if (existingObjects === 0) return "cutover-required";
  if (
    allowRegistryOnly &&
    existingObjects === 1 &&
    state.scoped_identifier_authority_exists === true
  ) {
    return "cutover-required";
  }
  if (existingObjects !== objectFlags.length) {
    throw new Error(
      "Scoped identifier authority is partially deployed; refusing an automatic cutover.",
    );
  }
  return "marker-readback-required";
}

export function assertIdentifierAuthorityMarker(marker) {
  if (!marker || marker.authority !== scopedIdentifierAuthority) {
    throw new Error("Scoped identifier authority activation marker is missing.");
  }
  assertIdentifierCutoverRevision(marker.revision);
  const activatedAt = Number(marker.activated_at);
  if (!Number.isSafeInteger(activatedAt) || activatedAt < 0) {
    throw new Error("Scoped identifier authority activation timestamp is invalid.");
  }
  if (!marker.summary || typeof marker.summary !== "object" || Array.isArray(marker.summary)) {
    throw new Error("Scoped identifier authority activation summary is invalid.");
  }
  for (const key of summaryKeys) {
    const count = marker.summary[key];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Scoped identifier authority activation summary ${key} is invalid.`);
    }
  }
  const knownCollisions = marker.summary.knownProjectViewHistoryCollisions;
  if (
    knownCollisions !== undefined &&
    (!Number.isSafeInteger(knownCollisions) || knownCollisions < 0)
  ) {
    throw new Error(
      "Scoped identifier authority activation summary knownProjectViewHistoryCollisions is invalid.",
    );
  }
  if (typeof marker.runtime_ready !== "boolean") {
    throw new Error("Scoped identifier authority runtime readiness is invalid.");
  }
  let runtimeRevision = null;
  let runtimeActivatedAt = null;
  if (marker.runtime_ready) {
    runtimeRevision = assertIdentifierCutoverRevision(marker.runtime_revision);
    runtimeActivatedAt = Number(marker.runtime_activated_at);
    if (!Number.isSafeInteger(runtimeActivatedAt) || runtimeActivatedAt < activatedAt) {
      throw new Error("Scoped identifier authority runtime activation timestamp is invalid.");
    }
  } else if (marker.runtime_revision !== null || marker.runtime_activated_at !== null) {
    throw new Error(
      "Frozen scoped identifier authority has unexpected runtime activation metadata.",
    );
  }
  return {
    authority: marker.authority,
    revision: marker.revision,
    activatedAt,
    runtimeReady: marker.runtime_ready,
    runtimeRevision,
    runtimeActivatedAt,
    summary: {
      ...Object.fromEntries(summaryKeys.map((key) => [key, marker.summary[key]])),
      ...(knownCollisions === undefined
        ? {}
        : { knownProjectViewHistoryCollisions: knownCollisions }),
    },
  };
}

export function assertIdentifierAuthorityCounts(row) {
  if (!row) throw new Error("Scoped identifier authority count readback is missing.");
  const counts = {};
  for (const key of [
    "number_series",
    "number_allocations",
    "namespace_bindings",
    "namespace_claims",
    "namespace_history",
  ]) {
    if (typeof row[key] !== "string" || !/^\d+$/.test(row[key])) {
      throw new Error(`Scoped identifier authority count ${key} is invalid.`);
    }
    const value = Number(row[key]);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Scoped identifier authority count ${key} is outside the safe range.`);
    }
    counts[key] = value;
  }
  return counts;
}

export function assertIdentifierCutoverRevision(revision) {
  if (typeof revision !== "string" || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("Scoped identifier cutover requires the exact lowercase Git commit SHA.");
  }
  return revision;
}

export function identifierCutoverPreludeSql() {
  const relations = legacyRelations.map((relation) => `'app_private.${relation}'`).join(",");
  return `
select app_private.lock_governance('exclusive');
do $identifier_lock$
declare
  relation_name text;
begin
  for relation_name in
    select candidate
    from unnest(array[${relations}]) as names(candidate)
    where to_regclass(candidate) is not null
    order by candidate
  loop
    execute format('lock table %s in share row exclusive mode', relation_name::regclass);
  end loop;
end
$identifier_lock$;
`;
}

export function identifierCutoverInvocationSql(revision) {
  assertIdentifierCutoverRevision(revision);
  return `
select app_private.cutover_scoped_identifiers(
  '${revision}',
  floor(extract(epoch from transaction_timestamp()) * 1000)::bigint
);
`;
}

export function identifierRuntimeActivationInvocationSql(revision) {
  assertIdentifierCutoverRevision(revision);
  return `
select app_private.activate_scoped_identifier_runtime(
  '${revision}',
  floor(extract(epoch from transaction_timestamp()) * 1000)::bigint
);
`;
}

export function identifierRuntimeActivationTransactionSql(revision) {
  return `BEGIN;\n${identifierRuntimeActivationInvocationSql(revision)}\nCOMMIT;\n`;
}

export function identifierCutoverTransactionSql({ ddl, revision, freezeLegacy }) {
  if (typeof ddl !== "string" || ddl.trim().length === 0) {
    throw new Error("Scoped identifier cutover requires the introducing DDL.");
  }
  return `BEGIN;\n${freezeLegacy ? identifierCutoverPreludeSql() : ""}\n${ddl}\n${identifierCutoverInvocationSql(revision)}\nCOMMIT;\n`;
}
