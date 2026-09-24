import assert from "node:assert/strict";
import test from "node:test";
import { viewFromSearchParams, viewRouteChange } from "../src/shared/presentation/view-route";

test("view route reads exactly one allowed value", () => {
  const allowed = ["all", "mine", "created"] as const;
  assert.equal(
    viewFromSearchParams(new URLSearchParams("issueView=mine"), "issueView", allowed, "all"),
    "mine",
  );
  assert.equal(
    viewFromSearchParams(new URLSearchParams("issueView=bad"), "issueView", allowed, "all"),
    "all",
  );
  assert.equal(
    viewFromSearchParams(
      new URLSearchParams("issueView=mine&issueView=mine"),
      "issueView",
      allowed,
      "all",
    ),
    "all",
  );
});

test("view route change normalizes same view with replace and real switches with push", () => {
  assert.deepEqual(
    viewRouteChange({
      href: "https://example.com/repositories?issueView=bad#top",
      name: "issueView",
      next: "all",
      current: "all",
      fallback: "all",
    }),
    { href: "/repositories?issueView=all#top", action: "replaceState" },
  );
  assert.deepEqual(
    viewRouteChange({
      href: "https://example.com/repositories?issueView=all",
      name: "issueView",
      next: "mine",
      current: "all",
      fallback: "all",
    }),
    { href: "/repositories?issueView=mine", action: "pushState" },
  );
  assert.equal(
    viewRouteChange({
      href: "https://example.com/repositories?issueView=mine",
      name: "issueView",
      next: "mine",
      current: "mine",
      fallback: "all",
    }),
    null,
  );
});

test("view route can remove legacy parameters and omit fallback values", () => {
  assert.deepEqual(
    viewRouteChange({
      href: "https://example.com/repositories?legacy=1&issueView=mine",
      name: "issueView",
      next: "all",
      current: "all",
      fallback: "all",
      clear: ["legacy"],
      omitFallback: true,
    }),
    { href: "/repositories", action: "replaceState" },
  );
});
