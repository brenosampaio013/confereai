import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { isCloudConfigured } from '@/lib/config';
import { listStores, StoreLocation } from '@/services/marketplace';
import { Button, Divider, Field, Sheet, T } from './components';
import { colors, space } from './theme';

export interface StoreChoice {
  name: string | null;
  locationId: string | null;
}

/**
 * Escolha do supermercado da compra. Com o servidor configurado, mostra as unidades
 * cadastradas: vincular a compra a uma unidade separa o histórico de preços por loja
 * e permite contribuir com a base de preços da comunidade.
 */
export function StoreSheet({ visible, onClose, initial, onSave }: { visible: boolean; onClose: () => void; initial: StoreChoice; onSave: (c: StoreChoice) => void | Promise<void> }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Supermercado">
      {visible ? <StoreForm initial={initial} onSave={onSave} /> : null}
    </Sheet>
  );
}

const unitLabel = (s: StoreLocation) => `${s.name} · ${s.neighborhood || s.address}`;

function StoreForm({ initial, onSave }: { initial: StoreChoice; onSave: (c: StoreChoice) => void | Promise<void> }) {
  const [text, setText] = useState(initial.name ?? '');
  const [locationId, setLocationId] = useState<string | null>(initial.locationId);
  const [results, setResults] = useState<StoreLocation[]>([]);
  const cloud = isCloudConfigured();
  const query = text.trim();

  useEffect(() => {
    if (!cloud || query.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      listStores({ query })
        .then((r) => alive && setResults(r.filter((s) => s.status === 'approved').slice(0, 6)))
        .catch(() => alive && setResults([]));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cloud, query]);

  const shown = query.length >= 2 ? results : [];
  return (
    <>
      <Field
        label="Nome do supermercado"
        value={text}
        onChangeText={(s) => {
          setText(s);
          setLocationId(null);
        }}
        placeholder="Ex.: Mercado do bairro"
        autoFocus
        autoCapitalize="words"
        hint={locationId ? 'Unidade cadastrada selecionada.' : cloud ? 'Digite para procurar uma unidade cadastrada ou use o nome que preferir.' : undefined}
      />
      {shown.length ? (
        <View>
          <T v="caption" color={colors.textMuted} style={{ textTransform: 'uppercase', marginBottom: 4 }}>Unidades cadastradas</T>
          {shown.map((s, i) => (
            <View key={s.location_id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => {
                  setText(unitLabel(s));
                  setLocationId(s.location_id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Selecionar ${unitLabel(s)}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}
              >
                <Ionicons name={locationId === s.location_id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.navy} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>{s.name}</T>
                  <T v="small" color={colors.textMuted} numberOfLines={1}>{[s.address, s.neighborhood, `${s.city}/${s.state}`].filter(Boolean).join(' · ')}</T>
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Button title="Salvar" icon="checkmark" kind="confirm" onPress={() => onSave({ name: text.trim() || null, locationId: text.trim() ? locationId : null })} />
    </>
  );
}
