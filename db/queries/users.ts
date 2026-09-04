import { query, queryOne } from '../client';

export interface UserRow {
  id: number;
  display_name: string;
  created_at: Date;
  username: string | null;
  password_hash: string | null;
}

export async function createUser(displayName: string): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    'INSERT INTO users (display_name) VALUES ($1) RETURNING *',
    [displayName],
  );
  if (!row) throw new Error('createUser: insert returned no row');
  return row;
}

export async function getUser(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE username = $1', [username]);
}

export async function createUserWithCredentials(
  displayName: string,
  username: string,
  passwordHash: string,
): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    'INSERT INTO users (display_name, username, password_hash) VALUES ($1, $2, $3) RETURNING *',
    [displayName, username, passwordHash],
  );
  if (!row) throw new Error('createUserWithCredentials: insert returned no row');
  return row;
}
