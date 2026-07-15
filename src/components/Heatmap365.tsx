import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { EntryMap } from '../types';
import { buildHeatmapWeeks, formatDisplayDate, parseDateKey, WeekStart } from '../utils/date';

const CELL = 14;
const GAP = 3;
const DEFAULT_LEVELS = ['#FFFFFF', '#DBEAFE', '#93C5FD', '#3B82F6', '#1D4ED8'];

function intensity(value: number, maxValue: number, levelCount: number): number {
  if (value <= 0) return 0;
  if (maxValue <= 1) return levelCount - 1;
  const scaled = Math.ceil((value / maxValue) * (levelCount - 1));
  return Math.max(1, Math.min(levelCount - 1, scaled));
}

type Heatmap365Props = {
  entries: EntryMap;
  selectedDateKey: string;
  levels: string[];
  weekStartsOn: WeekStart;
  days: number;
  onSelectDate: (dateKey: string) => void;
};

export function Heatmap365({
  entries,
  selectedDateKey,
  levels = DEFAULT_LEVELS,
  weekStartsOn = 'monday',
  days = 365,
  onSelectDate,
}: Heatmap365Props) {
  const scrollRef = useRef<ScrollView>(null);
  const weeks = useMemo(() => buildHeatmapWeeks(undefined, days, weekStartsOn), [days, weekStartsOn]);
  const maxValue = useMemo(() => Math.max(0, ...Object.values(entries)), [entries]);
  const dayLabels = weekStartsOn === 'sunday' ? ['S', 'M', '', 'W', '', 'F', ''] : ['M', '', 'W', '', 'F', '', 'S'];

  return (
    <View>
      <View style={styles.chartRow}>
        <View style={styles.dayLabels}>
          {dayLabels.map((label, index) => (
            <Text key={`${label}-${index}`} style={styles.dayLabel}>{label}</Text>
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={styles.scrollContent}
        >
          <View>
            <View style={styles.monthRow}>
              {weeks.map((week, weekIndex) => {
                const marker = week.find((cell) => cell.inRange && cell.date.getDate() <= 7);
                return (
                  <View key={`month-${weekIndex}`} style={styles.monthSlot}>
                    {marker ? (
                      <Text style={styles.monthLabel} numberOfLines={1}>
                        {new Intl.DateTimeFormat(undefined, { month: 'short' }).format(marker.date)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.weeksRow}>
              {weeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.weekColumn}>
                  {week.map((cell) => {
                    const value = entries[cell.key] ?? 0;
                    const selected = selectedDateKey === cell.key;
                    return (
                      <Pressable
                        key={cell.key}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatDisplayDate(parseDateKey(cell.key))}, value ${value}`}
                        disabled={!cell.inRange}
                        onPress={() => onSelectDate(cell.key)}
                        style={[
                          styles.cell,
                          {
                            backgroundColor: cell.inRange ? levels[intensity(value, maxValue, levels.length)] : 'transparent',
                            borderColor: selected ? '#111827' : cell.inRange ? '#D1D5DB' : 'transparent',
                            borderWidth: selected ? 2 : 1,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legendText}>Less</Text>
        {levels.map((color) => (
          <View key={color} style={[styles.legendCell, { backgroundColor: color }]} />
        ))}
        <Text style={styles.legendText}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  dayLabels: {
    paddingTop: 22,
    paddingRight: 7,
    gap: GAP,
  },
  dayLabel: {
    width: 12,
    height: CELL,
    fontSize: 9,
    lineHeight: CELL,
    color: '#6B7280',
    textAlign: 'center',
  },
  scrollContent: {
    paddingRight: 2,
  },
  monthRow: {
    flexDirection: 'row',
    height: 20,
  },
  monthSlot: {
    width: CELL + GAP,
    overflow: 'visible',
  },
  monthLabel: {
    width: 34,
    fontSize: 10,
    color: '#6B7280',
  },
  weeksRow: {
    flexDirection: 'row',
    gap: GAP,
  },
  weekColumn: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  legendCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  legendText: {
    fontSize: 10,
    color: '#6B7280',
  },
});
