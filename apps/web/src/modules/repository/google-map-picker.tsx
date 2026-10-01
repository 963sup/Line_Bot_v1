"use client";

import { useEffect, useRef, useState } from "react";

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
  onChange(point: MapPoint, suggestedAddress: string | null): void;
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
  const programmaticTarget = useRef<MapPoint | null>(null);
  const committedPoint = useRef<MapPoint | null>(point);
  const movedSinceIdle = useRef(false);
  const [status, setStatus] = useState("載入地圖中…");
  const [locating, setLocating] = useState(false);
  const [retryableError, setRetryableError] = useState(false);
  const [retry, setRetry] = useState(0);

  onChangeRef.current = onChange;
  disabledRef.current = disabled;
  initialPoint.current = point;
  initialRadius.current = radius;

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
        committedPoint.current = initialPoint.current;
        programmaticTarget.current = null;
        movedSinceIdle.current = false;
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
          instance.addListener("center_changed", () => {
            const centerValue = instance.getCenter();
            if (!centerValue) return;
            const selected = { latitude: centerValue.lat(), longitude: centerValue.lng() };
            circle.current?.setCenter(coordinates(selected));
            const target = programmaticTarget.current;
            if (
              target &&
              target.latitude === selected.latitude &&
              target.longitude === selected.longitude
            ) {
              programmaticTarget.current = null;
              return;
            }
            if (disabledRef.current) return;
            movedSinceIdle.current = true;
            committedPoint.current = selected;
            circle.current?.setMap(instance);
            selectionGeneration.current += 1;
            onChangeRef.current(selected, null);
          }),
          instance.addListener("idle", () => {
            if (!movedSinceIdle.current || disabledRef.current) return;
            movedSinceIdle.current = false;
            const selected = committedPoint.current;
            if (!selected) return;
            const lookup = selectionGeneration.current;
            void geocoder.current
              ?.geocode({ location: coordinates(selected) })
              .then((response) => {
                const address = response.results[0]?.formatted_address?.trim();
                if (lookup === selectionGeneration.current && !disabledRef.current && address)
                  onChangeRef.current(selected, address);
              })
              .catch(() => {
                // Coordinates remain usable; the editable address field is the fallback.
              });
          }),
          instance.addListener("click", (event) => {
            if (event?.latLng && !disabledRef.current) {
              instance.panTo({ lat: event.latLng.lat(), lng: event.latLng.lng() });
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
              programmaticTarget.current = selected;
              committedPoint.current = selected;
              movedSinceIdle.current = false;
              instance.setCenter(coordinates(selected));
              instance.setZoom(17);
              circle.current?.setMap(instance);
              circle.current?.setCenter(coordinates(selected));
              onChangeRef.current(selected, place.formattedAddress?.trim() || null);
            } catch {
              setStatus("地點資料讀取失敗，請移動地圖選點。");
            }
          });
          searchElement.current.replaceChildren(placeElement);
        } catch {
          setStatus("地圖可使用，但地址搜尋暫不可用；請移動地圖選點並手動填寫地址。");
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
  }, [apiKey, retry]);

  useEffect(() => circle.current?.setRadius(radius), [radius]);

  useEffect(() => {
    map.current?.setOptions({
      gestureHandling: disabled ? "none" : "auto",
      keyboardShortcuts: !disabled,
    });
  }, [disabled]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus("此裝置不支援定位，請搜尋或移動地圖選點。");
      return;
    }
    setLocating(true);
    const ticket = ++selectionGeneration.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (ticket !== selectionGeneration.current || disabledRef.current) return;
        const selected = { latitude: coords.latitude, longitude: coords.longitude };
        programmaticTarget.current = selected;
        committedPoint.current = selected;
        movedSinceIdle.current = false;
        map.current?.setCenter(coordinates(selected));
        map.current?.setZoom(18);
        circle.current?.setMap(map.current);
        circle.current?.setCenter(coordinates(selected));
        const lookup = ++selectionGeneration.current;
        onChangeRef.current(selected, null);
        void geocoder.current
          ?.geocode({ location: coordinates(selected) })
          .then((response) => {
            if (lookup === selectionGeneration.current && !disabledRef.current)
              onChangeRef.current(selected, response.results[0]?.formatted_address?.trim() || null);
          })
          .catch(() => {
            if (lookup === selectionGeneration.current) onChangeRef.current(selected, null);
          });
      },
      () => {
        setLocating(false);
        if (ticket === selectionGeneration.current)
          setStatus("無法取得目前位置，請允許定位或改用搜尋與地圖選點。");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="repository-map-picker">
      <div ref={searchElement} className="repository-map-search" />
      <div className="repository-map-canvas-wrap">
        <div ref={mapElement} className="repository-map-canvas" aria-label="打卡點地圖" />
        <span className="repository-map-pin" aria-hidden="true">
          ●
        </span>
      </div>
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
      </div>
    </div>
  );
}
