import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fulfillLineSessionMock } from "./line-session-mock.mjs";

const require = createRequire(import.meta.url);
const load = process.env.PLAYWRIGHT_PACKAGE_PATH
  ? (name) => require(path.join(process.env.PLAYWRIGHT_PACKAGE_PATH, name))
  : require;
const { chromium } = load("playwright"),
  { expect } = load("playwright/test");
const target = new URL(process.env.NAVIGATION_BASE ?? "http://127.0.0.1:4117");
const noMapsKey = process.env.NAVIGATION_NO_MAPS_KEY === "1";
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
)
  throw new Error("Loopback origin required.");
const output = process.env.NAVIGATION_ARTIFACT_DIR;
if (output) mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.NAVIGATION_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await context.addInitScript(() => {
  window.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    getAccessToken: () => "synthetic",
    isInClient: () => false,
    login: () => {},
  };
});
if (output) await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage(),
  errors = [],
  posts = [],
  receipts = new Map();
let address = null,
  version = 1,
  actorUserId = "owner",
  capability = "admin",
  member = true,
  lose = false;
let mapsLoads = 0;
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.hostname === "maps.googleapis.com" && url.pathname === "/maps/api/js") {
    mapsLoads += 1;
    assert.equal(url.searchParams.get("key"), "synthetic-google-maps-browser-key");
    assert.equal(url.searchParams.get("auth_referrer_policy"), "origin");
    assert.equal(request.headers().referer, target.origin + "/");
    if (mapsLoads === 1) return route.abort("failed");
    const callback = url.searchParams.get("callback");
    return route.fulfill({
      contentType: "text/javascript",
      body: `
        (() => {
          const state = window.__syntheticMaps = { maps: [], circles: [], geocodes: [] };
          const point = value => ({ lat: () => value.lat, lng: () => value.lng });
          class Map {
            constructor(element, options) {
              this.element = element; this.center = options.center; this.listeners = {};
              element.dataset.mapReady = "true"; state.maps.push(this);
            }
            addListener(name, listener) {
              (this.listeners[name] ||= []).push(listener);
              return { remove: () => this.listeners[name] = (this.listeners[name] || []).filter(x => x !== listener) };
            }
            emit(name, event) { for (const listener of this.listeners[name] || []) listener(event); }
            getCenter() { return point(this.center); }
            panTo(value) {
              this.center = {
                lat: typeof value.lat === "function" ? value.lat() : value.lat,
                lng: typeof value.lng === "function" ? value.lng() : value.lng,
              };
              this.emit("center_changed");
              this.emit("idle");
            }
            setCenter(value) {
              this.center = { lat: value.lat + 0.00000004, lng: value.lng - 0.00000004 };
              this.emit("center_changed");
              this.emit("idle");
            }
            setOptions(value) { this.options = { ...(this.options || {}), ...value }; }
            setZoom(value) { this.zoom = value; }
          }
          class Circle {
            constructor(options) { Object.assign(this, options); state.circles.push(this); }
            setCenter(value) { this.center = value; }
            setRadius(value) { this.radius = value; }
            setMap(value) { this.map = value; }
          }
          class Geocoder {
            geocode(input) {
              return new Promise((resolve, reject) => state.geocodes.push({ input, resolve, reject }));
            }
          }
          class PlaceAutocompleteElement extends HTMLElement { constructor() { super(); this.placeholder = ""; } }
          if (!customElements.get("gmp-place-autocomplete")) customElements.define("gmp-place-autocomplete", PlaceAutocompleteElement);
          window.google = { maps: { Map, Circle, Geocoder, importLibrary: async () => ({ PlaceAutocompleteElement }) } };
          window[${JSON.stringify(callback)}]();
        })();`,
    });
  }
  if (url.origin !== target.origin) return route.abort();
  if (await fulfillLineSessionMock(route)) return;
  if (url.pathname === "/api/repository-management") {
    assert.equal(request.method(), "GET");
    assert.equal(url.searchParams.get("owner"), "alice");
    assert.equal(url.searchParams.get("name"), "Operations");
    return route.fulfill({
      json: {
        repository: {
          id: "repo",
          actorUserId,
          ownerAccountId: actorUserId,
          ownerKind: "USER",
          ownerLogin: "alice",
          name: "Operations",
          visibility: "private",
          archived: false,
          version,
          actorPermissions: [capability],
          internalEnterpriseId: null,
        },
      },
    });
  }
  if (url.pathname === "/api/repository-address") {
    if (request.method() === "GET") {
      assert.equal(url.searchParams.get("owner"), "alice");
      assert.equal(url.searchParams.get("name"), "Operations");
      if (!member)
        return route.fulfill({
          status: 403,
          json: { error: "目前不是此 Repository 的有效成員。" },
        });
      return route.fulfill({
        json: {
          repository: {
            id: "repo",
            actorUserId,
            ownerLogin: "alice",
            name: "Operations",
            version,
            actorPermissions: [capability],
          },
          address,
        },
      });
    }
    const command = request.postDataJSON();
    posts.push(command);
    let result = receipts.get(command.requestId);
    if (!result) {
      if (capability !== "admin")
        return route.fulfill({
          status: 403,
          json: { error: "需要 Repository admin 才能管理地址。" },
        });
      if (command.expectedVersion !== version)
        return route.fulfill({ status: 409, json: { error: "地址版本已更新。" } });
      address = command.action === "set" ? command.address : null;
      version += 1;
      const receiptAddress = address
        ? {
            radius: address.radius,
            longitude: address.longitude,
            address: address.address,
            latitude: address.latitude,
          }
        : null;
      result = {
        requestId: command.requestId,
        repositoryId: "repo",
        address: receiptAddress,
        version,
        at: 1000,
      };
      receipts.set(command.requestId, result);
    }
    if (lose) {
      lose = false;
      return route.abort();
    }
    return route.fulfill({ json: result });
  }
  if (url.pathname.startsWith("/api/"))
    return route.fulfill({ status: 403, json: { error: "Synthetic denial" } });
  return route.continue();
});
await page.addInitScript(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition(_success, failure) {
        if (window.__syntheticGeolocation) {
          _success({ coords: window.__syntheticGeolocation });
          return;
        }
        failure(window.__syntheticGeolocationError ?? { code: 1, message: "synthetic denial" });
      },
    },
  });
});
try {
  if (noMapsKey) {
    await page.goto(new URL("/alice/Operations/settings", target).href);
    await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
    await expect(page.getByLabel("打卡點地圖")).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Google Maps 尚未設定" }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.__syntheticGeolocation = { latitude: Number.NaN, longitude: 121.54, accuracy: 20 };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByRole("status").filter({ hasText: "無效座標" })).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeDisabled();
    await page.evaluate(() => {
      window.__syntheticGeolocation = { latitude: 25.01, longitude: 121.54, accuracy: 0.1 };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await page.getByLabel("打卡半徑（公尺）", { exact: true }).fill("0");
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeDisabled();
    await page.getByLabel("打卡半徑（公尺）", { exact: true }).fill("0.5");
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();
    await page.getByRole("button", { name: "儲存打卡點" }).click();
    await expect(page.getByText("打卡點已更新。", { exact: true })).toBeVisible();
    assert.equal(posts[0].address.address, null);
    assert.equal(posts[0].address.radius, 0.5);
    await page.reload();
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    assert.equal(mapsLoads, 0);
    assert.deepEqual(errors, []);
    if (output) {
      await page.screenshot({
        path: path.join(output, "repository-address-no-maps.png"),
        fullPage: true,
      });
      await context.tracing.stop({
        path: path.join(output, "repository-address-no-maps-trace.zip"),
      });
    }
    console.log("Repository address without Maps browser checks passed.");
  } else {
    const navigation = await page.goto(new URL("/alice/Operations/settings", target).href);
    assert.equal(navigation.headers()["referrer-policy"], "origin");
    await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新載入地圖" })).toBeEnabled();
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByRole("status").filter({ hasText: "定位權限遭拒絕" })).toBeVisible();
    await page.evaluate(() => {
      window.__syntheticGeolocationError = { code: 3, message: "synthetic timeout" };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByRole("status").filter({ hasText: "逾時" })).toBeVisible();
    await page.evaluate(() => {
      delete window.__syntheticGeolocationError;
      window.__syntheticGeolocation = { latitude: 25.01, longitude: 121.54, accuracy: 250 };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await expect(page.getByRole("status").filter({ hasText: "大於打卡半徑" })).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();
    await page.getByRole("button", { name: "重新載入地圖" }).click();
    await expect(page.getByLabel("打卡點地圖")).toHaveAttribute("data-map-ready", "true");
    await expect(page.getByLabel("緯度", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("經度", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await page.evaluate(() => {
      window.__syntheticMaps.geocodes[0].resolve({ results: [] });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();
    assert.equal(await page.evaluate(() => window.__syntheticMaps.geocodes.length), 1);
    await page.getByRole("button", { name: "儲存打卡點" }).click();
    await expect(page.getByText("打卡點已更新。", { exact: true })).toBeVisible();
    assert.equal(posts[0].address.address, null);
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await expect(page.locator("gmp-place-autocomplete")).toHaveCount(1);
    await page.evaluate(() => {
      const autocomplete = document.querySelector("gmp-place-autocomplete");
      const event = new Event("gmp-select");
      event.placePrediction = {
        toPlace: () => ({
          formattedAddress: "搜尋選取地址",
          location: { lat: () => 25.02, lng: () => 121.55 },
          fetchFields: async () => {},
        }),
      };
      autocomplete.dispatchEvent(event);
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("搜尋選取地址");
    await page.getByRole("button", { name: "儲存打卡點" }).click();
    await expect(page.getByText("打卡點已更新。", { exact: true })).toBeVisible();
    assert.equal(posts[1].address.latitude, 25.02);
    assert.equal(posts[1].address.longitude, 121.55);
    assert.equal(posts[1].address.address, "搜尋選取地址");
    assert.equal(
      await page
        .evaluate(() => {
          const center = window.__syntheticMaps.maps.at(-1).getCenter();
          return [center.lat(), center.lng()];
        })
        .then(
          ([latitude, longitude]) =>
            Math.abs(latitude - 25.02) < 0.000001 && Math.abs(longitude - 121.55) < 0.000001,
        ),
      true,
      "selecting an address result must center the map on its coordinates",
    );
    await expect(page.getByLabel("打卡點地圖")).toHaveAttribute("data-map-ready", "true");
    await page.evaluate(() => {
      const maps = window.__syntheticMaps;
      maps.geocodes.length = 0;
      maps.maps.at(-1).emit("click", { latLng: { lat: () => 25.03, lng: () => 121.56 } });
      maps.maps.at(-1).emit("click", { latLng: { lat: () => 25.0375, lng: () => 121.5637 } });
      maps.geocodes[1].resolve({ results: [{ formatted_address: "台北市信義區市府路 1 號" }] });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("台北市信義區市府路 1 號");
    await page.getByLabel("地址", { exact: true }).fill("自訂入口地址");
    await page.evaluate(() => {
      const map = window.__syntheticMaps.maps.at(-1);
      map.setCenter({ lat: 26, lng: 122 });
      map.emit("idle");
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("自訂入口地址");
    assert.deepEqual(
      await page.evaluate(() => window.__syntheticMaps.circles.at(-1).center),
      { lat: 25.0375, lng: 121.5637 },
      "programmatic map movement must not move the committed point",
    );
    await page.evaluate(() => {
      window.__syntheticMaps.geocodes[0].resolve({
        results: [{ formatted_address: "遲到的舊地址" }],
      });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("自訂入口地址");
    await page.evaluate(() => {
      window.__syntheticMaps.maps.at(-1).emit("click", {
        latLng: { lat: () => 25.04, lng: () => 121.57 },
      });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await page.evaluate(() => {
      const map = window.__syntheticMaps.maps.at(-1);
      map.center = { lat: 25.041, lng: 121.571 };
      map.emit("center_changed");
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await page.evaluate(() => window.__syntheticMaps.maps.at(-1).emit("dragend"));
    await page.evaluate(() => {
      const geocodes = window.__syntheticMaps.geocodes;
      geocodes[2].resolve({ results: [{ formatted_address: "拖曳前的舊位置" }] });
      geocodes[3].reject(new Error("synthetic reverse geocode failure"));
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();
    await page.getByLabel("打卡半徑（公尺）", { exact: true }).fill("100");
    assert.equal(await page.evaluate(() => window.__syntheticMaps.circles.at(-1).radius), 100);
    if (output) {
      await page.screenshot({ path: path.join(output, "repository-address-map-top.png") });
      await page.getByRole("button", { name: "儲存打卡點" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, "repository-address-map-scrolled.png") });
    }
    lose = true;
    await page.getByRole("button", { name: "儲存打卡點" }).click();
    await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
    assert.equal(posts.length, 3);
    assert.equal(
      posts[2].address.latitude,
      25.041,
      "save must use the latest map point immediately",
    );
    assert.equal(posts[2].address.longitude, 121.571);
    assert.equal(posts[2].address.address, null);

    await page.reload();
    await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
    assert.equal(posts.length, 3);
    await page.getByRole("button", { name: "重試原操作" }).click();
    await expect(page.getByText("打卡點已更新。", { exact: true })).toBeVisible();
    assert.deepEqual(posts[3], posts[2], "retry must preserve the original UUID and payload");
    assert.equal(receipts.size, 3);
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");

    await page.getByLabel("地址", { exact: true }).fill("舊位置手填地址");
    await page.evaluate(() => {
      window.__syntheticGeolocation = { latitude: 25.06, longitude: 121.59, accuracy: 20 };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await page.evaluate(() => {
      window.__syntheticMaps.geocodes.at(-1).resolve({
        results: [{ formatted_address: "重新定位街道地址" }],
      });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("重新定位街道地址");
    await page.getByLabel("地址", { exact: true }).fill("舊位置再次手填");
    await page.evaluate(() => {
      window.__syntheticGeolocation = { latitude: 25.07, longitude: 121.6, accuracy: 20 };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await page.getByLabel("地址", { exact: true }).fill("新位置自訂地址");
    await page.evaluate(() => {
      window.__syntheticMaps.geocodes.at(-1).resolve({
        results: [{ formatted_address: "晚到的街道地址" }],
      });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("新位置自訂地址");
    await page.evaluate(() => {
      window.__syntheticGeolocation = { latitude: 25.08, longitude: 121.61, accuracy: 20 };
    });
    await page.getByRole("button", { name: "使用目前位置" }).click();
    await page.evaluate(() =>
      window.__syntheticMaps.geocodes.at(-1).reject(new Error("synthetic")),
    );
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();

    await page.evaluate(() => window.gm_authFailure());
    await expect(page.getByRole("status").filter({ hasText: "金鑰或網站授權無效" })).toBeVisible();

    const postsBeforeWrongRepository = posts.length;
    await page.evaluate(() => {
      sessionStorage.setItem(
        "repository-address:alice/operations",
        JSON.stringify({
          owner: "owner",
          command: {
            action: "remove",
            requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            repositoryId: "another-repository",
            expectedVersion: 2,
          },
        }),
      );
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重試原操作" })).toHaveCount(0);
    assert.equal(posts.length, postsBeforeWrongRepository);

    await expect(page.getByLabel("打卡點地圖")).toHaveAttribute("data-map-ready", "true");
    await page.evaluate(() => {
      window.__syntheticMaps.maps.at(-1).emit("click", {
        latLng: { lat: () => 25.05, lng: () => 121.58 },
      });
    });
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();
    await page.evaluate(() => window.__syntheticMaps.geocodes[0].reject(new Error("synthetic")));
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    await page.getByLabel("地址", { exact: true }).fill("第二入口");
    await page.getByLabel("打卡半徑（公尺）", { exact: true }).fill("120");
    lose = true;
    await page.getByRole("button", { name: "儲存打卡點" }).click();
    await expect(page.getByRole("button", { name: "重試原操作" })).toBeEnabled();
    const postsBeforeIdentityChange = posts.length;
    actorUserId = "other-owner";
    await page.reload();
    await expect(page.getByRole("heading", { name: "alice/Operations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重試原操作" })).toHaveCount(0);
    assert.equal(posts.length, postsBeforeIdentityChange);
    actorUserId = "owner";
    await page.reload();

    capability = "read";
    await page.reload();
    await expect(page.getByText(/第二入口 · 120 公尺/)).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toHaveCount(0);
    if (output)
      await page.screenshot({
        path: path.join(output, "repository-address-member.png"),
        fullPage: true,
      });

    member = false;
    await page.reload();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "目前不是此 Repository 的有效成員",
    );
    await expect(page.getByText("第二入口", { exact: false })).toHaveCount(0);

    member = true;
    capability = "admin";
    await page.reload();
    await expect(page.getByRole("button", { name: "儲存打卡點" })).toBeEnabled();
    version += 1;
    await page.getByRole("button", { name: "儲存打卡點" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "地址版本已更新" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重試原操作" })).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "移除打卡點" }).click();
    await expect(page.getByText("打卡點已移除。", { exact: true })).toBeVisible();
    await expect(page.getByLabel("地址", { exact: true })).toHaveValue("");
    assert.equal(posts.at(-1).action, "remove");
    assert.deepEqual(errors, []);
    if (output) {
      await page.screenshot({
        path: path.join(output, "repository-address-admin.png"),
        fullPage: true,
      });
      await context.tracing.stop({ path: path.join(output, "repository-address-trace.zip") });
      writeFileSync(
        path.join(output, "repository-address-results.json"),
        JSON.stringify(
          {
            status: "passed",
            checks: [
              "save address",
              "Google Maps key and origin referrer",
              "loader failure retry",
              "Places New selection payload",
              "map point with hidden coordinates",
              "denied and successful geolocation",
              "empty and failed reverse geocoding save a null description",
              "address autocomplete selects the result coordinates on the map",
              "programmatic map centering is not an explicit selection",
              "map click and drag end commit selected coordinates",
              "GPS accuracy warning follows the configured radius",
              "positive fractional radius is accepted and zero is rejected",
              "new location replaces stale manual address",
              "late geocode and manual address protection",
              "radius circle synchronization",
              "persistent identical retry",
              "stale address version conflict is not retried",
              "wrong Repository pending operation rejected",
              "pending operation cleared on actor change",
              "effective member read",
              "removed member denied",
              "remove address",
            ],
            posts: posts.length,
          },
          null,
          2,
        ),
      );
    }
    console.log("Repository address browser checks passed.");
  }
} catch (error) {
  if (output) {
    await page.screenshot({
      path: path.join(output, "repository-address-failure.png"),
      fullPage: true,
    });
    await context.tracing.stop({ path: path.join(output, "repository-address-failure.zip") });
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}
