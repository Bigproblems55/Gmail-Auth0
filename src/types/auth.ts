export type Role = "user" | "admin" | "moderator"; // Allowed roles in the UI.

export interface User {
  id: number; // Database primary key.
  email: string; // Email from Google.
  name: string | null; // Full name from profile.
  picture: string | null; // Avatar URL.

  username: string | null; // User-chosen handle.
  bio: string | null; // Short profile bio.
  phone: string | null; // Optional phone number.

  address_line1: string | null; // Address line 1.
  address_line2: string | null; // Address line 2.
  address_city: string | null; // City.
  address_state: string | null; // State/region.
  address_postal: string | null; // Postal/ZIP.
  address_country: string | null; // Country code.

  role: Role; // Permission level.
} // End User interface.
