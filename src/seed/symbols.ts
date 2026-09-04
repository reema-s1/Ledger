export interface SeedSymbol {
  symbol: string;
  name: string;
  sector: string;
}

export const SECTORS = ['IT', 'Banking', 'PSU Bank', 'NBFC', 'Pharma', 'Energy'] as const;
export type Sector = (typeof SECTORS)[number];

// 40 NSE-style symbols across 6 sectors, deliberately clustered so
// correlation clustering (Section 4) has real structure to find even
// before it's told what the sectors are.
export const SYMBOLS: SeedSymbol[] = [
  // IT (7)
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT' },
  { symbol: 'LTIM', name: 'LTIMindtree', sector: 'IT' },
  { symbol: 'MPHASIS', name: 'Mphasis', sector: 'IT' },
  // Banking (7)
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking' },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank', sector: 'Banking' },
  { symbol: 'FEDERALBNK', name: 'Federal Bank', sector: 'Banking' },
  { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank', sector: 'Banking' },
  // PSU Bank (6)
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'PSU Bank' },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda', sector: 'PSU Bank' },
  { symbol: 'PNB', name: 'Punjab National Bank', sector: 'PSU Bank' },
  { symbol: 'CANBK', name: 'Canara Bank', sector: 'PSU Bank' },
  { symbol: 'UNIONBANK', name: 'Union Bank of India', sector: 'PSU Bank' },
  { symbol: 'INDIANB', name: 'Indian Bank', sector: 'PSU Bank' },
  // NBFC (6)
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'NBFC' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'NBFC' },
  { symbol: 'CHOLAFIN', name: 'Cholamandalam Investment', sector: 'NBFC' },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', sector: 'NBFC' },
  { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance', sector: 'NBFC' },
  { symbol: 'LICHSGFIN', name: 'LIC Housing Finance', sector: 'NBFC' },
  // Pharma (7)
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', sector: 'Pharma' },
  { symbol: 'DRREDDY', name: "Dr. Reddy's Laboratories", sector: 'Pharma' },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Pharma' },
  { symbol: 'DIVISLAB', name: "Divi's Laboratories", sector: 'Pharma' },
  { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma', sector: 'Pharma' },
  { symbol: 'LUPIN', name: 'Lupin', sector: 'Pharma' },
  { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals', sector: 'Pharma' },
  // Energy (7)
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', sector: 'Energy' },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Energy' },
  { symbol: 'POWERGRID', name: 'Power Grid Corp', sector: 'Energy' },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Energy' },
  { symbol: 'BPCL', name: 'Bharat Petroleum', sector: 'Energy' },
  { symbol: 'TATAPOWER', name: 'Tata Power', sector: 'Energy' },
];

export const INDEX_SYMBOL = 'NIFTY';
