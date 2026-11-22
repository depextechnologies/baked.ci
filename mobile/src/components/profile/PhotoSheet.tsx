import { Camera, ImageIcon, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors, radius, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

type Props = { open: boolean; hasPhoto: boolean; onClose: () => void; onPick: (src: 'camera' | 'library') => void; onRemove: () => void };

// Bottom sheet: take a photo, pick from the gallery, or remove the current photo.
export function PhotoSheet({ open, hasPhoto, onClose, onPick, onRemove }: Props) {
  const { t } = useApp();
  const rows = [
    ...(Platform.OS !== 'web' ? [{ id: 'camera', icon: Camera, label: t('profile.photo_camera'), on: () => onPick('camera') }] : []),
    { id: 'library', icon: ImageIcon, label: t('profile.photo_library'), on: () => onPick('library') },
    ...(hasPhoto ? [{ id: 'remove', icon: Trash2, label: t('profile.photo_remove'), on: onRemove, danger: true }] : []),
  ];
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} testID="photo-sheet-scrim" />
      <View style={styles.sheet} testID="photo-sheet">
        <AppText weight="bold" size={17} style={{ marginBottom: 8 }}>{t('profile.photo')}</AppText>
        {rows.map((r: any) => (
          <Touchable key={r.id} testID={`photo-sheet-${r.id}`} onPress={() => { onClose(); r.on(); }} style={styles.row} scale={0.99}>
            <r.icon color={r.danger ? colors.danger : colors.text} size={20} />
            <AppText weight="medium" size={15} color={r.danger ? colors.danger : colors.text}>{r.label}</AppText>
          </Touchable>
        ))}
        <Touchable testID="photo-sheet-cancel" onPress={onClose} style={[styles.row, { justifyContent: 'center' }]}>
          <AppText weight="semibold" size={15} color={colors.textMuted}>{t('common.cancel')}</AppText>
        </Touchable>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 18, paddingBottom: 34, gap: 4, borderTopWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 4 },
}));
