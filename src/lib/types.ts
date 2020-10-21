export type SupabaseClientOptions = {
  /**
   * The Postgres schema which your tables belong to. Must be on the list of exposed schemas in Supabase.
   */
  schema: string
  /**
   * Optional headers for initializing the client.
   */
  headers?: { [key: string]: string }
  /**
   * Automatically refreshes the token for logged in users.
   */
  autoRefreshToken?: boolean
  /**
   * Whether to persist a logged in session to storage.
   */
  persistSession?: boolean
  /**
   * Detect a session from the URL. Used for OAuth login callbacks.
   */
  detectSessionInUrl?: boolean
}

export type SupabaseRealtimePayload<T> = {
  commit_timestamp: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: string
  table: string
  /** The new record. Present for 'INSERT' and 'UPDATE' events. */
  new: T
  /** The previous record. Present for 'UPDATE' and 'DELETE' events. */
  old: T
}
