import { query, queryOne } from '../client';

export interface UserRow {
  id: number;
  display_name: string;
  created_at: Date;
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
