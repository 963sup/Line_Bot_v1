import { isReservedRootNamespaceKey } from "./root.js";

type NamespaceRouteKind = "resource" | "projection" | "collection";
type NamespaceRouteState = "active" | "planned";

type NamespaceRoute = Readonly<{
  id: string;
  pathTemplate: `/${string}`;
  scope: string;
  locatorOwner: string | null;
  subjects?: readonly string[];
  kind: NamespaceRouteKind;
  state: NamespaceRouteState;
}>;

/**
 * Structured route-locator topology. This describes URL ownership and availability only; it does
 * not resolve identity, grant access, or move owner-local naming policy into Namespace.
 */
export const NAMESPACE_ROUTES = [
  {
    id: "account",
    pathTemplate: "/{login}",
    scope: "global-account-login",
    locatorOwner: "namespace",
    subjects: ["user", "organization"],
    kind: "resource",
    state: "active",
  },
  {
    id: "repository",
    pathTemplate: "/{login}/{repository}",
    scope: "account-repository",
    locatorOwner: "repository",
    kind: "resource",
    state: "active",
  },
  {
    id: "repository-issues",
    pathTemplate: "/{login}/{repository}/issues",
    scope: "repository",
    locatorOwner: "repository",
    kind: "collection",
    state: "active",
  },
  {
    id: "repository-issue",
    pathTemplate: "/{login}/{repository}/issues/{issueNumber}",
    scope: "repository",
    locatorOwner: "repository",
    kind: "resource",
    state: "active",
  },
  {
    id: "repository-pulls",
    pathTemplate: "/{login}/{repository}/pull",
    scope: "repository",
    locatorOwner: null,
    kind: "collection",
    state: "planned",
  },
  {
    id: "repository-pull",
    pathTemplate: "/{login}/{repository}/pull/{pullNumber}",
    scope: "repository",
    locatorOwner: null,
    kind: "resource",
    state: "planned",
  },
  {
    id: "repository-discussions",
    pathTemplate: "/{login}/{repository}/discussions",
    scope: "repository",
    locatorOwner: "repository",
    kind: "collection",
    state: "active",
  },
  {
    id: "repository-discussion-id",
    pathTemplate: "/{login}/{repository}/discussions/{discussionId}",
    scope: "repository",
    locatorOwner: "repository",
    kind: "resource",
    state: "active",
  },
  {
    id: "repository-discussion",
    pathTemplate: "/{login}/{repository}/discussions/{discussionNumber}",
    scope: "repository",
    locatorOwner: null,
    kind: "resource",
    state: "planned",
  },
  {
    id: "organization-team",
    pathTemplate: "/orgs/{organization}/teams/{teamSlug}",
    scope: "organization",
    locatorOwner: "team",
    kind: "resource",
    state: "active",
  },
  {
    id: "organization-project",
    pathTemplate: "/orgs/{organization}/projects/{projectNumber}",
    scope: "organization",
    locatorOwner: null,
    kind: "resource",
    state: "planned",
  },
  {
    id: "organization-people",
    pathTemplate: "/orgs/{organization}/people",
    scope: "organization",
    locatorOwner: null,
    kind: "collection",
    state: "planned",
  },
  {
    id: "organization-repositories",
    pathTemplate: "/orgs/{organization}/repositories",
    scope: "organization",
    locatorOwner: null,
    kind: "collection",
    state: "planned",
  },
  {
    id: "organization-packages",
    pathTemplate: "/orgs/{organization}/packages",
    scope: "organization",
    locatorOwner: null,
    kind: "collection",
    state: "planned",
  },
  {
    id: "organization-discussion",
    pathTemplate: "/orgs/{organization}/discussions/{discussionNumber}",
    scope: "organization",
    locatorOwner: null,
    kind: "resource",
    state: "planned",
  },
  {
    id: "enterprise",
    pathTemplate: "/enterprises/{enterpriseSlug}",
    scope: "enterprise",
    locatorOwner: "enterprise",
    kind: "resource",
    state: "active",
  },
  {
    id: "sponsors-account",
    pathTemplate: "/sponsors/{account}",
    scope: "account",
    locatorOwner: null,
    kind: "projection",
    state: "planned",
  },
  {
    id: "settings",
    pathTemplate: "/settings",
    scope: "current-account",
    locatorOwner: "account",
    kind: "projection",
    state: "active",
  },
  {
    id: "settings-account",
    pathTemplate: "/settings/account",
    scope: "current-account",
    locatorOwner: "account",
    kind: "projection",
    state: "active",
  },
  {
    id: "settings-profile",
    pathTemplate: "/settings/profile",
    scope: "current-account",
    locatorOwner: "account",
    kind: "projection",
    state: "active",
  },
  {
    id: "settings-network",
    pathTemplate: "/settings/network",
    scope: "current-account",
    locatorOwner: "account",
    kind: "projection",
    state: "active",
  },
  {
    id: "settings-permissions",
    pathTemplate: "/settings/permissions",
    scope: "current-account",
    locatorOwner: "identity-access",
    kind: "projection",
    state: "active",
  },
  {
    id: "notifications",
    pathTemplate: "/notifications",
    scope: "current-account",
    locatorOwner: "notifications",
    kind: "collection",
    state: "active",
  },
  {
    id: "stars",
    pathTemplate: "/stars",
    scope: "current-account",
    locatorOwner: "repository",
    kind: "collection",
    state: "active",
  },
  {
    id: "issues",
    pathTemplate: "/issues",
    scope: "current-account",
    locatorOwner: "repository",
    kind: "collection",
    state: "active",
  },
  {
    id: "pulls",
    pathTemplate: "/pulls",
    scope: "current-account",
    locatorOwner: null,
    kind: "collection",
    state: "planned",
  },
] as const satisfies readonly NamespaceRoute[];

type Route = (typeof NAMESPACE_ROUTES)[number];
type ActiveNamespaceRouteId = Extract<Route, { state: "active" }>["id"];

type RouteFor<Id extends ActiveNamespaceRouteId> = Extract<Route, { id: Id }>;
type ParameterNames<Path extends string> = Path extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParameterNames<Rest>
  : never;
type ParameterValue<Name extends string> = Name extends `${string}Number` ? number : string;

type NamespaceRouteParameters<Id extends ActiveNamespaceRouteId> = {
  [Name in ParameterNames<RouteFor<Id>["pathTemplate"]>]: ParameterValue<Name>;
};

type NoExtraParameters<Expected, Actual> = Actual &
  Record<Exclude<keyof Actual, keyof Expected>, never>;

type CompiledSegment = Readonly<{ literal: string } | { parameter: string }>;
type CompiledRoute = Readonly<{
  route: NamespaceRoute;
  segments: readonly CompiledSegment[];
  parameterNames: readonly string[];
}>;

const activeRoutes = new Map<string, CompiledRoute>(
  NAMESPACE_ROUTES.filter((route) => route.state === "active").map((route) => {
    const segments = route.pathTemplate
      .slice(1)
      .split("/")
      .map((segment): CompiledSegment => {
        const parameter = /^\{([^}]+)\}$/.exec(segment)?.[1];
        return parameter ? { parameter } : { literal: segment };
      });
    const parameterNames = segments.flatMap((segment) =>
      "parameter" in segment ? [segment.parameter] : [],
    );
    return [route.id, { route, segments, parameterNames }];
  }),
);

function validateRawParameter(name: string, value: unknown): string {
  if (name.endsWith("Number")) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
    return String(value);
  }

  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  if (value.length === 0 || value === "." || value === "..") {
    throw new TypeError(`${name} must be one non-empty path segment`);
  }
  return value;
}

export function buildNamespacePath<
  const Id extends ActiveNamespaceRouteId,
  const Parameters extends NamespaceRouteParameters<Id>,
>(routeId: Id, parameters: NoExtraParameters<NamespaceRouteParameters<Id>, Parameters>): string {
  const compiled = activeRoutes.get(routeId);
  if (!compiled) {
    throw new RangeError(`Namespace route ${routeId} is not active`);
  }

  const suppliedNames = Object.keys(parameters);
  const missingNames = compiled.parameterNames.filter((name) => !Object.hasOwn(parameters, name));
  const extraNames = suppliedNames.filter((name) => !compiled.parameterNames.includes(name));
  if (missingNames.length > 0 || extraNames.length > 0) {
    throw new TypeError(
      `Invalid parameters for ${routeId}; missing: ${missingNames.join(", ") || "none"}; extra: ${extraNames.join(", ") || "none"}`,
    );
  }

  return `/${compiled.segments
    .map((segment, index) => {
      if ("literal" in segment) return segment.literal;
      const value = parameters[segment.parameter as keyof Parameters];
      if (
        index === 0 &&
        segment.parameter === "login" &&
        typeof value === "string" &&
        isReservedRootNamespaceKey(value)
      ) {
        throw new RangeError(`${value} is reserved in the global root namespace`);
      }
      return encodeURIComponent(validateRawParameter(segment.parameter, value));
    })
    .join("/")}`;
}
