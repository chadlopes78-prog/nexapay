export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      checkouts: {
        Row: {
          banner_url: string | null
          button_text: string | null
          created_at: string
          footer_text: string | null
          form_fields: Json | null
          guarantee_text: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          product_id: string
          subtitle: string | null
          testimonials: Json | null
          title: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          banner_url?: string | null
          button_text?: string | null
          created_at?: string
          footer_text?: string | null
          form_fields?: Json | null
          guarantee_text?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          product_id: string
          subtitle?: string | null
          testimonials?: Json | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          banner_url?: string | null
          button_text?: string | null
          created_at?: string
          footer_text?: string | null
          form_fields?: Json | null
          guarantee_text?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          product_id?: string
          subtitle?: string | null
          testimonials?: Json | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkouts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          merchant_id: string
          name: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          merchant_id: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          merchant_id?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id: string
          merchant_id: string
          metadata: Json | null
          payment_method: string | null
          product_id: string
          status: string | null
          traffic_page_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id?: string
          merchant_id: string
          metadata?: Json | null
          payment_method?: string | null
          product_id: string
          status?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          merchant_id?: string
          metadata?: Json | null
          payment_method?: string | null
          product_id?: string
          status?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_traffic_page_id_fkey"
            columns: ["traffic_page_id"]
            isOneToOne: false
            referencedRelation: "traffic_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pixel_configs: {
        Row: {
          created_at: string
          fb_access_token: string | null
          fb_pixel_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fb_access_token?: string | null
          fb_pixel_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fb_access_token?: string | null
          fb_pixel_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          is_registrations_open: boolean | null
          transaction_fee_percentage: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          is_registrations_open?: boolean | null
          transaction_fee_percentage?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          is_registrations_open?: boolean | null
          transaction_fee_percentage?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          custom_url: string | null
          delivery_file_url: string | null
          delivery_link: string | null
          delivery_type: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          pixel_id: string | null
          pixel_name: string | null
          pixel_token: string | null
          price: number
          status: string | null
          updated_at: string
          user_id: string
          warranty_days: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          custom_url?: string | null
          delivery_file_url?: string | null
          delivery_link?: string | null
          delivery_type?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          pixel_id?: string | null
          pixel_name?: string | null
          pixel_token?: string | null
          price: number
          status?: string | null
          updated_at?: string
          user_id: string
          warranty_days?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          custom_url?: string | null
          delivery_file_url?: string | null
          delivery_link?: string | null
          delivery_type?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          pixel_id?: string | null
          pixel_name?: string | null
          pixel_token?: string | null
          price?: number
          status?: string | null
          updated_at?: string
          user_id?: string
          warranty_days?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          payment_method: string | null
          payment_reference: string | null
          product_id: string | null
          status: string | null
          traffic_page_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          product_id?: string | null
          status?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          product_id?: string | null
          status?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_traffic_page_id_fkey"
            columns: ["traffic_page_id"]
            isOneToOne: false
            referencedRelation: "traffic_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          page_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          page_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traffic_events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "traffic_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_pages: {
        Row: {
          created_at: string
          id: string
          name: string
          tracking_id: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tracking_id?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tracking_id?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
