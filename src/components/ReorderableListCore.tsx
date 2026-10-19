import React, {
  Dispatch,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CellRendererProps,
  FlatList,
  FlatListProps,
  LayoutChangeEvent,
  Platform,
  ScrollView,
} from 'react-native';

import {
  Gesture,
  GestureDetector,
  GestureUpdateEvent,
  NativeGesture,
  PanGestureHandlerEventPayload,
  State,
} from 'react-native-gesture-handler';
import Animated, {
  AnimatedRef,
  Easing,
  SharedValue,
  measure,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useComposedEventHandler,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {ReorderableListContext} from '../contexts';
import {ReorderableListProps, ReorderableListState} from '../types';
import {
  AUTOSCROLL_CONFIG,
  OPACITY_ANIMATION_CONFIG_DEFAULT,
  SCALE_ANIMATION_CONFIG_DEFAULT,
} from './constants';
import {ReorderableListCell} from './ReorderableListCell';
import {usePropAsSharedValue, useStableCallback} from '../hooks';
import {deferIdleTask} from './helpers';

const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList,
) as unknown as <T>(
  props: FlatListProps<T> & {ref?: React.Ref<FlatList<T>>},
) => React.ReactElement;

interface ReorderableListCoreProps<T> extends ReorderableListProps<T> {
  // Not optional but undefined to force passing the prop.
  scrollViewContainerRef: RefObject<ScrollView> | undefined;
  scrollViewPageXY: SharedValue<number> | undefined;
  scrollViewSize: SharedValue<number> | undefined;
  scrollViewScrollOffsetXY: SharedValue<number> | undefined;
  scrollViewScrollEnabledProp: SharedValue<boolean> | undefined;
  setScrollViewForceDisableScroll:
    | Dispatch<SetStateAction<boolean>>
    | undefined;
  outerScrollGesture: NativeGesture | undefined;
  scrollable: boolean | undefined;
}

const ReorderableListCore = <T,>(
  {
    autoscrollThreshold = 0.1,
    autoscrollThresholdOffset,
    autoscrollSpeedScale = 1,
    // Deprecated: autoscroll is continuous, destructured to avoid passing it to the list.
    autoscrollDelay: _autoscrollDelay,
    autoscrollActivationDelta = 5,
    scrollToDroppedItemMargin = 32,
    animationDuration = 200,
    onLayout,
    onContentSizeChange,
    onReorder,
    onScroll,
    onDragStart,
    onDragEnd,
    onIndexChange,
    scrollViewContainerRef,
    scrollViewPageXY,
    scrollViewSize,
    scrollViewScrollOffsetXY,
    scrollViewScrollEnabledProp,
    setScrollViewForceDisableScroll,
    scrollable,
    outerScrollGesture,
    cellAnimations,
    dragEnabled = true,
    shouldUpdateActiveItem,
    itemLayoutAnimation,
    panGesture,
    panEnabled = true,
    panActivateAfterLongPress,
    renderDropIndicator,
    data,
    keyExtractor,
    ...rest
  }: ReorderableListCoreProps<T>,
  ref: React.ForwardedRef<FlatList<T>>,
) => {
  const scrollEnabled = rest.scrollEnabled ?? true;

  const flatListRef = useAnimatedRef<FlatList>();
  const markedCellsRef = useRef<Map<string, 1>>();
  const [activeIndex, setActiveIndex] = useState(-1);
  const prevItemCount = useRef(data.length);

  const [forceDisableScroll, setForceDisableScroll] = useState(false);
  const scrollEnabledProp = usePropAsSharedValue(scrollEnabled);
  const currentScrollEnabled = useSharedValue(scrollEnabled);

  const gestureState = useSharedValue<State>(State.UNDETERMINED);
  const currentXY = useSharedValue(0);
  const currentTranslationXY = useSharedValue(0);
  const currentItemDragCenterXY = useSharedValue<number | null>(null);
  const startItemDragCenterXY = useSharedValue<number>(0);
  // The list might start scrolled through the contentOffset prop, which doesn't emit a scroll event.
  const flatListScrollOffsetXY = useSharedValue(
    (rest.horizontal ? rest.contentOffset?.x : rest.contentOffset?.y) || 0,
  );
  const flatListSize = useSharedValue(0);
  const flatListContentSize = useSharedValue(0);
  const flatListPageXY = useSharedValue(0);
  // The scroll x or y translation of the list since drag start
  const dragScrollTranslationXY = useSharedValue(0);
  // The initial scroll offset x or y of the list on drag start
  const dragInitialScrollOffsetXY = useSharedValue(0);
  // The scroll x or y translation of the ScrollViewContainer since drag start
  const scrollViewDragScrollTranslationXY = useSharedValue(0);
  // The initial scroll offset x or y of the ScrollViewContainer on drag start
  const scrollViewDragInitialScrollOffsetXY = useSharedValue(0);
  const draggedSize = useSharedValue(0);
  const itemOffset = useSharedValue<number[]>([]);
  const itemSize = useSharedValue<number[]>([]);
  // We need to track data length since itemOffset and itemSize might contain more data than we need.
  // e.g. items are removed from the list, in which case layout data for those items is set to 0.
  const itemCount = useSharedValue(data.length);
  const dragXY = useSharedValue(0);
  const currentIndex = useSharedValue(-1);
  const draggedIndex = useSharedValue(-1);
  const state = useSharedValue<ReorderableListState>(ReorderableListState.IDLE);
  const dragEndHandlers = useSharedValue<
    ((from: number, to: number) => void)[][]
  >([]);
  const startXY = useSharedValue(0);
  const scaleDefault = useSharedValue(1);
  const opacityDefault = useSharedValue(1);
  const dragDirection = useSharedValue(0);
  const lastDragDirectionPivot = useSharedValue<number | null>(null);
  const dropIndicatorTranslationXY = useSharedValue(0);

  const itemLayoutAnimationPropRef = useRef(itemLayoutAnimation);
  itemLayoutAnimationPropRef.current = itemLayoutAnimation;

  const keyExtractorPropRef = useRef(keyExtractor);
  keyExtractorPropRef.current = keyExtractor;

  const animationDurationProp = usePropAsSharedValue(animationDuration);
  const autoscrollActivationDeltaProp = usePropAsSharedValue(
    autoscrollActivationDelta,
  );
  const scrollToDroppedItemMarginProp = usePropAsSharedValue(
    scrollToDroppedItemMargin,
  );
  const dragEnabledProp = usePropAsSharedValue(dragEnabled ?? true);
  const horizontalProp = usePropAsSharedValue(!!rest.horizontal);

  // Position of the list relative to the scroll container
  const nestedFlatListPositionXY = useDerivedValue(
    () => flatListPageXY.value - (scrollViewPageXY?.value || 0),
  );

  useEffect(() => {
    itemCount.value = data.length;

    // This could be done unmount of the removed cell, however it leads to bugs.
    // Surprisingly the unmount gets sometimes called after the onLayout event
    // setting all layout data to 0 and breaking the list. So we solve it like this.
    if (data.length < prevItemCount.current) {
      for (let i = data.length; i < prevItemCount.current; i++) {
        runOnUI(() => {
          itemSize.value[i] = 0;
          itemOffset.value[i] = 0;
        })();
      }
    }

    prevItemCount.current = data.length;
  }, [data.length, itemSize, itemOffset, itemCount]);

  useEffect(() => {
    if (
      !markedCellsRef.current ||
      // Clean keys once they surpass by 10% the size of the list itself.
      markedCellsRef.current.size <= data.length + Math.ceil(data.length * 0.1)
    ) {
      return;
    }

    // Can be heavy to loop through all items, defer the task to run after interactions.
    return deferIdleTask(() => {
      if (!markedCellsRef.current) {
        return;
      }

      const map = new Map<string, 1>();
      for (let i = 0; i < data.length; i++) {
        const key = keyExtractorPropRef.current?.(data[i], i) || i.toString();
        if (markedCellsRef.current.has(key)) {
          map.set(key, markedCellsRef.current.get(key)!);
        }
      }

      markedCellsRef.current = map;
    });
  }, [data]);

  const createCellKey = useCallback((cellKey: string) => {
    const mark = markedCellsRef.current?.get(cellKey) || 0;
    return `${cellKey}#${mark}`;
  }, []);

  const listContextValue = useMemo(
    () => ({
      draggedSize,
      currentIndex,
      draggedIndex,
      dragEndHandlers,
      activeIndex,
      dropIndicatorTranslationXY,
      itemLayoutAnimation: itemLayoutAnimationPropRef,
      horizontal: horizontalProp,
      cellAnimations: {
        ...cellAnimations,
        transform:
          cellAnimations && 'transform' in cellAnimations
            ? cellAnimations.transform
            : [{scale: scaleDefault}],
        opacity:
          cellAnimations && 'opacity' in cellAnimations
            ? cellAnimations.opacity
            : opacityDefault,
      },
    }),
    [
      draggedSize,
      currentIndex,
      dropIndicatorTranslationXY,
      draggedIndex,
      dragEndHandlers,
      activeIndex,
      cellAnimations,
      itemLayoutAnimationPropRef,
      scaleDefault,
      opacityDefault,
      horizontalProp,
    ],
  );

  /**
   * Decides the intended drag direction of the user.
   * This is used to to determine if the user intends to autoscroll
   * when within the threshold area.
   *
   * @param e - The payload of the pan gesture update event.
   */
  const setDragDirection = useCallback(
    (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
      'worklet';

      const absoluteXY = horizontalProp.value ? e.absoluteX : e.absoluteY;
      const velocityXY = horizontalProp.value ? e.velocityX : e.velocityY;

      const direction = velocityXY > 0 ? 1 : -1;
      if (direction !== dragDirection.value) {
        if (lastDragDirectionPivot.value === null) {
          lastDragDirectionPivot.value = absoluteXY;
        } else if (
          Math.abs(absoluteXY - lastDragDirectionPivot.value) >=
          autoscrollActivationDeltaProp.value
        ) {
          dragDirection.value = direction;
          lastDragDirectionPivot.value = absoluteXY;
        }
      }
    },
    [
      dragDirection,
      lastDragDirectionPivot,
      autoscrollActivationDeltaProp,
      horizontalProp,
    ],
  );

  const setCurrentItemDragCenterXY = useCallback(
    (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
      'worklet';

      const translationXY = horizontalProp.value
        ? e.translationX
        : e.translationY;

      if (currentItemDragCenterXY.value === null) {
        if (currentIndex.value >= 0) {
          const itemCenter = itemSize.value[currentIndex.value] * 0.5;
          // the x or y coordinate of the item relative to the list
          const itemXY =
            itemOffset.value[currentIndex.value] -
            (flatListScrollOffsetXY.value +
              scrollViewDragScrollTranslationXY.value);

          const value = itemXY + itemCenter + translationXY;
          startItemDragCenterXY.value = value;
          currentItemDragCenterXY.value = value;
        }
      } else {
        currentItemDragCenterXY.value =
          startItemDragCenterXY.value + translationXY;
      }
    },
    [
      horizontalProp,
      currentItemDragCenterXY,
      currentIndex,
      startItemDragCenterXY,
      itemOffset,
      itemSize,
      flatListScrollOffsetXY,
      scrollViewDragScrollTranslationXY,
    ],
  );

  const panGestureHandler = useMemo(
    () =>
      (panGesture || Gesture.Pan())
        .onBegin(e => {
          'worklet';

          // prevent new dragging until item is completely released
          if (state.value === ReorderableListState.IDLE) {
            const xy = horizontalProp.value ? e.x : e.y;
            const translationXY = horizontalProp.value
              ? e.translationX
              : e.translationY;

            startXY.value = xy;
            currentXY.value = xy;
            currentTranslationXY.value = translationXY;
            dragXY.value = translationXY;
            gestureState.value = e.state;
          }
        })
        .onUpdate(e => {
          'worklet';

          if (state.value === ReorderableListState.DRAGGED) {
            setDragDirection(e);
          }

          if (state.value !== ReorderableListState.RELEASED) {
            setCurrentItemDragCenterXY(e);

            const translationXY = horizontalProp.value
              ? e.translationX
              : e.translationY;

            currentXY.value = startXY.value + translationXY;
            currentTranslationXY.value = translationXY;
            dragXY.value =
              translationXY +
              dragScrollTranslationXY.value +
              scrollViewDragScrollTranslationXY.value;
            gestureState.value = e.state;
          }
        })
        .onEnd(e => {
          'worklet';

          gestureState.value = e.state;
        })
        .onTouchesUp(e => {
          'worklet';

          // A pan that never activates (e.g. long press and release without moving)
          // might not call onEnd and onFinalize, so release once all touches are lifted.
          if (e.numberOfTouches === 0) {
            gestureState.value = State.END;
          }
        })
        .onTouchesCancelled(e => {
          'worklet';

          if (e.numberOfTouches === 0) {
            gestureState.value = State.CANCELLED;
          }
        })
        .onFinalize(e => {
          'worklet';

          gestureState.value = e.state;
        }),
    [
      panGesture,
      state,
      startXY,
      currentXY,
      currentTranslationXY,
      dragXY,
      gestureState,
      dragScrollTranslationXY,
      scrollViewDragScrollTranslationXY,
      setDragDirection,
      setCurrentItemDragCenterXY,
      horizontalProp,
    ],
  );

  const panGestureHandlerWithPropOptions = useMemo(() => {
    if (typeof panActivateAfterLongPress === 'number') {
      panGestureHandler.activateAfterLongPress(panActivateAfterLongPress);
    }

    if (!panEnabled) {
      panGestureHandler.enabled(panEnabled);
    }

    return panGestureHandler;
  }, [panActivateAfterLongPress, panEnabled, panGestureHandler]);

  const gestureHandler = useMemo(
    () =>
      Gesture.Simultaneous(Gesture.Native(), panGestureHandlerWithPropOptions),
    [panGestureHandlerWithPropOptions],
  );

  const setScrollEnabled = useCallback(
    (enabled: boolean) => {
      currentScrollEnabled.value = enabled;

      // IMPORTANT:
      // On web setNativeProps API is not available, so disabling scroll is controlled by a state.
      // On Android/iOS we can keep using setNativeProps which performs better and doesn't require re-renders.
      if (Platform.OS === 'web') {
        setForceDisableScroll(!enabled);

        if (setScrollViewForceDisableScroll) {
          setScrollViewForceDisableScroll(!enabled);
        }
      } else {
        if (!enabled || scrollEnabledProp.value) {
          // We disable the scroll or when re-enabling the scroll of the container we set it back to the current prop value.
          flatListRef.current?.setNativeProps({scrollEnabled: enabled});
        }

        if (!enabled || scrollViewScrollEnabledProp?.value) {
          // We disable the scroll or when re-enabling the scroll of the container we set it back to the current prop value.
          scrollViewContainerRef?.current?.setNativeProps({
            scrollEnabled: enabled,
          });
        }
      }
    },
    [
      currentScrollEnabled,
      flatListRef,
      scrollEnabledProp,
      scrollViewContainerRef,
      scrollViewScrollEnabledProp,
      setScrollViewForceDisableScroll,
    ],
  );

  // Declared before the autoscroll frame callback since it's used by worklets defined earlier.
  const autoscrollFrameCallbackRef =
    useRef<ReturnType<typeof useFrameCallback>>();
  const setAutoscrollFrameCallbackActive = useCallback((active: boolean) => {
    autoscrollFrameCallbackRef.current?.setActive(active);
  }, []);

  const resetSharedValues = useCallback(() => {
    'worklet';

    state.value = ReorderableListState.IDLE;
    draggedIndex.value = -1;
    dragXY.value = 0;
    dragScrollTranslationXY.value = 0;
    scrollViewDragScrollTranslationXY.value = 0;
    dragDirection.value = 0;
    lastDragDirectionPivot.value = null;
    currentItemDragCenterXY.value = null;
  }, [
    state,
    draggedIndex,
    dragXY,
    dragScrollTranslationXY,
    scrollViewDragScrollTranslationXY,
    dragDirection,
    lastDragDirectionPivot,
    currentItemDragCenterXY,
  ]);

  const resetSharedValuesAfterAnimations = useCallback(() => {
    setTimeout(runOnUI(resetSharedValues), animationDurationProp.value);
  }, [resetSharedValues, animationDurationProp]);

  const markCells = (fromIndex: number, toIndex: number) => {
    if (!markedCellsRef.current) {
      markedCellsRef.current = new Map();
    }

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    for (let i = start; i <= end; i++) {
      const cellKey = keyExtractorPropRef.current?.(data[i], i) || i.toString();
      if (!markedCellsRef.current.has(cellKey)) {
        markedCellsRef.current.set(cellKey, 1);
      } else {
        markedCellsRef.current.delete(cellKey);
      }
    }
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    runOnUI(resetSharedValues)();

    if (fromIndex !== toIndex) {
      markCells(fromIndex, toIndex);
      onReorder({from: fromIndex, to: toIndex});
    }
  };

  const recomputeLayout = useCallback(
    (from: number, to: number) => {
      'worklet';

      const itemDirection = to > from;
      const index1 = itemDirection ? from : to;
      const index2 = itemDirection ? to : from;

      const newOffset1 = itemOffset.value[index1];
      const newSize1 = itemSize.value[index2];
      const newOffset2 =
        itemOffset.value[index2] +
        itemSize.value[index2] -
        itemSize.value[index1];
      const newSize2 = itemSize.value[index1];

      itemOffset.value[index1] = newOffset1;
      itemSize.value[index1] = newSize1;
      itemOffset.value[index2] = newOffset2;
      itemSize.value[index2] = newSize2;
    },
    [itemOffset, itemSize],
  );

  /**
   * Computes a potential new drop container for the current dragged item and evaluates
   * whether the dragged item center is nearer to the center of the current container or the new one.
   *
   * @returns The new index if the center of the dragged item is closer to the center of
   * the new drop container or the current index if closer to the current drop container.
   */
  const computeCurrentIndex = useCallback(() => {
    'worklet';

    if (currentItemDragCenterXY.value === null) {
      return currentIndex.value;
    }

    // Apply scroll offset and scroll container translation.
    const relativeDragCenterXY =
      flatListScrollOffsetXY.value +
      scrollViewDragScrollTranslationXY.value +
      currentItemDragCenterXY.value;

    const currentOffset = itemOffset.value[currentIndex.value];
    const currentSize = itemSize.value[currentIndex.value];
    const currentCenter = currentOffset + currentSize * 0.5;

    const max = itemCount.value;
    const possibleIndex =
      relativeDragCenterXY < currentCenter
        ? Math.max(0, currentIndex.value - 1)
        : Math.min(max - 1, currentIndex.value + 1);

    if (currentIndex.value !== possibleIndex) {
      let possibleOffset = itemOffset.value[possibleIndex];
      if (possibleIndex > currentIndex.value) {
        possibleOffset += itemSize.value[possibleIndex] - currentSize;
      }

      const possibleCenter = possibleOffset + currentSize * 0.5;
      const distanceFromCurrent = Math.abs(
        relativeDragCenterXY - currentCenter,
      );
      const distanceFromPossible = Math.abs(
        relativeDragCenterXY - possibleCenter,
      );

      return distanceFromCurrent <= distanceFromPossible
        ? currentIndex.value
        : possibleIndex;
    }

    return currentIndex.value;
  }, [
    currentIndex,
    currentItemDragCenterXY,
    itemCount,
    itemOffset,
    itemSize,
    flatListScrollOffsetXY,
    scrollViewDragScrollTranslationXY,
  ]);

  const setCurrentIndex = useCallback(() => {
    'worklet';

    const newIndex = computeCurrentIndex();

    if (currentIndex.value !== newIndex) {
      recomputeLayout(currentIndex.value, newIndex);

      currentIndex.value = newIndex;
      // After recomputing the layout we can update the drop indicator translation,
      // it now matches the offset for the new index.
      dropIndicatorTranslationXY.value = itemOffset.value[newIndex];

      onIndexChange?.({index: newIndex});
    }
  }, [
    currentIndex,
    dropIndicatorTranslationXY,
    itemOffset,
    computeCurrentIndex,
    recomputeLayout,
    onIndexChange,
  ]);

  const runDefaultDragAnimations = useCallback(
    (type: 'start' | 'end') => {
      'worklet';

      // if no custom scale run default
      if (!(cellAnimations && 'transform' in cellAnimations)) {
        const scaleConfig = SCALE_ANIMATION_CONFIG_DEFAULT[type];
        scaleDefault.value = withTiming(scaleConfig.toValue, scaleConfig);
      }

      // If no custom opacity run the default.
      if (!(cellAnimations && 'opacity' in cellAnimations)) {
        const opacityConfig = OPACITY_ANIMATION_CONFIG_DEFAULT[type];
        opacityDefault.value = withTiming(opacityConfig.toValue, opacityConfig);
      }
    },
    [cellAnimations, scaleDefault, opacityDefault],
  );

  const getThresholdOffset = useCallback(() => {
    'worklet';

    return {
      start: Math.max(
        0,
        autoscrollThresholdOffset?.start || autoscrollThresholdOffset?.top || 0,
      ),
      end: Math.max(
        0,
        autoscrollThresholdOffset?.end ||
          autoscrollThresholdOffset?.bottom ||
          0,
      ),
    };
  }, [autoscrollThresholdOffset]);

  const computeHiddenArea = useCallback(() => {
    'worklet';
    if (!scrollViewScrollOffsetXY || !scrollViewSize) {
      return {start: 0, end: 0};
    }

    // hidden area cannot be negative
    const start = Math.max(
      0,
      scrollViewScrollOffsetXY.value - nestedFlatListPositionXY.value,
    );
    const end = Math.max(
      0,
      nestedFlatListPositionXY.value +
        flatListSize.value -
        (scrollViewScrollOffsetXY.value + scrollViewSize.value),
    );

    return {start, end};
  }, [
    scrollViewScrollOffsetXY,
    scrollViewSize,
    nestedFlatListPositionXY,
    flatListSize,
  ]);

  const computeThresholdArea = useCallback(() => {
    'worklet';

    const hiddenArea = computeHiddenArea();

    const {start: offsetStart, end: offsetEnd} = getThresholdOffset();
    const threshold = Math.max(0, Math.min(autoscrollThreshold, 0.4));
    const visibleSize =
      flatListSize.value -
      (hiddenArea.start + hiddenArea.end) -
      (offsetStart + offsetEnd);

    const area = visibleSize * threshold;
    const start = area + offsetStart;
    const end = flatListSize.value - area - offsetEnd;

    return {start, end, size: area};
  }, [
    computeHiddenArea,
    getThresholdOffset,
    autoscrollThreshold,
    flatListSize,
  ]);

  const computeContainerThresholdArea = useCallback(() => {
    'worklet';
    if (!scrollViewSize) {
      return {start: -Infinity, end: Infinity, size: 0};
    }

    const {start: offsetStart, end: offsetEnd} = getThresholdOffset();
    const threshold = Math.max(0, Math.min(autoscrollThreshold, 0.4));
    const visibleSize = scrollViewSize.value - (offsetStart + offsetEnd);

    const area = visibleSize * threshold;
    const start = area + offsetStart;
    const end = scrollViewSize.value - area - offsetEnd;

    return {start, end, size: area};
  }, [getThresholdOffset, autoscrollThreshold, scrollViewSize]);

  const shouldScrollContainer = useCallback(
    (y: number) => {
      'worklet';
      const containerThresholdArea = computeContainerThresholdArea();
      const nestedListHiddenArea = computeHiddenArea();

      // We should scroll the container if there's a hidden part of the nested list.
      // We might have floating errors like 0.0001 which we should ignore.
      return (
        (nestedListHiddenArea.start > 0.01 &&
          y <= containerThresholdArea.start) ||
        (nestedListHiddenArea.end > 0.01 && y >= containerThresholdArea.end)
      );
    },
    [computeHiddenArea, computeContainerThresholdArea],
  );

  const getRelativeContainerXY = useCallback(() => {
    'worklet';

    return (
      currentXY.value +
      nestedFlatListPositionXY.value -
      scrollViewDragInitialScrollOffsetXY.value
    );
  }, [
    currentXY,
    nestedFlatListPositionXY,
    scrollViewDragInitialScrollOffsetXY,
  ]);

  const getRelativeListXY = useCallback(() => {
    'worklet';

    return currentXY.value + scrollViewDragScrollTranslationXY.value;
  }, [currentXY, scrollViewDragScrollTranslationXY]);

  /**
   * Computes how far the dragged item is into an autoscroll area.
   *
   * @returns The scroll direction (`-1`, `1` or `0` when outside the autoscroll areas)
   * and the depth into the area, from `0` at its inner edge to `1` at its outer edge.
   */
  const computeAutoscroll = useCallback(() => {
    'worklet';

    let xy = 0;
    let area = {start: 0, end: 0, size: 0};

    const relativeContainerXY = getRelativeContainerXY();
    if (shouldScrollContainer(relativeContainerXY)) {
      xy = relativeContainerXY;
      area = computeContainerThresholdArea();
    } else if (scrollable) {
      xy = getRelativeListXY();
      area = computeThresholdArea();
    } else {
      return {direction: 0, depth: 0};
    }

    let direction = 0;
    let distance = 0;
    if (xy <= area.start) {
      direction = -1;
      distance = area.start - xy;
    } else if (xy >= area.end) {
      direction = 1;
      distance = xy - area.end;
    }

    const depth =
      area.size > 0 ? Math.min(1, Math.max(0, distance / area.size)) : 1;

    return {direction, depth};
  }, [
    shouldScrollContainer,
    computeThresholdArea,
    computeContainerThresholdArea,
    getRelativeContainerXY,
    getRelativeListXY,
    scrollable,
  ]);

  useAnimatedReaction(
    () => currentXY.value,
    () => {
      if (
        state.value === ReorderableListState.DRAGGED ||
        state.value === ReorderableListState.AUTOSCROLL
      ) {
        setCurrentIndex();
      }
    },
  );

  const contentInsetStart = rest.horizontal
    ? rest.contentInset?.left || 0
    : rest.contentInset?.top || 0;
  const contentInsetEnd = rest.horizontal
    ? rest.contentInset?.right || 0
    : rest.contentInset?.bottom || 0;

  // Runs on every frame while dragging. Enters autoscroll mode while the dragged item is
  // within an autoscroll area, after being dragged towards it, and scrolls at a speed
  // that increases with the depth into the area.
  // While autoscrolling, the frame callback owns the scroll offsets and the scroll
  // handlers do not update them, scroll events might arrive late with stale values.
  const autoscrollFrameCallback = useFrameCallback(frameInfo => {
    'worklet';

    if (
      state.value !== ReorderableListState.DRAGGED &&
      state.value !== ReorderableListState.AUTOSCROLL
    ) {
      return;
    }

    if (
      state.value === ReorderableListState.AUTOSCROLL &&
      scrollViewScrollOffsetXY
    ) {
      // Scroll events of the container might be stale, restore the offset of the last autoscroll step.
      scrollViewScrollOffsetXY.value =
        scrollViewDragInitialScrollOffsetXY.value +
        scrollViewDragScrollTranslationXY.value;
    }

    const {direction, depth} = computeAutoscroll();

    // Autoscroll when:
    // 1. Within the threshold area (start or end of list)
    // 2. Have dragged in the same direction as the scroll
    if (direction === 0 || dragDirection.value !== direction) {
      if (state.value === ReorderableListState.AUTOSCROLL) {
        state.value = ReorderableListState.DRAGGED;
      }

      return;
    }

    if (state.value !== ReorderableListState.AUTOSCROLL) {
      state.value = ReorderableListState.AUTOSCROLL;
    }

    // Ease in so that the speed changes gently near the inner edge of the area.
    const speed =
      (AUTOSCROLL_CONFIG.minSpeed +
        (AUTOSCROLL_CONFIG.maxSpeed - AUTOSCROLL_CONFIG.minSpeed) *
          depth *
          depth) *
      autoscrollSpeedScale;
    // The time since the previous frame can occasionally be negative,
    // which would briefly reverse the scroll direction and cause jitter.
    const frameDelta = Math.max(
      0,
      Math.min(
        frameInfo.timeSincePreviousFrame ?? AUTOSCROLL_CONFIG.defaultFrameDelta,
        AUTOSCROLL_CONFIG.maxFrameDelta,
      ),
    );
    let delta = (direction * speed * frameDelta) / 1000;

    // Checking on every frame whether to scroll the container,
    // this allows to smoothly pass the scroll from the container to the nested list
    // without any gesture input.
    if (
      scrollViewScrollOffsetXY &&
      shouldScrollContainer(getRelativeContainerXY())
    ) {
      // Don't scroll the container past the edges of the nested list.
      const hiddenArea = computeHiddenArea();
      delta =
        direction > 0
          ? Math.min(delta, hiddenArea.end)
          : Math.max(delta, -hiddenArea.start);

      const scrollToValue = scrollViewScrollOffsetXY.value + delta;

      scrollViewScrollOffsetXY.value = scrollToValue;
      scrollViewDragScrollTranslationXY.value =
        scrollToValue - scrollViewDragInitialScrollOffsetXY.value;

      scrollTo(
        scrollViewContainerRef as unknown as AnimatedRef<Animated.ScrollView>,
        horizontalProp.value ? scrollToValue : 0,
        horizontalProp.value ? 0 : scrollToValue,
        false,
      );
    } else if (scrollable) {
      const minOffset = -contentInsetStart;
      const maxOffset = Math.max(
        minOffset,
        flatListContentSize.value - flatListSize.value + contentInsetEnd,
      );
      const offset = flatListScrollOffsetXY.value;
      const scrollToValue = Math.min(
        maxOffset,
        Math.max(minOffset, offset + delta),
      );

      if (scrollToValue === offset) {
        return;
      }

      flatListScrollOffsetXY.value = scrollToValue;
      dragScrollTranslationXY.value =
        scrollToValue - dragInitialScrollOffsetXY.value;

      scrollTo(
        flatListRef as unknown as AnimatedRef<Animated.ScrollView>,
        horizontalProp.value ? scrollToValue : 0,
        horizontalProp.value ? 0 : scrollToValue,
        false,
      );
    } else {
      return;
    }

    // During autoscroll the user can keep the dragged item stationary in
    // the autoscroll area. We need to update the current item index and
    // the item position on every scroll step. See issue #68 for details.
    setCurrentIndex();

    dragXY.value =
      currentTranslationXY.value +
      dragScrollTranslationXY.value +
      scrollViewDragScrollTranslationXY.value;
  }, false);

  autoscrollFrameCallbackRef.current = autoscrollFrameCallback;

  /**
   * Scrolls the list, or the container for a non scrollable nested list, so that the
   * dropped item is entirely visible within the area not covered by the threshold offsets.
   */
  const scrollToDroppedItem = useCallback(() => {
    'worklet';

    const slotStart = itemOffset.value[currentIndex.value];
    const slotSize = itemSize.value[currentIndex.value];
    if (slotStart === undefined || slotSize === undefined) {
      return;
    }

    const thresholdOffset = getThresholdOffset();

    // Computes the scroll offset that brings the item into view, keeping a margin around it
    // so that the neighboring items are partially visible. When the item and its margins
    // don't fit in the visible area, the margin is reduced and the item start is aligned.
    const computeTarget = (
      offset: number,
      viewportSize: number,
      itemStart: number,
    ) => {
      'worklet';

      const visibleSize =
        viewportSize - thresholdOffset.start - thresholdOffset.end;
      const margin = Math.max(
        0,
        Math.min(
          scrollToDroppedItemMarginProp.value,
          (visibleSize - slotSize) / 2,
        ),
      );
      const visibleStart = offset + thresholdOffset.start + margin;
      const visibleEnd = offset + viewportSize - thresholdOffset.end - margin;
      const itemEnd = itemStart + slotSize;

      if (itemStart < visibleStart || slotSize > visibleEnd - visibleStart) {
        return itemStart - thresholdOffset.start - margin;
      }

      if (itemEnd > visibleEnd) {
        return itemEnd - viewportSize + thresholdOffset.end + margin;
      }

      return offset;
    };

    if (scrollable) {
      const offset = flatListScrollOffsetXY.value;
      const minOffset = -contentInsetStart;
      const maxOffset = Math.max(
        minOffset,
        flatListContentSize.value - flatListSize.value + contentInsetEnd,
      );
      const target = Math.min(
        maxOffset,
        Math.max(
          minOffset,
          computeTarget(offset, flatListSize.value, slotStart),
        ),
      );

      if (Math.abs(target - offset) > 0.5) {
        scrollTo(
          flatListRef as unknown as AnimatedRef<Animated.ScrollView>,
          horizontalProp.value ? target : 0,
          horizontalProp.value ? 0 : target,
          true,
        );
      }
    } else if (scrollViewScrollOffsetXY && scrollViewSize) {
      const offset = scrollViewScrollOffsetXY.value;
      // Don't scroll the container past the edges of the nested list.
      const hiddenArea = computeHiddenArea();
      const target = Math.min(
        offset + hiddenArea.end,
        Math.max(
          offset - hiddenArea.start,
          computeTarget(
            offset,
            scrollViewSize.value,
            nestedFlatListPositionXY.value + slotStart,
          ),
        ),
      );

      if (Math.abs(target - offset) > 0.5) {
        scrollTo(
          scrollViewContainerRef as unknown as AnimatedRef<Animated.ScrollView>,
          horizontalProp.value ? target : 0,
          horizontalProp.value ? 0 : target,
          true,
        );
      }
    }
  }, [
    itemOffset,
    itemSize,
    currentIndex,
    getThresholdOffset,
    scrollToDroppedItemMarginProp,
    scrollable,
    flatListScrollOffsetXY,
    contentInsetStart,
    contentInsetEnd,
    flatListContentSize,
    flatListSize,
    flatListRef,
    horizontalProp,
    scrollViewScrollOffsetXY,
    scrollViewSize,
    computeHiddenArea,
    nestedFlatListPositionXY,
    scrollViewContainerRef,
  ]);

  useAnimatedReaction(
    () => gestureState.value,
    () => {
      if (
        gestureState.value !== State.ACTIVE &&
        gestureState.value !== State.BEGAN &&
        (state.value === ReorderableListState.DRAGGED ||
          state.value === ReorderableListState.AUTOSCROLL)
      ) {
        state.value = ReorderableListState.RELEASED;

        // enable back scroll on releasing
        runOnJS(setScrollEnabled)(true);
        runOnJS(setAutoscrollFrameCallbackActive)(false);

        if (shouldUpdateActiveItem) {
          runOnJS(setActiveIndex)(-1);
        }

        // Trigger onDragEnd event.
        let e = {from: draggedIndex.value, to: currentIndex.value};
        onDragEnd?.(e);

        const handlers = dragEndHandlers.value[draggedIndex.value];
        if (Array.isArray(handlers)) {
          handlers.forEach(fn => fn(e.from, e.to));
        }

        // they are actually swapped on drag translation
        const currentItemOffset = itemOffset.value[draggedIndex.value];
        const currentItemSize = itemSize.value[draggedIndex.value];
        const draggedItemOffset = itemOffset.value[currentIndex.value];
        const draggedItemSize = itemSize.value[currentIndex.value];

        const newPositionXY =
          currentIndex.value > draggedIndex.value
            ? draggedItemOffset - currentItemOffset
            : draggedItemOffset -
              currentItemOffset +
              (draggedItemSize - currentItemSize);

        runDefaultDragAnimations('end');
        scrollToDroppedItem();

        if (dragXY.value !== newPositionXY) {
          // Animate dragged item to its new position on release.
          dragXY.value = withTiming(
            newPositionXY,
            {
              duration: animationDurationProp.value,
              easing: Easing.out(Easing.ease),
            },
            () => {
              runOnJS(reorder)(draggedIndex.value, currentIndex.value);
            },
          );
        } else {
          // User might drag and release the item without moving it so,
          // since the animation end callback is not executed in that case
          // we need to reset values as the reorder function would do.
          runOnJS(resetSharedValuesAfterAnimations)();
        }
      }
    },
  );

  // flatlist scroll handler
  const handleScroll = useAnimatedScrollHandler(e => {
    flatListContentSize.value = horizontalProp.value
      ? e.contentSize.width
      : e.contentSize.height;

    // The autoscroll frame callback owns the scroll offset while autoscrolling.
    if (state.value === ReorderableListState.AUTOSCROLL) {
      return;
    }

    flatListScrollOffsetXY.value = horizontalProp.value
      ? e.contentOffset.x
      : e.contentOffset.y;

    // Checking if the list is not scrollable instead of the scrolling state.
    // Fixes a bug on iOS where the item is shifted after autoscrolling and then
    // moving away from the area.
    if (!currentScrollEnabled.value) {
      dragScrollTranslationXY.value =
        flatListScrollOffsetXY.value - dragInitialScrollOffsetXY.value;
    }
  });

  // container scroll handler
  useAnimatedReaction(
    () => scrollViewScrollOffsetXY?.value,
    value => {
      // The autoscroll frame callback owns the scroll offset while autoscrolling.
      if (value && state.value !== ReorderableListState.AUTOSCROLL) {
        // Checking if the list is not scrollable instead of the scrolling state.
        // Fixes a bug on iOS where the item is shifted, after autoscrolling and then
        // moving away from the area.
        if (!currentScrollEnabled.value) {
          scrollViewDragScrollTranslationXY.value =
            value - scrollViewDragInitialScrollOffsetXY.value;
        }
      }
    },
  );

  const startDrag = useCallback(
    (index: number) => {
      'worklet';

      if (!dragEnabledProp.value) {
        return;
      }

      // Allow new drag when item is completely released.
      if (state.value === ReorderableListState.IDLE) {
        // Resetting shared values again fixes a flickeing bug in nested lists where
        // after scrolling the parent list it would offset the new dragged item in another nested list.
        resetSharedValues();

        if (shouldUpdateActiveItem) {
          runOnJS(setActiveIndex)(index);
        }

        dragInitialScrollOffsetXY.value = flatListScrollOffsetXY.value;
        scrollViewDragInitialScrollOffsetXY.value =
          scrollViewScrollOffsetXY?.value || 0;

        draggedSize.value = itemSize.value[index];
        dropIndicatorTranslationXY.value = itemOffset.value[index];
        draggedIndex.value = index;
        currentIndex.value = index;
        state.value = ReorderableListState.DRAGGED;

        runOnJS(setScrollEnabled)(false);
        runOnJS(setAutoscrollFrameCallbackActive)(true);

        // run animation before onDragStart to avoid potentially waiting for it
        runDefaultDragAnimations('start');
        onDragStart?.({index});
      }
    },
    [
      dragEnabledProp,
      resetSharedValues,
      shouldUpdateActiveItem,
      dragInitialScrollOffsetXY,
      scrollViewScrollOffsetXY,
      scrollViewDragInitialScrollOffsetXY,
      setScrollEnabled,
      setAutoscrollFrameCallbackActive,
      currentIndex,
      dropIndicatorTranslationXY,
      itemOffset,
      draggedSize,
      draggedIndex,
      state,
      flatListScrollOffsetXY,
      itemSize,
      onDragStart,
      runDefaultDragAnimations,
    ],
  );

  const handleFlatListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      flatListSize.value = horizontalProp.value
        ? e.nativeEvent.layout.width
        : e.nativeEvent.layout.height;

      // If nested in a scroll container.
      if (scrollViewScrollOffsetXY) {
        // Timeout fixes a bug where measure returns width or height 0.
        setTimeout(() => {
          runOnUI(() => {
            const measurement = measure(flatListRef);
            if (!measurement) {
              return;
            }

            const pageXY = horizontalProp.value
              ? measurement.pageX
              : measurement.pageY;

            // We need to use pageY because the list might be nested into other views,
            // It's important that we take the measurement of the list without any scroll offset
            // from the scroll container.
            flatListPageXY.value =
              pageXY + (scrollViewScrollOffsetXY?.value || 0);
          })();
        }, 100);
      }

      onLayout?.(e);
    },
    [
      flatListRef,
      flatListPageXY,
      flatListSize,
      horizontalProp,
      scrollViewScrollOffsetXY,
      onLayout,
    ],
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      flatListContentSize.value = horizontalProp.value ? width : height;
      onContentSizeChange?.(width, height);
    },
    [flatListContentSize, horizontalProp, onContentSizeChange],
  );

  const handleRef = useCallback(
    (value: FlatList<T>) => {
      flatListRef(value);

      if (typeof ref === 'function') {
        ref(value);
      } else if (ref) {
        ref.current = value;
      }
    },
    [flatListRef, ref],
  );

  const combinedGesture = useMemo(() => {
    // Android is able to handle nested scroll view, but not the full size ones like iOS.
    if (outerScrollGesture && !(Platform.OS === 'android' && scrollable)) {
      return Gesture.Simultaneous(outerScrollGesture, gestureHandler);
    }

    return gestureHandler;
  }, [scrollable, outerScrollGesture, gestureHandler]);

  const composedScrollHandler = useComposedEventHandler([
    handleScroll,
    onScroll || null,
  ]);

  const renderAnimatedCell = useStableCallback(
    ({cellKey, ...props}: CellRendererProps<T>) => (
      <ReorderableListCell
        {...props}
        // forces remount with key change on reorder
        key={createCellKey(cellKey)}
        itemOffset={itemOffset}
        itemSize={itemSize}
        dragXY={dragXY}
        draggedIndex={draggedIndex}
        animationDuration={animationDurationProp}
        startDrag={startDrag}
        renderDropIndicator={renderDropIndicator}
      />
    ),
  );

  return (
    <ReorderableListContext.Provider value={listContextValue}>
      <GestureDetector gesture={combinedGesture}>
        <AnimatedFlatList
          {...rest}
          ref={handleRef}
          data={data}
          keyExtractor={keyExtractor}
          CellRendererComponent={renderAnimatedCell}
          onLayout={handleFlatListLayout}
          onContentSizeChange={handleContentSizeChange}
          onScroll={composedScrollHandler}
          scrollEventThrottle={1}
          removeClippedSubviews={false}
          numColumns={1}
          // We force disable scroll or let the component prop control it.
          scrollEnabled={forceDisableScroll ? false : scrollEnabled}
        />
      </GestureDetector>
    </ReorderableListContext.Provider>
  );
};

const MemoizedReorderableListCore = React.memo(
  React.forwardRef(ReorderableListCore),
) as <T>(
  props: ReorderableListCoreProps<T> & {
    ref?: React.ForwardedRef<FlatList<T> | null>;
  },
) => React.ReactElement;

export {MemoizedReorderableListCore as ReorderableListCore};
