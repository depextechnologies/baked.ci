import { Redirect } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestaurantCard, type Restaurant } from '@/components/commerce/RestaurantCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors } from '@/theme';

export default function Favourites() {
  const { t } = useApp();
  const { isAuthed } = useSession();
  const { data, loading, error, reload } = useFetch<{ restaurants: Restaurant[] }>(isAuthed ? '/food/customer/favourites' : null);
  if (!isAuthed) return <Redirect href="/login?redirect=/food/favourites" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} testID="food-favourites-screen">
      <ScreenHeader title={t('food.favourites')} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
        {error ? <ErrorView onRetry={reload} /> : loading ? <Skeleton h={220} />
          : !data?.restaurants.length ? <StateView testID="food-favourites-empty" title={t('food.no_favourites')} />
            : data.restaurants.map((r) => <RestaurantCard key={r.id} r={r} />)}
      </ScrollView>
    </SafeAreaView>
  );
}
