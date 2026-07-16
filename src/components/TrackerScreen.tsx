import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../lib/supabase';
import { appStorage } from '../lib/storage';
import {
  createTrackingItem,
  deleteAccount,
  deleteTrackingItem,
  fetchCloudEntries,
  fetchTrackingItems,
  flushPendingEntries,
  queuePendingEntry,
  readCachedEntries,
  readPendingEntries,
  renameTrackingItem,
  syncOneEntry,
  writeCachedEntries,
} from '../services/entries';
import type { CommentMap, EntryBundle, EntryMap, PendingEntryMap, TrackingItem } from '../types';
import {
  addDays,
  compareDateKeys,
  formatDateKey,
  formatDisplayDate,
  getRollingDateKeys,
  parseDateKey,
  todayLocal,
  WeekStart,
} from '../utils/date';
import { Heatmap365 } from './Heatmap365';

type TrackerScreenProps = {
  user: User;
};

type StatsWindow = 30 | 90 | 365;

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const QUICK_COLORS: RgbColor[] = [
  { r: 37, g: 99, b: 235 },
  { r: 34, g: 197, b: 94 },
  { r: 139, g: 92, b: 246 },
  { r: 249, g: 115, b: 22 },
  { r: 239, g: 68, b: 68 },
  { r: 20, g: 184, b: 166 },
  { r: 236, g: 72, b: 153 },
  { r: 17, g: 24, b: 39 },
];

function settingsKey(userId: string): string {
  return `settings:${userId}`;
}

function clampRgb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbString(color: RgbColor): string {
  return `rgb(${clampRgb(color.r)}, ${clampRgb(color.g)}, ${clampRgb(color.b)})`;
}

function mixWithWhite(color: RgbColor, amount: number): string {
  const r = Math.round(255 - (255 - clampRgb(color.r)) * amount);
  const g = Math.round(255 - (255 - clampRgb(color.g)) * amount);
  const b = Math.round(255 - (255 - clampRgb(color.b)) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function heatmapLevelsFromRgb(color: RgbColor): string[] {
  return ['#FFFFFF', mixWithWhite(color, 0.22), mixWithWhite(color, 0.46), mixWithWhite(color, 0.72), rgbString(color)];
}

function mergePending(base: EntryBundle, pending: PendingEntryMap): EntryBundle {
  const entries = { ...base.entries };
  const comments = { ...base.comments };
  for (const [key, entry] of Object.entries(pending)) {
    if (entry.value <= 0) {
      delete entries[key];
      delete comments[key];
    } else {
      entries[key] = entry.value;
      if (entry.comment) comments[key] = entry.comment;
      else delete comments[key];
    }
  }
  return { entries, comments };
}

export function TrackerScreen({ user }: TrackerScreenProps) {
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [entries, setEntries] = useState<EntryMap>({});
  const [comments, setComments] = useState<CommentMap>({});
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [inputValue, setInputValue] = useState('0');
  const [commentValue, setCommentValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [heatmapColor, setHeatmapColor] = useState<RgbColor>({ r: 37, g: 99, b: 235 });
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>('monday');
  const [statsWindow, setStatsWindow] = useState<StatsWindow>(365);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');
  const [pendingCount, setPendingCount] = useState(0);
  const [renameValue, setRenameValue] = useState('');
  const [manageItemId, setManageItemId] = useState('');

  const selectedKey = formatDateKey(selectedDate);
  const todayKey = formatDateKey(todayLocal());
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const manageItem = items.find((item) => item.id === manageItemId);
  const otherItems = items.filter((item) => item.id !== selectedItemId);
  const heatmapDays = statsWindow;
  const heatmapLevels = heatmapLevelsFromRgb(heatmapColor);
  const theme = darkMode
    ? {
        page: '#0B1120',
        card: '#111827',
        cardSoft: '#1F2937',
        text: '#F9FAFB',
        muted: '#9CA3AF',
        border: '#374151',
        input: '#0F172A',
        primary: '#60A5FA',
      }
    : {
        page: '#F7F8FA',
        card: '#FFFFFF',
        cardSoft: '#F9FAFB',
        text: '#111827',
        muted: '#6B7280',
        border: '#E5E7EB',
        input: '#FFFFFF',
        primary: '#2563EB',
      };

  const applyEntries = useCallback(
    async (next: EntryBundle) => {
      if (!selectedItemId) return;
      setEntries(next.entries);
      setComments(next.comments);
      await writeCachedEntries(user.id, selectedItemId, next);
    },
    [selectedItemId, user.id],
  );

  useEffect(() => {
    appStorage.getItem(settingsKey(user.id)).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as {
          darkMode?: boolean;
          paletteId?: string;
          heatmapColor?: RgbColor;
          weekStartsOn?: WeekStart;
          statsWindow?: StatsWindow;
          reminderEnabled?: boolean;
          reminderTime?: string;
        };
        if (typeof saved.darkMode === 'boolean') setDarkMode(saved.darkMode);
        if (saved.heatmapColor) {
          setHeatmapColor({
            r: clampRgb(saved.heatmapColor.r),
            g: clampRgb(saved.heatmapColor.g),
            b: clampRgb(saved.heatmapColor.b),
          });
        }
        if (saved.weekStartsOn === 'monday' || saved.weekStartsOn === 'sunday') setWeekStartsOn(saved.weekStartsOn);
        if (saved.statsWindow === 30 || saved.statsWindow === 90 || saved.statsWindow === 365) setStatsWindow(saved.statsWindow);
        if (typeof saved.reminderEnabled === 'boolean') setReminderEnabled(saved.reminderEnabled);
        if (saved.reminderTime && /^\d\d:\d\d$/.test(saved.reminderTime)) setReminderTime(saved.reminderTime);
      } catch {
        // Ignore invalid local settings.
      }
    });
  }, [user.id]);

  useEffect(() => {
    const next = { darkMode, heatmapColor, weekStartsOn, statsWindow, reminderEnabled, reminderTime };
    void appStorage.setItem(settingsKey(user.id), JSON.stringify(next));
  }, [darkMode, heatmapColor, reminderEnabled, reminderTime, statsWindow, user.id, weekStartsOn]);

  const loadItems = useCallback(async () => {
    const nextItems = await fetchTrackingItems(user);
    setItems(nextItems);
    setSelectedItemId((current) => (current && nextItems.some((item) => item.id === current) ? current : nextItems[0].id));
  }, [user]);

  const refresh = useCallback(
    async (showSpinner = false) => {
      if (!selectedItemId) return;
      if (showSpinner) setRefreshing(true);
      try {
        await flushPendingEntries(user, selectedItemId);
        const cloud = await fetchCloudEntries(user, selectedItemId);
        const pending = await readPendingEntries(user.id, selectedItemId);
        setPendingCount(Object.keys(pending).length);
        const next = mergePending(cloud, pending);
        await applyEntries(next);
        setStatusText(Object.keys(pending).length > 0 ? 'Some changes are waiting to sync.' : 'Synced');
      } catch {
        const cached = await readCachedEntries(user.id, selectedItemId);
        const pending = await readPendingEntries(user.id, selectedItemId);
        setPendingCount(Object.keys(pending).length);
        const next = mergePending(cached, pending);
        setEntries(next.entries);
        setComments(next.comments);
        setStatusText('Offline view');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyEntries, selectedItemId, user],
  );

  useEffect(() => {
    void loadItems().catch(() => {
      setStatusText('Could not load trackers');
      setLoading(false);
    });
  }, [loadItems]);

  useEffect(() => {
    if (!selectedItemId) return;
    setEntries({});
    setComments({});
    setLoading(true);
    void refresh();
  }, [refresh, selectedItemId]);

  useEffect(() => {
    setInputValue(String(entries[selectedKey] ?? 0));
    setCommentValue(comments[selectedKey] ?? '');
  }, [comments, entries, selectedKey]);

  const stats = useMemo(() => {
    const keys = getRollingDateKeys(statsWindow);
    const values = keys.map((key) => entries[key] ?? 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const loggedDays = values.filter((value) => value > 0).length;
    const maxValue = Math.max(0, ...values);
    const maxDays = values.filter((value) => value > 0 && value === maxValue).length;
    let currentStreak = 0;
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      if ((entries[keys[index]] ?? 0) <= 0) break;
      currentStreak += 1;
    }
    let maxStreak = 0;
    let runningStreak = 0;
    for (const key of keys) {
      if ((entries[key] ?? 0) > 0) {
        runningStreak += 1;
        maxStreak = Math.max(maxStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    }
    return {
      total,
      loggedDays,
      average: total / statsWindow,
      currentStreak,
      maxStreak,
      maxValue,
      maxDays,
    };
  }, [entries, statsWindow]);

  function changeDate(next: Date) {
    const normalized = new Date(next.getFullYear(), next.getMonth(), next.getDate(), 12, 0, 0, 0);
    if (formatDateKey(normalized) > todayKey) return;
    setSelectedDate(normalized);
  }

  function onPickerChange(event: DateTimePickerEvent, date?: Date) {
    setShowPicker(false);
    if (event.type === 'dismissed' || !date) return;
    changeDate(date);
  }

  function adjustValue(delta: number) {
    const current = Number.parseInt(inputValue, 10) || 0;
    setInputValue(String(Math.max(0, Math.min(999, current + delta))));
  }

  async function save() {
    if (!selectedItemId) return;
    const value = Number.parseInt(inputValue, 10);
    if (!Number.isInteger(value) || value < 0 || value > 999) {
      Alert.alert('Invalid number', 'Enter a whole number from 0 to 999.');
      return;
    }

    const previous = { ...entries };
    const previousComments = { ...comments };
    const optimistic = { ...entries };
    const optimisticComments = { ...comments };
    const cleanComment = commentValue.trim().slice(0, 100);
    if (value === 0) delete optimistic[selectedKey];
    else optimistic[selectedKey] = value;
    if (value <= 0 || !cleanComment) delete optimisticComments[selectedKey];
    else optimisticComments[selectedKey] = cleanComment;

    setSaving(true);
    await applyEntries({ entries: optimistic, comments: optimisticComments });

    try {
      await syncOneEntry(user, selectedItemId, selectedKey, value, cleanComment);
      setStatusText('Saved and synced');
    } catch {
      try {
        await queuePendingEntry(user.id, selectedItemId, selectedKey, value, cleanComment);
        setStatusText('Saved on this phone; waiting to sync');
      } catch {
        await applyEntries({ entries: previous, comments: previousComments });
        Alert.alert('Save failed', 'The entry could not be saved locally or online.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function clearSelectedDate() {
    if (!selectedItemId) return;
    setInputValue('0');
    const previous = entries[selectedKey] ?? 0;
    if (previous === 0) return;

    const optimistic = { ...entries };
    const optimisticComments = { ...comments };
    delete optimistic[selectedKey];
    delete optimisticComments[selectedKey];
    await applyEntries({ entries: optimistic, comments: optimisticComments });

    try {
      await syncOneEntry(user, selectedItemId, selectedKey, 0);
      setStatusText('Cleared and synced');
    } catch {
      await queuePendingEntry(user.id, selectedItemId, selectedKey, 0, '');
      setStatusText('Cleared on this phone; waiting to sync');
    }
  }

  async function addItem() {
    const name = newItemName.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter a name for the tracker.');
      return;
    }

    setSaving(true);
    try {
      const item = await createTrackingItem(user, name);
      setItems((current) => [...current, item]);
      setSelectedItemId(item.id);
      setNewItemName('');
      setDrawerOpen(false);
      setStatusText('Tracker added');
    } catch (error) {
      Alert.alert('Could not add tracker', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function applyReminder(nextEnabled = reminderEnabled, nextTime = reminderTime) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!nextEnabled) {
      setReminderEnabled(false);
      setStatusText('Reminder off');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert('Mobile only', 'Reminder notifications work in the installed mobile app.');
      setReminderEnabled(false);
      return;
    }

    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow notifications to use reminders.');
      setReminderEnabled(false);
      return;
    }

    const [hourText, minuteText] = nextTime.split(':');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Tracking Tabs',
        body: 'Add today’s counts.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Number(hourText),
        minute: Number(minuteText),
      },
    });
    setReminderEnabled(true);
    setStatusText(`Reminder set for ${nextTime}`);
  }

  function openTrackerActions(item: TrackingItem) {
    setManageItemId(item.id);
    setRenameValue(item.name);
  }

  async function saveRename() {
    if (!manageItem) return;
    const name = renameValue.trim();
    if (!name || name === manageItem.name) return;

    setSaving(true);
    try {
      const updated = await renameTrackingItem(user, manageItem.id, name);
      setItems((current) => current.map((item) => (item.id === manageItem.id ? updated : item)));
      setManageItemId('');
      setStatusText('Tracker renamed');
    } catch (error) {
      Alert.alert('Rename failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteTracker(item = manageItem) {
    if (!item) return;
    if (items.length <= 1) {
      Alert.alert('Keep one tracker', 'Add another tracker before deleting this one.');
      return;
    }

    Alert.alert('Delete tracker?', `${item.name} and its entries will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteSelectedTracker(item.id);
        },
      },
    ]);
  }

  async function deleteSelectedTracker(itemId: string) {
    setSaving(true);
    try {
      await deleteTrackingItem(user, itemId);
      const nextItems = items.filter((item) => item.id !== itemId);
      setItems(nextItems);
      if (selectedItemId === itemId) setSelectedItemId(nextItems[0]?.id ?? '');
      setManageItemId('');
      setStatusText('Tracker deleted');
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert('Delete account?', 'This permanently deletes your account, trackers, and entries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => {
          void deleteCurrentAccount();
        },
      },
    ]);
  }

  async function deleteCurrentAccount() {
    setSaving(true);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
    } catch (error) {
      Alert.alert('Delete account failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Could not sign out', error.message);
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingPage, { backgroundColor: theme.page }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.muted }]}>Loading your trackers...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.page }]}>
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.modalLayer}>
          <Pressable style={styles.backdrop} onPress={() => setDrawerOpen(false)} />
          <View style={[styles.drawer, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={[styles.drawerEyebrow, { color: theme.primary }]}>TRACKERS</Text>
                <Text style={[styles.drawerTitle, { color: theme.text }]}>Tracking Tabs</Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} style={styles.roundIconButton}>
                <Text style={styles.roundIconText}>x</Text>
              </Pressable>
            </View>

            {selectedItem ? (
              <View style={[styles.drawerItemActive, { borderColor: theme.primary }]}>
                <Pressable
                  style={styles.drawerItemMain}
                  onPress={() => setDrawerOpen(false)}
                  onLongPress={() => openTrackerActions(selectedItem)}
                >
                  <Text style={styles.drawerItemKicker}>Current</Text>
                  <Text style={styles.drawerItemActiveText} numberOfLines={1}>{selectedItem.name}</Text>
                </Pressable>
                <Pressable onPress={() => openTrackerActions(selectedItem)} style={styles.drawerActionButton}>
                  <Text style={styles.drawerActionText}>⋯</Text>
                </Pressable>
              </View>
            ) : null}

            <ScrollView style={styles.drawerList} contentContainerStyle={styles.drawerListContent}>
              {otherItems.map((item) => (
                <View
                  key={item.id}
                  style={[styles.drawerItem, { borderColor: theme.border, backgroundColor: theme.cardSoft }]}
                >
                  <Pressable
                    style={styles.drawerItemMain}
                    onPress={() => {
                      setSelectedItemId(item.id);
                      setDrawerOpen(false);
                    }}
                    onLongPress={() => openTrackerActions(item)}
                  >
                    <Text style={[styles.drawerItemText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                  <Pressable onPress={() => openTrackerActions(item)} style={styles.drawerActionButton}>
                    <Text style={[styles.drawerActionText, { color: theme.muted }]}>⋯</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <View style={[styles.drawerAddBox, { borderColor: theme.border }]}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Add tracker</Text>
              <View style={styles.addTrackerRow}>
                <TextInput
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder="Name"
                  placeholderTextColor={theme.muted}
                  maxLength={48}
                  style={[styles.trackerNameInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                />
                <Pressable
                  onPress={() => void addItem()}
                  disabled={saving}
                  style={({ pressed }) => [styles.addTrackerButton, pressed && styles.pressed, saving && styles.disabled]}
                >
                  <Text style={styles.addTrackerText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(manageItem)} transparent animationType="fade" onRequestClose={() => setManageItemId('')}>
        <View style={styles.modalLayer}>
          <Pressable style={styles.backdrop} onPress={() => setManageItemId('')} />
          <View style={[styles.trackerActionSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.drawerTitle, { color: theme.text }]}>Tracker</Text>
            <Text style={[styles.menuHint, { color: theme.muted }]}>Rename or delete this tracker.</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              maxLength={48}
              style={[styles.settingsInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            />
            <Pressable onPress={() => void saveRename()} style={[styles.menuButton, { borderColor: theme.border }]}>
              <Text style={[styles.menuButtonText, { color: theme.text }]}>Save name</Text>
            </Pressable>
            <Pressable onPress={() => confirmDeleteTracker()} style={[styles.menuButton, styles.logoutMenuButton]}>
              <Text style={styles.logoutMenuText}>Delete tracker</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalLayer}>
          <Pressable style={styles.backdrop} onPress={() => setSettingsOpen(false)} />
          <View style={[styles.settingsSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.drawerTitle, { color: theme.text }]}>Menu</Text>
            <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.menuRow, { borderColor: theme.border }]}>
                <View>
                  <Text style={[styles.menuLabel, { color: theme.text }]}>Dark mode</Text>
                  <Text style={[styles.menuHint, { color: theme.muted }]}>Use a darker mobile UI.</Text>
                </View>
                <Switch value={darkMode} onValueChange={setDarkMode} />
              </View>

              <View style={[styles.settingsGroup, { borderColor: theme.border }]}>
                <Text style={[styles.settingsGroupTitle, { color: theme.text }]}>Heatmap color</Text>
                <View style={styles.rgbPreviewRow}>
                  <View style={[styles.rgbPreview, { backgroundColor: rgbString(heatmapColor) }]} />
                  <View style={styles.palettePreviewLarge}>
                    {heatmapLevels.map((color) => (
                      <View key={color} style={[styles.paletteBlock, { backgroundColor: color }]} />
                    ))}
                  </View>
                </View>
                <View style={styles.rgbInputRow}>
                  {(['r', 'g', 'b'] as const).map((channel) => (
                    <View key={channel} style={styles.rgbInputWrap}>
                      <Text style={[styles.rgbLabel, { color: theme.muted }]}>{channel.toUpperCase()}</Text>
                      <TextInput
                        value={String(heatmapColor[channel])}
                        onChangeText={(text) => {
                          const parsed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
                          setHeatmapColor((current) => ({ ...current, [channel]: clampRgb(Number.isNaN(parsed) ? 0 : parsed) }));
                        }}
                        keyboardType="number-pad"
                        maxLength={3}
                        style={[styles.rgbInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.quickColorGrid}>
                  {QUICK_COLORS.map((color) => (
                    <Pressable
                      key={rgbString(color)}
                      onPress={() => setHeatmapColor(color)}
                      style={[
                        styles.quickColorButton,
                        { backgroundColor: rgbString(color) },
                        heatmapColor.r === color.r && heatmapColor.g === color.g && heatmapColor.b === color.b && styles.quickColorButtonActive,
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={[styles.settingsGroup, { borderColor: theme.border }]}>
                <Text style={[styles.settingsGroupTitle, { color: theme.text }]}>Week starts on</Text>
                <View style={styles.segmentRow}>
                  {(['monday', 'sunday'] as WeekStart[]).map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => setWeekStartsOn(day)}
                      style={[styles.segmentButton, weekStartsOn === day && styles.segmentButtonActive]}
                    >
                      <Text style={[styles.segmentText, weekStartsOn === day && styles.segmentTextActive]}>
                        {day === 'monday' ? 'Monday' : 'Sunday'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={[styles.settingsGroup, { borderColor: theme.border }]}>
                <Text style={[styles.settingsGroupTitle, { color: theme.text }]}>Stats window</Text>
                <View style={styles.segmentRow}>
                  {([30, 90, 365] as StatsWindow[]).map((days) => (
                    <Pressable
                      key={days}
                      onPress={() => setStatsWindow(days)}
                      style={[styles.segmentButton, statsWindow === days && styles.segmentButtonActive]}
                    >
                      <Text style={[styles.segmentText, statsWindow === days && styles.segmentTextActive]}>{days}d</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={[styles.settingsGroup, { borderColor: theme.border }]}>
                <View style={styles.menuRowInline}>
                  <View>
                    <Text style={[styles.settingsGroupTitle, { color: theme.text }]}>Reminder</Text>
                    <Text style={[styles.menuHint, { color: theme.muted }]}>Daily notification in the mobile app.</Text>
                  </View>
                  <Switch
                    value={reminderEnabled}
                    onValueChange={(value) => {
                      void applyReminder(value);
                    }}
                  />
                </View>
                <TextInput
                  value={reminderTime}
                  onChangeText={(text) => setReminderTime(text.replace(/[^0-9:]/g, '').slice(0, 5))}
                  onBlur={() => void applyReminder(reminderEnabled, reminderTime)}
                  placeholder="21:00"
                  placeholderTextColor={theme.muted}
                  style={[styles.settingsInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                />
              </View>

              <View style={[styles.settingsGroup, { borderColor: theme.border }]}>
                <Text style={[styles.settingsGroupTitle, { color: theme.text }]}>Backup sync</Text>
                <Text style={[styles.menuHint, { color: theme.muted }]}>
                  {pendingCount === 0 ? 'All local changes are synced.' : `${pendingCount} change(s) waiting to sync.`}
                </Text>
                <Pressable onPress={() => void refresh(true)} style={[styles.menuButton, { borderColor: theme.border }]}>
                  <Text style={[styles.menuButtonText, { color: theme.text }]}>Sync now</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setSettingsOpen(false);
                  void signOut();
                }}
                style={[styles.menuButton, { borderColor: theme.border }]}
              >
                <Text style={[styles.menuButtonText, { color: theme.text }]}>Log out</Text>
              </Pressable>
              <Pressable onPress={confirmDeleteAccount} style={[styles.menuButton, styles.dangerMenuButton]}>
                <Text style={styles.logoutMenuText}>Delete account</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.headerIconButton, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}>
            <Text style={[styles.headerIconText, { color: theme.text }]}>☰</Text>
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{selectedItem?.name ?? 'Tracking Tabs'}</Text>
          </View>
          <Pressable onPress={() => setSettingsOpen(true)} style={({ pressed }) => [styles.headerIconButton, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}>
            <Text style={[styles.headerIconText, { color: theme.text }]}>⋮</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>{statsWindow}-day total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats.average.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>Daily average</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats.loggedDays}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>Logged days</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats.currentStreak}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>Current streak</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats.maxStreak}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>Max streak</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats.maxDays}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>Days max</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{selectedItem?.name ?? 'Tracker'} graph</Text>
              <Text style={[styles.cardSubtitle, { color: theme.muted }]}>Tap any square to edit that date.</Text>
            </View>
            <Text style={[styles.syncStatus, { color: theme.muted }]}>Max {stats.maxValue}</Text>
          </View>
          <Heatmap365
            entries={entries}
            selectedDateKey={selectedKey}
            levels={heatmapLevels}
            weekStartsOn={weekStartsOn}
            days={heatmapDays}
            onSelectDate={(key) => changeDate(parseDateKey(key))}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Edit {selectedItem?.name ?? 'tracker'}</Text>

          <View style={styles.dateNav}>
            <Pressable
              accessibilityLabel="Previous day"
              onPress={() => changeDate(addDays(selectedDate, -1))}
              style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.cardSoft, borderColor: theme.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.iconText, { color: theme.text }]}>‹</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowPicker(true)}
              style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}
            >
              <Text style={styles.dateButtonText}>{formatDisplayDate(selectedDate)}</Text>
              <Text style={styles.dateHint}>Tap to choose a date</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Next day"
              disabled={compareDateKeys(selectedKey, todayKey) >= 0}
              onPress={() => changeDate(addDays(selectedDate, 1))}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: theme.cardSoft, borderColor: theme.border },
                pressed && styles.pressed,
                compareDateKeys(selectedKey, todayKey) >= 0 && styles.disabled,
              ]}
            >
              <Text style={[styles.iconText, { color: theme.text }]}>›</Text>
            </Pressable>
          </View>

          {showPicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={todayLocal()}
              onChange={onPickerChange}
            />
          )}

          <Text style={[styles.fieldLabel, { color: theme.text }]}>Number for this day</Text>
          <View style={styles.counterRow}>
            <Pressable onPress={() => adjustValue(-1)} style={({ pressed }) => [styles.counterButton, { backgroundColor: theme.cardSoft, borderColor: theme.border }, pressed && styles.pressed]}>
              <Text style={[styles.counterButtonText, { color: theme.text }]}>−</Text>
            </Pressable>
            <TextInput
              value={inputValue}
              onChangeText={(text) => setInputValue(text.replace(/[^0-9]/g, '').slice(0, 3) || '0')}
              onFocus={() => inputValue === '0' && setInputValue('')}
              onBlur={() => inputValue === '' && setInputValue('0')}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={3}
              style={[styles.numberInput, { backgroundColor: theme.input, color: theme.text }]}
              accessibilityLabel="Daily number"
            />
            <Pressable onPress={() => adjustValue(1)} style={({ pressed }) => [styles.counterButton, { backgroundColor: theme.cardSoft, borderColor: theme.border }, pressed && styles.pressed]}>
              <Text style={[styles.counterButtonText, { color: theme.text }]}>+</Text>
            </Pressable>
          </View>

          <View style={styles.commentBlock}>
            <View style={styles.commentHeader}>
              <Text style={[styles.fieldLabel, { color: theme.text, marginBottom: 0 }]}>Comment</Text>
              <Text style={[styles.commentCounter, { color: theme.muted }]}>{commentValue.length}/100</Text>
            </View>
            <TextInput
              value={commentValue}
              onChangeText={(text) => setCommentValue(text.slice(0, 100))}
              placeholder="Optional note for this date"
              placeholderTextColor={theme.muted}
              multiline
              maxLength={100}
              style={[styles.commentInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            />
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => void clearSelectedDate()}
              style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.secondaryText, { color: theme.text }]}>Clear day</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save</Text>}
            </Pressable>
          </View>
        </View>

        <Text style={[styles.footer, { color: theme.muted }]}>Your entries are tied to your account and protected by database row-level security.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
    backgroundColor: '#F7F8FA',
  },
  page: {
    padding: 18,
    paddingBottom: 40,
  },
  loadingPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 12,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '800',
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: '#2563EB',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  signOut: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  signOutText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 12,
  },
  modalLayer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  drawer: {
    width: '84%',
    maxWidth: 360,
    height: '100%',
    borderRightWidth: 1,
    paddingTop: 22,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  drawerEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  roundIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  roundIconText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 16,
  },
  drawerItemActive: {
    borderWidth: 2,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    paddingLeft: 14,
    paddingVertical: 10,
    paddingRight: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerItemMain: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  drawerItemKicker: {
    color: '#DBEAFE',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  drawerItemActiveText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    gap: 8,
    paddingBottom: 14,
  },
  drawerItem: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 13,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerItemText: {
    fontWeight: '800',
    fontSize: 14,
  },
  drawerActionButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  drawerActionText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  drawerAddBox: {
    borderTopWidth: 1,
    paddingTop: 14,
  },
  settingsSheet: {
    width: '82%',
    maxWidth: 340,
    marginLeft: 'auto',
    height: '100%',
    borderLeftWidth: 1,
    paddingTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  trackerActionSheet: {
    width: '90%',
    maxWidth: 380,
    marginTop: 'auto',
    marginHorizontal: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  settingsContent: {
    gap: 12,
    paddingBottom: 28,
  },
  settingsGroup: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  settingsGroupTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  rgbPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rgbPreview: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  palettePreviewLarge: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  paletteBlock: {
    flex: 1,
  },
  rgbInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rgbInputWrap: {
    flex: 1,
  },
  rgbLabel: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
  },
  rgbInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '900',
  },
  quickColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickColorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  quickColorButtonActive: {
    borderColor: '#111827',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  segmentButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  segmentText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  menuRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingsInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  menuRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '900',
  },
  menuHint: {
    marginTop: 3,
    fontSize: 11,
  },
  menuButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  menuButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  logoutMenuButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  dangerMenuButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  logoutMenuText: {
    color: '#991B1B',
    fontWeight: '900',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  statValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 20,
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 10,
  },
  cardTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 18,
  },
  cardSubtitle: {
    marginTop: 3,
    color: '#6B7280',
    fontSize: 12,
  },
  syncStatus: {
    color: '#6B7280',
    fontSize: 10,
    maxWidth: 105,
    textAlign: 'right',
  },
  tabsRow: {
    gap: 8,
    paddingBottom: 12,
  },
  tabButton: {
    maxWidth: 150,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
  },
  tabButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tabButtonText: {
    color: '#374151',
    fontWeight: '800',
    fontSize: 12,
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  addTrackerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  trackerNameInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    fontSize: 14,
  },
  addTrackerButton: {
    minWidth: 72,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  addTrackerText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 15,
    marginBottom: 18,
  },
  iconButton: {
    width: 44,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  iconText: {
    color: '#111827',
    fontSize: 30,
    lineHeight: 32,
  },
  dateButton: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  dateButtonText: {
    color: '#1E3A8A',
    fontWeight: '800',
    fontSize: 14,
  },
  dateHint: {
    color: '#3B82F6',
    fontSize: 10,
    marginTop: 2,
  },
  fieldLabel: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  counterButton: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  counterButtonText: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '600',
  },
  numberInput: {
    width: 112,
    height: 66,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  commentBlock: {
    marginTop: 18,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentCounter: {
    fontSize: 11,
    fontWeight: '800',
  },
  commentInput: {
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#374151',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.4,
  },
  footer: {
    color: '#9CA3AF',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
