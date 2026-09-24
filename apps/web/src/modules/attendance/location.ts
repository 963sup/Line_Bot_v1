/** Obtain a fresh, foreground position for an explicit attendance operation. */
export function locateAttendance(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
}> {
  if (!navigator.geolocation) return Promise.reject(new Error("此裝置不支援定位。"));
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
      (error) =>
        reject(
          new Error(
            error.code === 1 ? "請允許定位後再試。" : "無法取得位置，請移至訊號良好處再試。",
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    ),
  );
}
