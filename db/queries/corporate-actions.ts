import { query } from '../client';

export type CorporateActionType = 'split' | 'bonus' | 'dividend';

export interface CorporateActionRow {
  id: number;
  symbol: string;
  ex_date: string;
  type: CorporateActionType;
  ratio: number;
}

export interface InsertCorporateActionInput {
  symbol: string;
  exDate: string;
  type: CorporateActionType;
  ratio: number;
}

/** Idempotent by (symbol, ex_date, type): re-ingesting the same action is a no-op. */
export async function insertCorporateAction(input: InsertCorporateActionInput): Promise<void> {
  await query(
    `INSERT INTO corporate_actions (symbol, ex_date, type, ratio)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (symbol, ex_date, type) DO NOTHING`,
    [input.symbol, input.exDate, input.type, input.ratio],
  );
}

export async function listCorporateActions(symbol: string): Promise<CorporateActionRow[]> {
  return query<CorporateActionRow>(
    'SELECT * FROM corporate_actions WHERE symbol = $1 ORDER BY ex_date',
    [symbol],
  );
}
