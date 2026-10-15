
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_config": {
                  Row: {
                    "created_at": string,"id": string,"owner_email": string,"singleton": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"owner_email": string,"singleton"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"owner_email"?: string,"singleton"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"capture_jobs": {
                  Row: {
                    "confidence": Json | null,"created_at": string,"error": string | null,"id": string,"input_hash": string,"input_kind": string,"latency_ms": number | null,"model": string,"proposal": Json | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: Json | null,"created_at"?: string,"error"?: string | null,"id"?: string,"input_hash": string,"input_kind": string,"latency_ms"?: number | null,"model": string,"proposal"?: Json | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "confidence"?: Json | null,"created_at"?: string,"error"?: string | null,"id"?: string,"input_hash"?: string,"input_kind"?: string,"latency_ms"?: number | null,"model"?: string,"proposal"?: Json | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"event_overrides": {
                  Row: {
                    "all_day": boolean | null,"cancelled": boolean,"created_at": string,"ends_at": string | null,"event_id": string,"id": string,"kind_id": string | null,"location": string | null,"notes": string | null,"occurrence_date": string,"starts_at": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean | null,"cancelled"?: boolean,"created_at"?: string,"ends_at"?: string | null,"event_id": string,"id"?: string,"kind_id"?: string | null,"location"?: string | null,"notes"?: string | null,"occurrence_date": string,"starts_at"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean | null,"cancelled"?: boolean,"created_at"?: string,"ends_at"?: string | null,"event_id"?: string,"id"?: string,"kind_id"?: string | null,"location"?: string | null,"notes"?: string | null,"occurrence_date"?: string,"starts_at"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_overrides_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_overrides_kind_id_fkey"
      columns: ["kind_id"]
isOneToOne: false
      referencedRelation: "kinds"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"capture_job_id": string | null,"created_at": string,"deleted_at": string | null,"ends_at": string,"id": string,"kind_id": string,"location": string | null,"notes": string | null,"origin": string,"recurrence": Json | null,"starts_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"capture_job_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"ends_at": string,"id"?: string,"kind_id": string,"location"?: string | null,"notes"?: string | null,"origin"?: string,"recurrence"?: Json | null,"starts_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"capture_job_id"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"ends_at"?: string,"id"?: string,"kind_id"?: string,"location"?: string | null,"notes"?: string | null,"origin"?: string,"recurrence"?: Json | null,"starts_at"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_capture_job_id_fkey"
      columns: ["capture_job_id"]
isOneToOne: false
      referencedRelation: "capture_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_kind_id_fkey"
      columns: ["kind_id"]
isOneToOne: false
      referencedRelation: "kinds"
      referencedColumns: ["id"]
    }
                  ]
                },"kinds": {
                  Row: {
                    "color_dark": string,"color_light": string,"created_at": string,"deleted_at": string | null,"id": string,"is_default": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color_dark": string,"color_light": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_default"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "color_dark"?: string,"color_light"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_default"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"last_seen_at": string,"p256dh": string,"updated_at": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"last_seen_at"?: string,"p256dh": string,"updated_at"?: string,"user_agent"?: string | null
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"last_seen_at"?: string,"p256dh"?: string,"updated_at"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reminders": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"minutes_before": number,"occurrence_date": string | null,"sent_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"minutes_before": number,"occurrence_date"?: string | null,"sent_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"minutes_before"?: number,"occurrence_date"?: string | null,"sent_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
