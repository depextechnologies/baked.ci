import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_KEY } from '@/lib/config';
import type { LatLng } from '@/lib/routes';
import { colors, themed } from '@/theme';

export type NearbyDriver = LatLng & { vehicle_type?: string };
export type SendMapProps = { points: LatLng[]; route: LatLng[]; driver?: LatLng | null; nearby?: NearbyDriver[]; color: string; height?: number | `${number}%` };

const TWO_WHEEL = ['bike', 'moto', 'scooter', 'motorcycle'];
const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111111' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

let loader: Promise<any> | null = null;
const loadMaps = () => {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}`;
    s.async = true;
    s.onload = () => resolve(w.google.maps);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loader;
};

const pos = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });
const pin = (fill: string, r = 9) => ({ path: 0, scale: r, fillColor: fill, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 });

// Browser build: real interactive Google map (same markers/route/driver as the native map).
export function SendMap({ points, route, driver, nearby = [], color, height = 300 }: SendMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any[]>([]);
  const driverMk = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    loadMaps().then((gm) => {
      if (!alive || !el.current || map.current) return;
      const c = points[0] ? pos(points[0]) : { lat: 5.3484, lng: -4.0305 };
      map.current = new gm.Map(el.current, { center: c, zoom: 14, styles: DARK, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
      draw();
    }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = () => {
    const gm = (window as any).google?.maps;
    if (!gm || !map.current) return;
    layer.current.forEach((o) => o.setMap(null));
    layer.current = [
      ...points.map((p, i) => new gm.Marker({ map: map.current, position: pos(p), icon: pin(i === 0 ? color : '#FFFFFF', 8), zIndex: 10 })),
      ...nearby.map((d) => new gm.Marker({ map: map.current, position: pos(d), zIndex: 5, title: d.vehicle_type,
        icon: { url: `data:image/svg+xml;utf8,${encodeURIComponent(driverSvg(color, TWO_WHEEL.includes(d.vehicle_type || '')))}`, scaledSize: new gm.Size(30, 30), anchor: new gm.Point(15, 15) } })),
    ];
    if (route.length > 1) layer.current.push(new gm.Polyline({ map: map.current, path: route.map(pos), strokeColor: color, strokeWeight: 5 }));
    const all = [...points, ...(driver ? [driver] : [])];
    if (all.length > 1) { const b = new gm.LatLngBounds(); all.forEach((p) => b.extend(pos(p))); map.current.fitBounds(b, 50); }
    else if (all.length === 1) map.current.panTo(pos(all[0]));
  };

  useEffect(draw, [JSON.stringify(points), route.length, JSON.stringify(nearby), color]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const gm = (window as any).google?.maps;
    if (!gm || !map.current || !driver) return;
    if (!driverMk.current) driverMk.current = new gm.Marker({ map: map.current, icon: pin('#000000', 10), zIndex: 20 });
    driverMk.current.setIcon({ ...pin('#000000', 10), strokeColor: color, strokeWeight: 5 });
    driverMk.current.setPosition(pos(driver));
  }, [driver?.latitude, driver?.longitude, color]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.wrap, { height }]} testID="send-map-web">
      <div ref={el} style={{ position: 'absolute', inset: 0 }} data-testid="send-map-google" />
    </View>
  );
}

const driverSvg = (c: string, bike: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="${c}" stroke="#fff" stroke-width="2"/><g transform="translate(8 8)" fill="none" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${bike
  ? '<circle cx="3" cy="10" r="3"/><circle cx="11" cy="10" r="3"/><path d="M3 10l3-6h4l1 6M8 4h2"/>'
  : '<rect x="0" y="3" width="9" height="7"/><path d="M9 6h3l2 2v2H9"/><circle cx="3" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>'}</g></svg>`;

const styles = themed(() => StyleSheet.create({
  wrap: { width: '100%', backgroundColor: colors.surface, overflow: 'hidden', position: 'relative' },
}));
