import 'maplibre-gl/dist/maplibre-gl.css';
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, type MapMouseEvent } from 'maplibre-gl';
import { createElement, useEffect, useRef, useState } from 'react';
import type { MapStore } from '@/services/marketplace';
import { colors } from '../theme';
import type { OffersMapProps, PickLocationMapProps } from './mapTypes';

// Mapa gratuito e sem chave (OpenFreeMap, dados OpenStreetMap).
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const BRAZIL: [number, number] = [-51.9, -14.2];

function pin(count: number) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', `${count} ofertas nesta unidade`);
  el.style.cssText = `min-width:34px;height:34px;padding:0 8px;border-radius:17px;border:3px solid #fff;background:${colors.navy};color:#fff;font:700 14px system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer`;
  el.textContent = String(count);
  return el;
}

/** Marcadores nas coordenadas das UNIDADES (nunca na posição de quem publicou). */
export function OffersMap({ stores, onSelect, center }: OffersMapProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);

  useEffect(() => {
    if (!el) return;
    map.current = new MapLibreMap({ container: el, style: STYLE, center: center ? [center.longitude, center.latitude] : BRAZIL, zoom: center ? 12 : 3.5, attributionControl: { compact: true } });
    map.current.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.current.on('error', () => setTilesFailed(true));
    map.current.on('load', () => setTilesFailed(false));
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = stores.map((s: MapStore) => {
      const el = pin(s.active_offers);
      el.addEventListener('click', () => onSelect(s));
      return new Marker({ element: el }).setLngLat([s.longitude, s.latitude]).addTo(m);
    });
    if (stores.length === 1) m.flyTo({ center: [stores[0].longitude, stores[0].latitude], zoom: 14 });
    else if (stores.length > 1) {
      const b = new LngLatBounds();
      stores.forEach((s) => b.extend([s.longitude, s.latitude]));
      m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 400 });
    }
  }, [stores, onSelect, el]);

  return createElement(
    'div',
    { style: { position: 'relative', flex: 1, minHeight: 360, height: '100%' } },
    createElement('div', { ref: setEl, style: { position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden', background: colors.navySoft } }),
    tilesFailed
      ? createElement('div', { role: 'status', style: { position: 'absolute', left: 12, right: 12, top: 12, padding: '10px 12px', borderRadius: 12, background: colors.yellowSoft, color: colors.yellowText, font: '14px system-ui, sans-serif' } },
          'Não foi possível carregar o fundo do mapa (sem conexão com o servidor de mapas). Os marcadores ainda indicam as unidades; toque em um deles ou use a lista.')
      : null,
  );
}

export function PickLocationMap({ value, onChange, center }: PickLocationMapProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!el) return;
    const start = value ?? center;
    const m = new MapLibreMap({ container: el, style: STYLE, center: start ? [start.longitude, start.latitude] : BRAZIL, zoom: start ? 16 : 3.5 });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.on('click', (e: MapMouseEvent) => onChangeRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) marker.current = new Marker({ color: colors.green }).setLngLat([value.longitude, value.latitude]).addTo(m);
    else marker.current.setLngLat([value.longitude, value.latitude]);
  }, [value, el]);

  return createElement('div', { ref: setEl, style: { height: 260, borderRadius: 16, overflow: 'hidden', background: colors.navySoft } });
}

export const mapAvailable = true;
