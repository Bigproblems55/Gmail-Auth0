export type Role = "user" | "admin" | "moderator";

export interface User {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;

  username: string | null;
  bio: string | null;
  phone: string | null;

  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal: string | null;
  address_country: string | null;

  role: Role;
}
