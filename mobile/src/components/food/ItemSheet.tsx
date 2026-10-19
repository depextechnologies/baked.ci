import { Image } from 'expo-image';
import { Check, Minus, Plus, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import type { FoodOption } from '@/state/CartContext';
import { colors, fonts, radius } from '@/theme';
import { AppText } from '../ui/AppText';
import { Button, Touchable } from '../ui/Button';

const GREEN = MODULES.food.color;

export type MenuItem = {
  id: string; name: string; description?: string; image?: string; base_price: number; currency: string; is_veg?: boolean;
  is_available: boolean; tags?: string[];
  variants: { id: string; name_en: string; name_fr: string; price_delta: number; is_default?: boolean }[];
  addons: { id: string; name_en: string; name_fr: string; price: number }[];
};

type Props = { item: MenuItem | null; onClose: () => void; onAdd: (o: { variant: FoodOption | null; addons: FoodOption[]; notes: string; quantity: number }) => void };

export function ItemSheet({ item, onClose, onAdd }: Props) {
  const { t, lang } = useApp();
  const insets = useSafeAreaInsets();
  const [variant, setVariant] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!item) return;
    setVariant((item.variants.find((v) => v.is_default) || item.variants[0])?.id || null);
    setAddons([]); setNotes(''); setQty(1);
  }, [item]);
  if (!item) return null;

  const nm = (o: { name_en: string; name_fr: string }) => (lang === 'en' ? o.name_en : o.name_fr);
  const v = item.variants.find((x) => x.id === variant);
  const chosen = item.addons.filter((a) => addons.includes(a.id));
  const unit = item.base_price + (v?.price_delta || 0) + chosen.reduce((s, a) => s + a.price, 0);

  const add = () => onAdd({
    variant: v ? { id: v.id, name: nm(v), price_delta: v.price_delta } : null,
    addons: chosen.map((a) => ({ id: a.id, name: nm(a), price: a.price })), notes: notes.trim(), quantity: qty,
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="food-item-sheet">
          <ScrollView>
            <View style={styles.img}>
              {item.image ? <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              <Touchable testID="food-item-close" onPress={onClose} style={styles.close}><X color="#fff" size={20} /></Touchable>
            </View>
            <View style={{ padding: 18, gap: 6 }}>
              <AppText weight="black" size={22}>{item.name}</AppText>
              {item.description ? <AppText size={14} color={colors.textMuted}>{item.description}</AppText> : null}
              {item.variants.length > 1 ? (
                <View style={styles.group}>
                  <AppText weight="bold" size={15}>{t('food.choose_variant')}</AppText>
                  {item.variants.map((x) => (
                    <Option key={x.id} testID={`food-variant-${x.id}`} radio on={variant === x.id} label={nm(x)}
                      price={x.price_delta ? `+${formatMoney(x.price_delta, item.currency, undefined, lang)}` : ''} onPress={() => setVariant(x.id)} />
                  ))}
                </View>
              ) : null}
              {item.addons.length ? (
                <View style={styles.group}>
                  <AppText weight="bold" size={15}>{t('food.addons')}</AppText>
                  {item.addons.map((a) => (
                    <Option key={a.id} testID={`food-addon-${a.id}`} on={addons.includes(a.id)} label={nm(a)}
                      price={`+${formatMoney(a.price, item.currency, undefined, lang)}`}
                      onPress={() => setAddons(addons.includes(a.id) ? addons.filter((x) => x !== a.id) : [...addons, a.id])} />
                  ))}
                </View>
              ) : null}
              <View style={styles.group}>
                <AppText weight="bold" size={15}>{t('food.notes')}</AppText>
                <TextInput testID="food-item-notes" value={notes} onChangeText={setNotes} maxLength={240} placeholder={t('food.notes_ph')}
                  placeholderTextColor={colors.textDim} style={styles.notes} />
              </View>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.qty}>
              <Touchable testID="food-item-minus" onPress={() => setQty(Math.max(1, qty - 1))} style={styles.qBtn}><Minus color={GREEN} size={18} /></Touchable>
              <AppText weight="bold" size={16} testID="food-item-qty">{qty}</AppText>
              <Touchable testID="food-item-plus" onPress={() => setQty(Math.min(50, qty + 1))} style={styles.qBtn}><Plus color={GREEN} size={18} /></Touchable>
            </View>
            <View style={{ flex: 1 }}>
              <Button testID="food-item-add" color={GREEN} label={t('food.add_for', { price: formatMoney(unit * qty, item.currency, undefined, lang) })} onPress={add} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Option({ label, price, on, radio, onPress, testID }: { label: string; price: string; on: boolean; radio?: boolean; onPress: () => void; testID: string }) {
  return (
    <Touchable testID={testID} onPress={onPress} style={styles.option} scale={0.99} accessibilityState={{ checked: on }}>
      <View style={[styles.box, radio && { borderRadius: 11 }, on && { backgroundColor: GREEN, borderColor: GREEN }]}>{on ? <Check color="#000" size={14} strokeWidth={3} /> : null}</View>
      <AppText size={15} style={{ flex: 1 }}>{label}</AppText>
      <AppText size={14} color={colors.textMuted}>{price}</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: '#111113', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  img: { height: 200, backgroundColor: colors.surface2 },
  close: { position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  group: { marginTop: 16, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center' },
  notes: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15, outlineStyle: 'none' } as any,
  footer: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qty: { flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: GREEN },
  qBtn: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center' },
});
