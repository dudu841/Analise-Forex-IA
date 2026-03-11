export interface MarketData {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface IndicatorData {
  rsi: number;
  macd: { MACD: number; signal: number; histogram: number };
  ema20: number;
  ema50: number;
  atr: number;
  volumeAvg: number;
  currentVolume: number;
}

export interface Prediction {
  id: number;
  asset: string;
  timestamp: string;
  entry_price: number;
  prob_up: number;
  prob_down: number;
  direction: 'BUY' | 'SELL';
  stop_loss: number;
  take_profit: number;
  status: 'PENDING' | 'WIN' | 'LOSS';
}
