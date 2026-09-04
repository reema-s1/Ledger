import { query, queryOne } from '../client';

export interface SymbolRow {
  symbol: string;
  name: string;
  sector: string;
  is_active: boolean;
}

export async function upsertSymbol(row: SymbolRow): Promise<void> {
  await query(
    `INSERT INTO symbols (symbol, name, sector, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (symbol) DO UPDATE SET name = $2, sector = $3, is_active = $4`,
    [row.symbol, row.name, row.sector, row.is_active],
  );
}

export async function getSymbol(symbol: string): Promise<SymbolRow | null> {
  return queryOne<SymbolRow>('SELECT * FROM symbols WHERE symbol = $1', [symbol]);
}

export async function listActiveSymbols(): Promise<SymbolRow[]> {
  return query<SymbolRow>('SELECT * FROM symbols WHERE is_active ORDER BY symbol');
}
