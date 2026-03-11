import { RSI, MACD, EMA, ATR, SMA } from 'technicalindicators';
import { MarketData, IndicatorData } from '../types';

export function calculateIndicators(data: MarketData[]): IndicatorData | null {
  if (data.length < 50) return null; // Need enough data

  // Twelve Data returns newest first by default, we need oldest first for indicators
  const reversedData = [...data].reverse();

  const closePrices = reversedData.map(d => parseFloat(d.close));
  const highPrices = reversedData.map(d => parseFloat(d.high));
  const lowPrices = reversedData.map(d => parseFloat(d.low));
  const volumes = reversedData.map(d => parseFloat(d.volume));

  const rsiInput = {
    values: closePrices,
    period: 14
  };
  const rsiResult = RSI.calculate(rsiInput);
  const currentRsi = rsiResult[rsiResult.length - 1];

  const macdInput = {
    values: closePrices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  };
  const macdResult = MACD.calculate(macdInput);
  const currentMacd = macdResult[macdResult.length - 1];

  const ema20Result = EMA.calculate({ period: 20, values: closePrices });
  const currentEma20 = ema20Result[ema20Result.length - 1];

  const ema50Result = EMA.calculate({ period: 50, values: closePrices });
  const currentEma50 = ema50Result[ema50Result.length - 1];

  const atrResult = ATR.calculate({
    high: highPrices,
    low: lowPrices,
    close: closePrices,
    period: 14
  });
  const currentAtr = atrResult[atrResult.length - 1];

  const volumeAvgResult = SMA.calculate({ period: 20, values: volumes });
  const currentVolumeAvg = volumeAvgResult[volumeAvgResult.length - 1];
  const currentVolume = volumes[volumes.length - 1];

  if (currentRsi === undefined || currentMacd === undefined || currentEma20 === undefined || currentEma50 === undefined || currentAtr === undefined || currentVolumeAvg === undefined) {
    return null;
  }

  return {
    rsi: currentRsi,
    macd: {
      MACD: currentMacd.MACD || 0,
      signal: currentMacd.signal || 0,
      histogram: currentMacd.histogram || 0
    },
    ema20: currentEma20,
    ema50: currentEma50,
    atr: currentAtr,
    volumeAvg: currentVolumeAvg,
    currentVolume
  };
}

export function calculateProbabilities(indicators: IndicatorData, currentPrice: number, currentOpen: number) {
  let pointsUp = 0;
  let pointsDown = 0;

  // RSI
  if (indicators.rsi < 30) pointsUp += 20;
  if (indicators.rsi > 70) pointsDown += 20;

  // MACD
  if (indicators.macd.histogram > 0) pointsUp += 15; // Bullish
  if (indicators.macd.histogram < 0) pointsDown += 15; // Bearish

  // Volume
  if (indicators.currentVolume > indicators.volumeAvg) {
    // Volume comprador acima da média -> +25 pontos para alta
    // Volume vendedor acima da média -> +25 pontos para queda
    if (currentPrice > currentOpen) {
      pointsUp += 25; // Candle verde (comprador)
    } else if (currentPrice < currentOpen) {
      pointsDown += 25; // Candle vermelho (vendedor)
    }
  }

  // EMA
  if (indicators.ema20 > indicators.ema50) pointsUp += 10;
  if (indicators.ema20 < indicators.ema50) pointsDown += 10;

  const totalPoints = pointsUp + pointsDown;
  
  let probUp = 0;
  let probDown = 0;
  let probSideways = 0;

  if (totalPoints === 0) {
    probSideways = 100;
  } else {
    probUp = Math.round((pointsUp / totalPoints) * 100);
    probDown = Math.round((pointsDown / totalPoints) * 100);
    
    // If total points are low, allocate some to sideways
    if (totalPoints < 40) {
      probSideways = 100 - totalPoints;
      probUp = Math.round(probUp * (totalPoints / 100));
      probDown = Math.round(probDown * (totalPoints / 100));
    }
  }

  // Ensure they sum to 100
  const sum = probUp + probDown + probSideways;
  if (sum !== 100) {
    probSideways += (100 - sum);
  }

  return { probUp, probDown, probSideways };
}
