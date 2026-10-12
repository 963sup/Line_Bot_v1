"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MapPoint = Readonly<{ latitude: number; longitude: number }>;

type LatLng = { lat(): number; lng(): number };
type Listener = { remove(): void };
type MapInstance = {
  addListener(name: string, listener: (event?: { latLng?: LatLng }) => void): Listener;
  getCenter(): LatLng | null;
  panTo(point: { lat: number; lng: number }): void;
  setCenter(point: { lat: number; lng: number }): void;
  setOptions(options: Record<string, unknown>): void;
  setZoom(zoom: number): void;
};
type CircleInstance = {
  setCenter(point: { lat: number; lng: number }): void;
  setRadius(radius: number): void;
  setMap(map: MapInstance | null): void;
};
type Place = {
  fetchFields(input: { fields: string[] }): Promise<void>;
  formattedAddress?: string;
  location?: LatLng;
};
type PlaceSelectEvent = Event & { placePrediction?: { toPlace(): Place } };
type PlaceElement = HTMLElement & { placeholder: string };
type MapsRuntime = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
    Circle: new (options: Record<string, unknown>) => CircleInstance;
    Geocoder: new () => {
      geocode(input: { location: { lat: number; lng: number } }): Promise<{
        results: Array<{ formatted_address?: string }>;
      }>;
    };
    importLibrary(name: "places"): Promise<{
      PlaceAutocompleteElement: new () => PlaceElement;
    }>;
  };
};

declare global {
  interface Window {
    google?: MapsRuntime;
    gm_authFailure?: () => void;
    __repositoryMapsReady?: () => void;
  }
}

let mapsPromise: Promise<MapsRuntime> | undefined;
let loadedKey: string | undefined;
const authFailureSubscribers = new Set<(message: string) => void>();

function loadMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (mapsPromise && loadedKey === apiKey) return mapsPromise;
  loadedKey = apiKey;
  const script = document.createElement("script");
  const attempt = new Promise<MapsRuntime>((resolve, reject) => {
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      previousAuthFailure?.();
      const message = "Google Maps 金鑰或網站授權無效，請檢查 API 與 HTTP referrer 限制。";
      for (const subscriber of authFailureSubscribers) subscriber(message);
      reject(new Error(message));
    };
    window.__repositoryMapsReady = () => {
      if (!window.google?.maps) {
        reject(new Error("Google Maps 載入結果不完整。"));
        return;
      }
      resolve(window.google);
    };
    const query = new URLSearchParams({
      key: apiKey,
      loading: "async",
      libraries: "places",
      language: "zh-TW",
      region: "TW",
      v: "weekly",
      callback: "__repositoryMapsReady",
      auth_referrer_policy: "origin",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
    script.async = true;
    script.referrerPolicy = "origin";
    script.onerror = () => reject(new Error("Google Maps 載入失敗，請檢查網路或金鑰限制。"));
    document.head.append(script);
  });
  mapsPromise = attempt.catch((error) => {
    mapsPromise = undefined;
    loadedKey = undefined;
    script.remove();
    throw error;
  });
  return mapsPromise;
}

function coordinates(point: MapPoint) {
  return { lat: point.latitude, lng: point.longitude };
}

function validPoint(point: MapPoint) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export default function GoogleMapPicker({
  apiKey,
  point,
  radius,
  disabled,
  onChange,
}: {
  apiKey: string;
  point: MapPoint | null;
  radius: number;
  disabled: boolean;
  onChange(point: MapPoint, suggestedAddress: string | null, source: "selection" | "geocode"): void;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const searchElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const circle = useRef<CircleInstance | null>(null);
  const geocoder = useRef<InstanceType<MapsRuntime["maps"]["Geocoder"]> | null>(null);
  const lifecycleGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const initialPoint = useRef(point);
  const initialRadius = useRef(radius);
  const [status, setStatus] = useState(
    apiKey ? "載入地圖中…" : "Google Maps 尚未設定；仍可使用目前位置設定打卡點。",
  );
  const [locating, setLocating] = useState(false);
  const [retryableError, setRetryableError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationAccuracyUnknown, setLocationAccuracyUnknown] = useState(false);

  onChangeRef.current = onChange;
  disabledRef.current = disabled;
  initialPoint.current = point;
  initialRadius.current = radius;

  const commitSelection = useCallback((selected: MapPoint, suggestedAddress: string | null) => {
    if (!validPoint(selected)) return;
    setLocating(false);
    setLocationAccuracy(null);
    setLocationAccuracyUnknown(false);
    circle.current?.setMap(map.current);
    circle.current?.setCenter(coordinates(selected));
    const selection = ++selectionGeneration.current;
    onChangeRef.current(selected, suggestedAddress, "selection");
    if (suggestedAddress || !geocoder.current) return;
    void geocoder.current
      .geocode({ location: coordinates(selected) })
      .then((response) => {
        if (selection !== selectionGeneration.current || disabledRef.current) return;
        const address = response.results[0]?.formatted_address?.trim();
        if (address) onChangeRef.current(selected, address, "geocode");
        else setStatus("未找到地址描述；打卡點仍可使用座標與半徑儲存。");
      })
      .catch(() => {
        if (selection === selectionGeneration.current && !disabledRef.current)
          setStatus("地址查詢失敗；打卡點仍可使用座標與半徑儲存。");
      });
  }, []);

  useEffect(() => {
    const report = (message: string) => {
      setRetryableError(false);
      setStatus(message);
    };
    authFailureSubscribers.add(report);
    return () => {
      authFailureSubscribers.delete(report);
    };
  }, []);

  useEffect(() => {
    if (!apiKey || !mapElement.current || !searchElement.current) return;
    setStatus(retry > 0 ? "重新載入地圖中…" : "載入地圖中…");
    setRetryableError(false);
    const ticket = ++lifecycleGeneration.current;
    const listeners: Listener[] = [];
    let placeElement: PlaceElement | undefined;
    void loadMaps(apiKey)
      .then(async (google) => {
        if (ticket !== lifecycleGeneration.current || !mapElement.current || !searchElement.current)
          return;
        const center = initialPoint.current ?? { latitude: 25.033, longitude: 121.5654 };
        const instance = new google.maps.Map(mapElement.current, {
          center: coordinates(center),
          zoom: initialPoint.current ? 17 : 13,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: disabledRef.current ? "none" : "auto",
          keyboardShortcuts: !disabledRef.current,
        });
        map.current = instance;
        setRetryableError(false);
        circle.current = new google.maps.Circle({
          map: initialPoint.current ? instance : null,
          center: coordinates(center),
          radius: initialRadius.current,
          fillColor: "#2563eb",
          fillOpacity: 0.13,
          strokeColor: "#2563eb",
          strokeOpacity: 0.7,
          strokeWeight: 2,
        });
        geocoder.current = new google.maps.Geocoder();
        listeners.push(
          instance.addListener("dragend", () => {
            if (disabledRef.current) return;
            const centerValue = instance.getCenter();
            if (!centerValue) return;
            const selected = { latitude: centerValue.lat(), longitude: centerValue.lng() };
            if (!validPoint(selected)) {
              setStatus("地圖回傳無效座標，請重新選點。");
              return;
            }
            commitSelection(selected, null);
          }),
          instance.addListener("click", (event) => {
            if (event?.latLng && !disabledRef.current) {
              const selected = {
                latitude: event.latLng.lat(),
                longitude: event.latLng.lng(),
              };
              if (!validPoint(selected)) {
                setStatus("地圖回傳無效座標，請重新選點。");
                return;
              }
              instance.panTo(coordinates(selected));
              commitSelection(selected, null);
            }
          }),
        );
        setStatus("移動地圖，讓圖釘對準打卡位置。");
        try {
          const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
          if (ticket !== lifecycleGeneration.current || !searchElement.current) return;
          placeElement = new PlaceAutocompleteElement();
          placeElement.placeholder = "搜尋地址或地標";
          placeElement.setAttribute("aria-label", "搜尋地址或地標");
          placeElement.addEventListener("gmp-select", async (rawEvent) => {
            const event = rawEvent as PlaceSelectEvent;
            const place = event.placePrediction?.toPlace();
            if (!place || disabledRef.current) return;
            setLocating(false);
            const selection = ++selectionGeneration.current;
            try {
              await place.fetchFields({ fields: ["formattedAddress", "location"] });
              if (
                selection !== selectionGeneration.current ||
                disabledRef.current ||
                !place.location
              )
                return;
              const selected = {
                latitude: place.location.lat(),
                longitude: place.location.lng(),
              };
              if (!validPoint(selected)) {
                setStatus("地點資料沒有有效座標，請改用其他位置。");
                return;
              }
              instance.setCenter(coordinates(selected));
              instance.setZoom(17);
              commitSelection(selected, place.formattedAddress?.trim() || null);
              setStatus("已選取搜尋結果；地址描述可編輯。");
            } catch {
              setStatus("地點資料讀取失敗，請移動地圖選點。");
            }
          });
          searchElement.current.replaceChildren(placeElement);
        } catch {
          setStatus("地圖可使用，但地址搜尋暫不可用；仍可移動地圖選點。");
        }
      })
      .catch((error) => {
        if (ticket === lifecycleGeneration.current) {
          setRetryableError(true);
          setStatus(error instanceof Error ? error.message : "Google Maps 載入失敗。");
        }
      });
    return () => {
      lifecycleGeneration.current += 1;
      selectionGeneration.current += 1;
      for (const listener of listeners) listener.remove();
      circle.current?.setMap(null);
      map.current = null;
      circle.current = null;
      geocoder.current = null;
      placeElement?.remove();
    };
  }, [apiKey, commitSelection, retry]);

  useEffect(() => circle.current?.setRadius(radius), [radius]);

  useEffect(() => {
    map.current?.setOptions({
      gestureHandling: disabled ? "none" : "auto",
      keyboardShortcuts: !disabled,
    });
  }, [disabled]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus("此裝置不支援定位，請使用支援定位的裝置或地圖選點。");
      return;
    }
    setLocating(true);
    const ticket = ++selectionGeneration.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (ticket !== selectionGeneration.current || disabledRef.current) return;
        setLocating(false);
        const selected = { latitude: coords.latitude, longitude: coords.longitude };
        if (!validPoint(selected)) {
          setStatus("定位回傳無效座標，請重試或改用地圖選點。");
          return;
        }
        map.current?.setCenter(coordinates(selected));
        map.current?.setZoom(18);
        commitSelection(selected, null);
        setStatus("已取得目前位置；地址描述選填，座標可直接儲存。");
        if (
          typeof coords.accuracy === "number" &&
          Number.isFinite(coords.accuracy) &&
          coords.accuracy >= 0
        ) {
          setLocationAccuracy(coords.accuracy);
          setLocationAccuracyUnknown(false);
        } else {
          setLocationAccuracy(null);
          setLocationAccuracyUnknown(true);
        }
      },
      (error) => {
        if (ticket === selectionGeneration.current) {
          setLocating(false);
          setStatus(
            error.code === 1
              ? "定位權限遭拒絕，請允許定位後重試或改用地圖／地址搜尋。"
              : error.code === 3
                ? "取得目前位置逾時，請重試或改用地圖／地址搜尋。"
                : "目前位置無法使用，請重試或改用地圖／地址搜尋。",
          );
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="repository-map-picker">
      {apiKey && (
        <>
          <div ref={searchElement} className="repository-map-search" />
          <div className="repository-map-canvas-wrap">
            <div ref={mapElement} className="repository-map-canvas" aria-label="打卡點地圖" />
            <span className="repository-map-pin" aria-hidden="true">
              ●
            </span>
          </div>
        </>
      )}
      <div className="repository-map-actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled || locating}
          onClick={useCurrentLocation}
        >
          {locating ? "定位中…" : "使用目前位置"}
        </button>
        {retryableError && (
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={() => setRetry((value) => value + 1)}
          >
            重新載入地圖
          </button>
        )}
        <p role="status">{status}</p>
        {locationAccuracy !== null && locationAccuracy > radius && (
          <p role="status">
            目前定位精度約 ±{Math.ceil(locationAccuracy)} 公尺，大於打卡半徑 {radius} 公尺；
            可在定位較佳處重試，或使用地圖／地址搜尋調整打卡點。
          </p>
        )}
        {locationAccuracyUnknown && (
          <p role="status">無法確認目前定位精度；可重新定位，或使用地圖／地址搜尋調整打卡點。</p>
        )}
      </div>
    </div>
  );
}
