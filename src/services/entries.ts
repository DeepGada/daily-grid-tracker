import type { User } from '@supabase/supabase-js';

import { appStorage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import type { DailyEntry, EntryMap, PendingEntryMap, TrackingItem } from '../types';

const DEFAULT_ITEM_NAME = 'Daily Count';

function cacheKey(userId: string, itemId: string): string {
  return `entries:${userId}:${itemId}`;
}

function pendingKey(userId: string, itemId: string): string {
  return `pending:${userId}:${itemId}`;
}

export async function readCachedEntries(userId: string, itemId: string): Promise<EntryMap> {
  const raw = await appStorage.getItem(cacheKey(userId, itemId));
  if (!raw) return {};

  try {
    return JSON.parse(raw) as EntryMap;
  } catch {
    return {};
  }
}

export async function writeCachedEntries(userId: string, itemId: string, entries: EntryMap): Promise<void> {
  await appStorage.setItem(cacheKey(userId, itemId), JSON.stringify(entries));
}

export async function readPendingEntries(userId: string, itemId: string): Promise<PendingEntryMap> {
  const raw = await appStorage.getItem(pendingKey(userId, itemId));
  if (!raw) return {};

  try {
    return JSON.parse(raw) as PendingEntryMap;
  } catch {
    return {};
  }
}

async function writePendingEntries(userId: string, itemId: string, entries: PendingEntryMap): Promise<void> {
  if (Object.keys(entries).length === 0) {
    await appStorage.removeItem(pendingKey(userId, itemId));
    return;
  }
  await appStorage.setItem(pendingKey(userId, itemId), JSON.stringify(entries));
}

export async function queuePendingEntry(userId: string, itemId: string, entryDate: string, value: number): Promise<void> {
  const pending = await readPendingEntries(userId, itemId);
  pending[entryDate] = value;
  await writePendingEntries(userId, itemId, pending);
}

export async function fetchTrackingItems(user: User): Promise<TrackingItem[]> {
  const { data, error } = await supabase
    .from('tracked_items')
    .select('id,name,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const items = (data ?? []) as TrackingItem[];
  if (items.length > 0) return items;

  const created = await createTrackingItem(user, DEFAULT_ITEM_NAME);
  return [created];
}

export async function createTrackingItem(user: User, name: string): Promise<TrackingItem> {
  const cleanedName = name.trim() || DEFAULT_ITEM_NAME;
  const { data, error } = await supabase
    .from('tracked_items')
    .insert({
      user_id: user.id,
      name: cleanedName.slice(0, 48),
    })
    .select('id,name,created_at')
    .single();

  if (error) throw error;
  return data as TrackingItem;
}

export async function renameTrackingItem(user: User, itemId: string, name: string): Promise<TrackingItem> {
  const cleanedName = name.trim();
  if (!cleanedName) throw new Error('Tracker name is required.');

  const { data, error } = await supabase
    .from('tracked_items')
    .update({
      name: cleanedName.slice(0, 48),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('id', itemId)
    .select('id,name,created_at')
    .single();

  if (error) throw error;
  return data as TrackingItem;
}

export async function deleteTrackingItem(user: User, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('tracked_items')
    .delete()
    .eq('user_id', user.id)
    .eq('id', itemId);

  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}

export async function fetchCloudEntries(user: User, itemId: string): Promise<EntryMap> {
  const { data, error } = await supabase
    .from('daily_entries')
    .select('entry_date,value')
    .eq('user_id', user.id)
    .eq('item_id', itemId)
    .order('entry_date', { ascending: true });

  if (error) throw error;

  return Object.fromEntries(
    ((data ?? []) as DailyEntry[]).map((entry) => [entry.entry_date, entry.value]),
  );
}

export async function syncOneEntry(user: User, itemId: string, entryDate: string, value: number): Promise<void> {
  if (value <= 0) {
    const { error } = await supabase
      .from('daily_entries')
      .delete()
      .eq('user_id', user.id)
      .eq('item_id', itemId)
      .eq('entry_date', entryDate);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('daily_entries').upsert(
    {
      user_id: user.id,
      item_id: itemId,
      entry_date: entryDate,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,item_id,entry_date' },
  );

  if (error) throw error;
}

export async function flushPendingEntries(user: User, itemId: string): Promise<number> {
  const pending = await readPendingEntries(user.id, itemId);
  const remaining: PendingEntryMap = {};
  let synced = 0;

  for (const [entryDate, value] of Object.entries(pending)) {
    try {
      await syncOneEntry(user, itemId, entryDate, value);
      synced += 1;
    } catch {
      remaining[entryDate] = value;
    }
  }

  await writePendingEntries(user.id, itemId, remaining);
  return synced;
}
