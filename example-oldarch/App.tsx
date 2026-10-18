import React, {memo, useState} from 'react';
import {
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {StatusBar} from 'expo-status-bar';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import ReorderableList, {
  NestedReorderableList,
  ReorderableListReorderEvent,
  ScrollViewContainer,
  reorderItems,
  useReorderableDrag,
} from 'react-native-reorderable-list';

type SectionKind = 'Title' | 'Heading' | 'Image' | 'Text' | 'Audio';

interface Section {
  id: string;
  kind: SectionKind;
  // Fraction of the screen height.
  heightRatio: number;
}

const KINDS: SectionKind[] = ['Heading', 'Image', 'Text', 'Audio', 'Image'];
const COLORS: Record<SectionKind, string> = {
  Title: '#ffedd5',
  Heading: '#fef3c7',
  Image: '#dbeafe',
  Text: '#f3f4f6',
  Audio: '#dcfce7',
};

const seedData: Section[] = [
  {id: '0', kind: 'Title', heightRatio: 0.15},
  ...Array.from({length: 24}, (_, i) => ({
    id: String(i + 1),
    kind: KINDS[i % KINDS.length],
    heightRatio: [0.25, 0.4, 0.3, 0.2, 0.35][i % 5],
  })),
];

const HEADER_HEIGHT = 56;
const TOOLBAR_HEIGHT = 64;

const SectionCard: React.FC<Section> = memo(({id, kind, heightRatio}) => {
  const drag = useReorderableDrag();
  const {height} = useWindowDimensions();

  return (
    <Pressable
      onLongPress={drag}
      delayLongPress={200}
      style={[
        styles.card,
        {height: height * heightRatio, backgroundColor: COLORS[kind]},
      ]}>
      <Text style={styles.cardTitle}>
        {kind} #{id}
      </Text>
      <Text style={styles.cardHint}>Long press to drag</Text>
    </Pressable>
  );
});

const renderItem = ({item}: ListRenderItemInfo<Section>) => (
  <SectionCard {...item} />
);

const keyExtractor = (item: Section) => item.id;

const Composer = () => {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(seedData);
  const [nested, setNested] = useState(false);

  const handleReorder = ({from, to}: ReorderableListReorderEvent) => {
    setData(value => reorderItems(value, from, to));
  };

  const headerHeight = insets.top + HEADER_HEIGHT;
  const toolbarHeight = insets.bottom + TOOLBAR_HEIGHT;

  // The header and toolbar float above the list, like the post composer.
  const thresholdOffset = {start: headerHeight, end: toolbarHeight};
  const contentContainerStyle = {
    paddingTop: headerHeight,
    paddingBottom: toolbarHeight,
  };

  return (
    <View style={styles.screen}>
      {nested ? (
        <ScrollViewContainer
          style={styles.screen}
          contentContainerStyle={contentContainerStyle}>
          <View style={styles.nestedHeader}>
            <Text style={styles.cardTitle}>Content above the list</Text>
          </View>
          <NestedReorderableList
            data={data}
            onReorder={handleReorder}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            autoscrollThresholdOffset={thresholdOffset}
            scrollable={false}
          />
        </ScrollViewContainer>
      ) : (
        <ReorderableList
          data={data}
          onReorder={handleReorder}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={contentContainerStyle}
          autoscrollThresholdOffset={thresholdOffset}
        />
      )}

      <View
        style={[styles.header, {height: headerHeight, paddingTop: insets.top}]}>
        <Text style={styles.headerTitle}>New post</Text>
        <Pressable
          onPress={() => setNested(value => !value)}
          style={styles.toggle}>
          <Text style={styles.toggleText}>
            {nested ? 'Mode: nested' : 'Mode: list'}
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.toolbar,
          {height: toolbarHeight, paddingBottom: insets.bottom},
        ]}>
        <Text style={styles.toolbarText}>Toolbar</Text>
      </View>
    </View>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Composer />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'white',
  },
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  cardHint: {
    marginTop: 4,
    color: '#6b7280',
  },
  nestedHeader: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fae8ff',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f97316',
  },
  toggleText: {
    color: 'white',
    fontWeight: '600',
  },
  toolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  toolbarText: {
    color: '#6b7280',
  },
});
