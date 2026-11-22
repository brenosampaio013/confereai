import type { MapStore } from '@/services/marketplace';

export interface LatLng { latitude: number; longitude: number }
export interface OffersMapProps { stores: MapStore[]; onSelect: (s: MapStore) => void; center: LatLng | null }
export interface PickLocationMapProps {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  center: LatLng | null;
  /** Quando muda, o mapa voa até este ponto: é o resultado escolhido na busca de endereços. */
  focar?: LatLng | null;
}
