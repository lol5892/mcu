export type Role = "anton" | "tanya";
export type Member = {
  family_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
};
export type Profile = {
  id: string;
  avatar_path: string | null;
  welcome_seen_at: string | null;
  onboarding_seen_at: string | null;
  read_receipts: boolean;
  timezone: string;
  notification_types: Record<string, boolean>;
  quiet_start: string;
  quiet_end: string;
  reminder_hours: number[];
  nudge_frequency: 0 | 1 | 2;
  letter_nudges: boolean;
};
export type Versioned = { version: number };
export type SharedEntry = Versioned & {
  family_id: string;
  project_id: string;
  watched: boolean;
  watched_date: string | null;
  note: string;
  updated_by: string;
  updated_at: string;
};
export type Episode = Versioned & {
  family_id: string;
  project_id: string;
  season: number;
  episode: number;
  watched: boolean;
  updated_by: string;
};
export type Rating = Versioned & {
  family_id: string;
  user_id: string;
  project_id: string;
  season: number;
  score: number | null;
  favorite: boolean;
  updated_at: string;
};
export type Letter = Versioned & {
  id: string;
  family_id: string;
  author_id: string;
  recipient_id: string;
  title: string;
  body: string;
  style: "romantic" | "cosmic" | "minimal" | "surprise";
  status: "draft" | "scheduled" | "delivered" | "cancelled";
  scheduled_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  reply_to: string | null;
  created_at: string;
};
export type Message = Versioned & {
  id: string;
  family_id: string;
  author_id: string;
  scope: "chat" | "project" | "session" | "moment";
  target: string;
  body: string;
  spoiler: boolean;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};
export type ViewingSession = Versioned & {
  id: string;
  family_id: string;
  project_id: string;
  author_id: string;
  status: "active" | "finished";
  film_minute: number;
  participants: string[];
  created_at: string;
  finished_at: string | null;
};
export type Evening = Versioned & {
  id: string;
  family_id: string;
  project_id: string;
  author_id: string;
  starts_at: string;
  timezone: string;
  season: number | null;
  episode: number | null;
  location: string;
  note: string;
  status: "invited" | "confirmed" | "proposed" | "cancelled";
  proposed_at: string | null;
  proposed_by?: string | null;
  confirmed_by: string | null;
  created_at: string;
};
export type Moment = Versioned & {
  id: string;
  family_id: string;
  author_id: string;
  project_id: string | null;
  session_id: string | null;
  caption: string;
  moment_date: string;
  created_at: string;
};
export type Media = {
  id: string;
  family_id: string;
  author_id: string;
  kind: "letter" | "moment" | "session" | "avatar";
  target_id: string | null;
  object_path: string;
  content_type: string;
  byte_size: number;
  ready: boolean;
};
export type Reaction = {
  family_id: string;
  user_id: string;
  kind: "letter" | "message" | "moment" | "session";
  target_id: string;
  emoji: string;
};
export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  route: string;
  read_at: string | null;
  created_at: string;
};
export type Device = {
  id: string;
  name: string;
  enabled: boolean;
  updated_at: string;
};
export type LegacyRating = {
  project_id: string;
  role: Role;
  score: number;
  claimed_by: string | null;
};
export type RatingHistory = {
  id: number;
  user_id: string;
  project_id: string;
  season: number;
  old_score: number | null;
  new_score: number | null;
  changed_at: string;
};
export type Snapshot = {
  members: Member[];
  profile: Profile | null;
  entries: SharedEntry[];
  episodes: Episode[];
  ratings: Rating[];
  letters: Letter[];
  messages: Message[];
  sessions: ViewingSession[];
  events: Evening[];
  moments: Moment[];
  media: Media[];
  reactions: Reaction[];
  notifications: NotificationRow[];
  devices: Device[];
  legacy: LegacyRating[];
  favorites: { letter_id: string }[];
  history: RatingHistory[];
  welcome: { scenes: string[]; body: string } | null;
  cachedAt: string;
};
export type Operation = {
  id: string;
  userId: string;
  familyId: string;
  kind: string;
  target: string;
  payload: Record<string, unknown>;
  expected: number;
  createdAt: string;
  state: "queued" | "conflict" | "failed";
  error?: string;
};
export const blankSnapshot = (): Snapshot => ({
  members: [],
  profile: null,
  entries: [],
  episodes: [],
  ratings: [],
  letters: [],
  messages: [],
  sessions: [],
  events: [],
  moments: [],
  media: [],
  reactions: [],
  notifications: [],
  devices: [],
  legacy: [],
  favorites: [],
  history: [],
  welcome: null,
  cachedAt: "",
});
