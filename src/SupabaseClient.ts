import { DEFAULT_HEADERS } from './lib/constants'
import { SupabaseClientOptions, SupabaseQueryBuilder } from './lib/types'
import { GoTrueClient } from '@supabase/gotrue-js'
import { PostgrestClient } from '@supabase/postgrest-js'
import { RealtimeClient, RealtimeSubscription } from '@supabase/realtime-js'
import { SupabaseRealtimeClient } from './lib/SupabaseRealtimeClient'

const DEFAULT_OPTIONS = {
  schema: 'public',
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  headers: DEFAULT_HEADERS,
}

/**
 * Supabase Client.
 *
 * An isomorphic Javascript client for interacting with Postgres.
 */
export default class SupabaseClient {
  schema: string
  restUrl: string
  realtimeUrl: string
  authUrl: string
  auth: GoTrueClient
  realtime: RealtimeClient

  /**
   * Create a new client for use in the browser.
   * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
   * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
   * @param options.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
   * @param options.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
   * @param options.persistSession Set to "true" if you want to automatically save the user session into local storage.
   * @param options.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
   * @param options.headers Any additional headers to send with each network request.
   */
  constructor(
    public supabaseUrl: string,
    public supabaseKey: string,
    options?: SupabaseClientOptions
  ) {
    if (!supabaseUrl) throw new Error('supabaseUrl is required.')
    if (!supabaseKey) throw new Error('supabaseKey is required.')

    const settings = { ...DEFAULT_OPTIONS, ...options }
    this.restUrl = `${supabaseUrl}/rest/v1`
    this.realtimeUrl = `${supabaseUrl}/realtime/v1`.replace('http', 'ws')
    this.authUrl = `${supabaseUrl}/auth/v1`
    this.schema = settings.schema

    this.auth = this._initGoTrueClient(settings)
    this.realtime = this._initRealtimeClient()

    this.realtime.onOpen(() => console.log('OPEN'))
    this.realtime.onClose(() => console.log('CLOSED'))
    this.realtime.onError((e: Error) => console.log('Socket error', e))
  }

  /**
   * Perform a table operation.
   *
   * @param table The table name to operate on.
   */
  from<T = any>(tableName: string) {
    // At this point, we don't know whether the user is going to
    // make a call to Realtime or to PostgREST, so we need to do
    // an intermdiary step where we return both.
    // We have to make sure "this" is bound correctly on each part.
    // let rest = this._initPostgRESTClient()

    // let rest = new SupaabseQueryBuilder(this.restUrl || '', {})
    let rest = this._initPostgRESTClient()
    let subscription = new SupabaseRealtimeClient(this.realtime, this.schema, tableName)

    const builder: SupabaseQueryBuilder<T> = {
      rest,
      subscription,
      select: (columns) => {
        return rest.from(tableName).select(columns)
      },
      insert: (values, options?) => {
        return rest.from<T>(tableName).insert(values, options)
      },
      update: (values) => {
        return rest.from<T>(tableName).update(values)
      },
      delete: () => {
        return rest.from<T>(tableName).delete()
      },
      on: (event, callback) => {
        if (!this.realtime.isConnected()) {
          this.realtime.connect()
        }
        return subscription.on(event, callback)
      },
    }
    return builder
  }

  /**
   * Perform a stored procedure call.
   *
   * @param fn  The function name to call.
   * @param params  The parameters to pass to the function call.
   */
  rpc(fn: string, params?: object) {
    let rest = this._initPostgRESTClient()
    return rest.rpc(fn, params)
  }

  /**
   * Removes an active subscription and returns the number of open connections.
   *
   * @param subscription The subscription you want to remove.
   */
  removeSubscription(subscription: RealtimeSubscription) {
    return new Promise(async (resolve) => {
      try {
        if (!subscription.isClosed()) {
          await this._closeChannel(subscription)
        }
        let openSubscriptions = this.realtime.channels.length
        if (!openSubscriptions) {
          let { error } = await this.realtime.disconnect()
          if (error) return resolve({ error })
        }
        return resolve({ error: null, data: { openSubscriptions } })
      } catch (error) {
        return resolve({ error })
      }
    })
  }

  /**
   * Returns an array of all your subscriptions.
   */
  getSubscriptions() {
    return this.realtime.channels
  }

  private _initGoTrueClient(settings: SupabaseClientOptions) {
    return new GoTrueClient({
      url: this.authUrl,
      headers: {
        Authorization: `Bearer ${this.supabaseKey}`,
        apikey: `${this.supabaseKey}`,
      },
      autoRefreshToken: settings.autoRefreshToken,
      persistSession: settings.persistSession,
      detectSessionInUrl: settings.detectSessionInUrl,
    })
  }

  private _initRealtimeClient() {
    return new RealtimeClient(this.realtimeUrl, {
      params: { apikey: this.supabaseKey },
    })
  }

  private _initPostgRESTClient() {
    return new PostgrestClient(this.restUrl, {
      headers: this._getAuthHeaders(),
      schema: this.schema,
    })
  }

  private _getAuthHeaders(): { [key: string]: string } {
    let headers: { [key: string]: string } = {}
    let authBearer = this.auth.currentSession?.access_token || this.supabaseKey
    headers['apikey'] = this.supabaseKey
    headers['Authorization'] = `Bearer ${authBearer}`
    return headers
  }

  private _closeChannel(subscription: RealtimeSubscription) {
    return new Promise((resolve, reject) => {
      subscription
        .unsubscribe()
        .receive('ok', () => {
          this.realtime.remove(subscription)
          return resolve(true)
        })
        .receive('error', (e: Error) => {
          return reject(e)
        })
    })
  }
}
