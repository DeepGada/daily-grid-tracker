export type DailyEntry = {
  item_id?: string;
  entry_date: string;
  value: number;
  comment?: string | null;
  updated_at?: string;
};

export type TrackingItem = {
  id: string;
  name: string;
  created_at?: string;
};

export type EntryMap = Record<string, number>;

export type CommentMap = Record<string, string>;

export type EntryBundle = {
  entries: EntryMap;
  comments: CommentMap;
};

export type PendingEntry = {
  value: number;
  comment?: string;
};

export type PendingEntryMap = Record<string, PendingEntry>;
