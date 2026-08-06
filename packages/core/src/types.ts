export type Track = 'acquisition' | 'launch';
export type IntentLevel = 'high' | 'medium' | 'competitor';
export type Classification = 'PENDING' | 'HIGH_INTENT' | 'HELP_ONLY' | 'SKIP';
export type ThreadStatus = 'new' | 'classified' | 'drafted' | 'skipped' | 'error';
export type Variant = 'help_only' | 'soft_mention';
export type DraftStatus =
  | 'pending'
  | 'saved'
  | 'approved'
  | 'scheduled'
  | 'posted'
  | 'discarded'
  | 'failed';

export interface Subreddit {
  id: string;
  name: string;
  rules_summary: string;
  allows_links: boolean;
  min_karma: number;
  track: Track;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Keyword {
  id: string;
  term: string;
  intent_level: IntentLevel;
  active: boolean;
  created_at: string;
}

export interface Thread {
  id: string;
  reddit_post_id: string;
  subreddit_id: string;
  title: string;
  body: string;
  author: string;
  url: string;
  permalink: string;
  created_utc: string | null;
  score: number;
  num_comments: number;
  matched_keywords: string[];
  classification: Classification;
  classification_reason: string;
  suggested_angle: string;
  status: ThreadStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  id: string;
  thread_id: string;
  variant: Variant;
  content: string;
  edited_content: string | null;
  status: DraftStatus;
  risk_flags: string[];
  scheduled_at: string | null;
  posted_at: string | null;
  reddit_comment_id: string | null;
  reddit_permalink: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Metric {
  id: string;
  draft_id: string;
  upvotes: number;
  replies: number;
  clicks: number;
  checked_at: string;
}

export interface Settings {
  id: boolean;
  daily_post_limit: number;
  min_minutes_between_posts: number;
  min_delay_minutes: number;
  max_delay_minutes: number;
  max_mentions_per_subreddit_per_week: number;
  warming_mode: boolean;
  paused: boolean;
  updated_at: string;
}

/** Thread + subreddit + rascunhos, como a fila de aprovação consome. */
export interface QueueItem {
  thread: Thread;
  subreddit: Pick<Subreddit, 'id' | 'name' | 'allows_links' | 'rules_summary' | 'track'>;
  drafts: Draft[];
}

export interface ClassifierResult {
  intent: Exclude<Classification, 'PENDING'>;
  reason: string;
  suggested_angle: string;
}

export interface DrafterResult {
  help_only: string;
  soft_mention: string;
  mention_included: boolean;
  notes: string;
}

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
}
