export type DailyEntry = {
  item_id?: string;
  entry_date: string;
  value: number;
  updated_at?: string;
};

export type TrackingItem = {
  id: string;
  name: string;
  created_at?: string;
};

export type EntryMap = Record<string, number>;

export type PendingEntryMap = Record<string, number>;
