export type SessionStatus = "active" | "completed" | "expired" | "terminated";

export interface UserSession {
  id?: string;
  user_id: string;
  clinic_id: string | null;
  role: string;
  email: string;
  login_at: number;
  logout_at: number | null;
  last_activity_at: number;
  session_duration_seconds: number;
  ip_address?: string;
  country?: string;
  city?: string;
  user_agent?: string;
  device_type?: string; // "desktop", "mobile", "tablet"
  browser?: string;
  operating_system?: string;
  status: SessionStatus;
}

export interface ActivityEvent {
  id?: string;
  user_id: string;
  clinic_id: string | null;
  session_id: string;
  event_name: string;
  event_category?: string;
  page_path: string;
  created_at: number;
  metadata?: Record<string, any>; // No sensitive cleartext here
}

export type UserActivityStatus = 
  | "Çok Aktif"
  | "Aktif"
  | "Düşük Kullanım"
  | "Pasif"
  | "Hiç Giriş Yapmadı";

export interface UserAnalyticsSummary {
  user_id: string;
  name: string;
  email: string;
  role: string;
  clinic_id: string | null;
  clinic_name?: string;
  status: string;
  
  // Login metrics
  last_login_at: number | null;
  logins_today: number;
  logins_7d: number;
  logins_30d: number;
  logins_total: number;
  
  // Usage duration (seconds)
  duration_today: number;
  duration_7d: number;
  duration_30d: number;
  duration_total: number;
  
  last_activity_at: number | null;
  most_used_feature?: string;
  activity_status: UserActivityStatus;
}
